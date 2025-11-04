import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts?: number; // client timestamp (ms)
}

export interface ConversationDoc {
  sessionId: string;
  mode: 'realtime' | 'stt';
  startedAt: number; // client timestamp
  updatedAt: number;
  messages: ConversationMessage[];
  continuationId?: string; // If this is a continuation, link to previous part
}

// Firestore document size limit: 1 MB (1,048,576 bytes)
// We'll split at ~800KB (80%) to leave safety margin
const MAX_DOCUMENT_SIZE_BYTES = 800 * 1024; // 800KB

// Estimate size of a message in bytes (rough approximation)
function estimateMessageSize(msg: ConversationMessage): number {
  // Overhead: role (~20 bytes), ts (8 bytes), structure (~30 bytes) = ~58 bytes
  // Content: UTF-8 byte length
  const contentBytes = new TextEncoder().encode(msg.content).length;
  return 58 + contentBytes;
}

// Estimate total document size
function estimateDocumentSize(doc: ConversationDoc): number {
  // Base document overhead: sessionId, mode, startedAt, updatedAt, continuationId (~200 bytes)
  let size = 200;
  // Add messages
  for (const msg of doc.messages) {
    size += estimateMessageSize(msg);
  }
  return size;
}

export async function startConversationSession(
  uid: string,
  sessionId: string,
  mode: 'realtime' | 'stt',
): Promise<void> {
  const ref = doc(db, 'users', uid, 'conversations', sessionId);
  const now = Date.now();
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const payload: ConversationDoc = {
      sessionId,
      mode,
      startedAt: now,
      updatedAt: now,
      messages: [],
    };
    await setDoc(ref, payload, { merge: true });
  }
}

export async function appendConversationChunk(
  uid: string,
  sessionId: string,
  messages: ConversationMessage[],
): Promise<{ sessionId: string; wasSplit: boolean }> {
  if (!messages || messages.length === 0) return { sessionId, wasSplit: false };
  
  const ref = doc(db, 'users', uid, 'conversations', sessionId);
  const snap = await getDoc(ref);
  
  if (!snap.exists()) {
    // Document should have been created by startConversationSession, but if it doesn't exist, create it now
    // This is a fallback - in normal flow, startConversationSession is called first
    console.warn(`[conv] Document ${sessionId} doesn't exist, creating with default mode 'stt'`);
    await startConversationSession(uid, sessionId, 'stt');
    const newSnap = await getDoc(ref);
    if (!newSnap.exists()) {
      throw new Error(`Failed to create conversation document ${sessionId}`);
    }
  }
  
  const existing = snap.exists() ? (snap.data() as ConversationDoc) : (await getDoc(ref)).data() as ConversationDoc;
  if (!existing) {
    throw new Error(`Failed to load conversation document ${sessionId}`);
  }

  const withTs = messages.map(m => ({ ...m, ts: m.ts ?? Date.now() }));
  const updated = [...existing.messages, ...withTs];
  
  // Estimate size with new messages
  const testDoc: ConversationDoc = {
    ...existing,
    messages: updated,
    updatedAt: Date.now(),
  };
  const estimatedSize = estimateDocumentSize(testDoc);

  // If approaching limit, create continuation document
  if (estimatedSize >= MAX_DOCUMENT_SIZE_BYTES) {
    // Create new continuation document
    const continuationId = `${sessionId}-p${Math.floor(Date.now() / 1000)}`;
    const continuationDoc: ConversationDoc = {
      sessionId: continuationId,
      mode: existing.mode,
      startedAt: existing.startedAt, // Keep original start time
      updatedAt: Date.now(),
      messages: withTs, // Start continuation with new messages only
      continuationId: sessionId, // Link back to previous part
    };
    const continuationRef = doc(db, 'users', uid, 'conversations', continuationId);
    await setDoc(continuationRef, continuationDoc, { merge: true });
    
    // Mark original document with continuation link
    await setDoc(ref, { continuationId }, { merge: true });
    
    console.log(`[conv] Document ${sessionId} split at ~${Math.round(estimatedSize / 1024)}KB, continuing in ${continuationId}`);
    return { sessionId: continuationId, wasSplit: true };
  }

  // Normal append within limit
  await setDoc(ref, { messages: updated, updatedAt: Date.now() }, { merge: true });
  return { sessionId, wasSplit: false };
}


