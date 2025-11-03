import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, orderBy, limit, query, Timestamp, deleteDoc, doc } from 'firebase/firestore';

export const MEMORY_TYPES = {
  CORE_IDENTITY: 'core_identity',
  PREFERENCES: 'preferences',
  INTERESTS: 'interests',
  RELATIONSHIPS: 'relationships',
  ACHIEVEMENTS: 'achievements',
  FACTS: 'facts',
} as const;

export type MemoryType = typeof MEMORY_TYPES[keyof typeof MEMORY_TYPES];

export interface UserMemory {
  id?: string;
  text: string;            // Crisp, compact memory string
  type: MemoryType;        // Category
  importance: number;      // 1-10
  createdAt: Timestamp;    // Firestore timestamp
}

const getEnvInt = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

export async function fetchTopMemories(uid: string, topN?: number): Promise<UserMemory[]> {
  const n = topN ?? getEnvInt('NEXT_PUBLIC_TOP_MEMORIES_COUNT', 10);
  const ref = collection(db, 'users', uid, 'memories');
  try {
    // Single-field order avoids composite index requirement
    const q = query(ref, orderBy('importance', 'desc'), limit(n));
    const snap = await getDocs(q);
    // Client-side tie-breaker on createdAt for stable display
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as UserMemory[];
    const sortedDocs = docs.sort((a, b) => {
      if (a.importance !== b.importance) return b.importance - a.importance;
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
    });
    return sortedDocs;
  } catch (e) {
    // Fallback to unordered fetch if ordering requires an index
    const snap = await getDocs(ref);
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as UserMemory[];
    const sorted = docs.sort((a, b) => {
      if (a.importance !== b.importance) return b.importance - a.importance;
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
    });
    return sorted.slice(0, n);
  }
}

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function addMemoriesWithLimit(uid: string, memories: Array<Omit<UserMemory,'createdAt'|'id'>>): Promise<void> {
  if (!memories || memories.length === 0) return;
  const maxMemories = getEnvInt('NEXT_PUBLIC_MEMORY_LIMIT', 100);
  const ref = collection(db, 'users', uid, 'memories');

  // Fetch existing memories to enforce limit
  let existing: UserMemory[] = [];
  try {
    const existingSnap = await getDocs(query(ref, orderBy('importance', 'desc')));
    existing = existingSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as UserMemory[];
  } catch (e) {
    const fallbackSnap = await getDocs(ref);
    existing = fallbackSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as UserMemory[];
  }
  // Build a normalized set for duplicate detection
  const existingSet = new Set(existing.map(m => normalize(m.text)));

  // Determine how many we can add, and which to evict if needed
  for (const mem of memories) {
    const norm = normalize(mem.text);
    if (!norm) continue;
    if (existingSet.has(norm)) {
      // skip duplicates
      continue;
    }
    const totalIfAdded = existing.length + 1;
    if (totalIfAdded > maxMemories) {
      // Find least important (tie-breaker: oldest)
      const least = [...existing].sort((a, b) => {
        if (a.importance !== b.importance) return a.importance - b.importance;
        return a.createdAt.toMillis() - b.createdAt.toMillis();
      })[0];
      if (!least) break;
      // Only evict if new memory is more important than the least
      if (mem.importance > least.importance) {
        await deleteDoc(doc(db, 'users', uid, 'memories', least.id!));
        const idx = existing.findIndex(e => e.id === least.id);
        if (idx >= 0) existing.splice(idx, 1);
      } else {
        // Skip adding this memory (not important enough)
        continue;
      }
    }

    await addDoc(ref, { ...mem, createdAt: Timestamp.now() });
    existing.push({ ...(mem as any), createdAt: Timestamp.now() });
    existingSet.add(norm);
  }
}


