"""
Conversation management for Firebase operations.
Ports functionality from lib/conversations.ts.
"""
import logging
from typing import List, Optional, Literal
from dataclasses import dataclass
from firebase_admin import firestore
from firebase_admin import credentials, initialize_app

logger = logging.getLogger(__name__)


@dataclass
class ConversationMessage:
    """Conversation message."""
    role: Literal["user", "assistant", "system"]
    content: str
    ts: Optional[float] = None  # Timestamp in seconds


@dataclass
class ConversationDoc:
    """Conversation document structure."""
    session_id: str
    mode: Literal["realtime", "stt"]
    started_at: float
    updated_at: float
    messages: List[ConversationMessage]
    continuation_id: Optional[str] = None


# Firestore document size limit: 1 MB (1,048,576 bytes)
# We'll split at ~800KB (80%) to leave safety margin
MAX_DOCUMENT_SIZE_BYTES = 800 * 1024  # 800KB


def _estimate_message_size(msg: ConversationMessage) -> int:
    """Estimate size of a message in bytes."""
    # Overhead: role (~20 bytes), ts (8 bytes), structure (~30 bytes) = ~58 bytes
    # Content: UTF-8 byte length
    content_bytes = len(msg.content.encode("utf-8"))
    return 58 + content_bytes


def _estimate_document_size(doc: ConversationDoc) -> int:
    """Estimate total document size."""
    # Base document overhead: sessionId, mode, startedAt, updatedAt, continuationId (~200 bytes)
    size = 200
    # Add messages
    for msg in doc.messages:
        size += _estimate_message_size(msg)
    return size


def _get_db() -> firestore.Client:
    """Get Firestore database client."""
    try:
        return firestore.client()
    except ValueError:
        # Firebase not initialized, initialize it
        from .config import config
        cred = credentials.Certificate(config.FIREBASE_CREDENTIALS_PATH)
        initialize_app(cred)
        return firestore.client()


def start_conversation_session(
    uid: str,
    session_id: str,
    mode: Literal["realtime", "stt"] = "stt"
) -> None:
    """
    Start a new conversation session.
    Ports startConversationSession() from lib/conversations.ts.
    
    Args:
        uid: Firebase user ID
        session_id: Unique session ID
        mode: Conversation mode ('realtime' or 'stt')
    """
    db = _get_db()
    ref = db.collection("users").document(uid).collection("conversations").document(session_id)
    
    try:
        doc_snap = ref.get()
        if not doc_snap.exists:
            ref.set({
                "sessionId": session_id,
                "mode": mode,
                "startedAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "messages": []
            }, merge=True)
            logger.info(f"Started conversation session: {session_id}")
    except Exception as e:
        logger.error(f"Failed to start conversation session: {e}")
        raise


def append_conversation_chunk(
    uid: str,
    session_id: str,
    messages: List[ConversationMessage]
) -> dict:
    """
    Append messages to conversation, handling document size limits.
    Ports appendConversationChunk() from lib/conversations.ts.
    
    Args:
        uid: Firebase user ID
        session_id: Session ID
        messages: List of messages to append
    
    Returns:
        Dict with 'sessionId' and 'wasSplit' boolean
    """
    if not messages:
        return {"sessionId": session_id, "wasSplit": False}
    
    db = _get_db()
    ref = db.collection("users").document(uid).collection("conversations").document(session_id)
    
    try:
        doc_snap = ref.get()
        
        if not doc_snap.exists:
            logger.warning(f"Document {session_id} doesn't exist, creating with default mode 'stt'")
            start_conversation_session(uid, session_id, "stt")
            doc_snap = ref.get()
            if not doc_snap.exists:
                raise Exception(f"Failed to create conversation document {session_id}")
        
        data = doc_snap.to_dict()
        if not data:
            raise Exception(f"Failed to load conversation document {session_id}")
        
        # Get existing messages
        existing_messages = []
        for msg_data in data.get("messages", []):
            existing_messages.append(ConversationMessage(
                role=msg_data.get("role", "user"),
                content=msg_data.get("content", ""),
                ts=msg_data.get("ts")
            ))
        
        # Get timestamps
        started_at = data.get("startedAt")
        if hasattr(started_at, "timestamp"):
            started_at_seconds = started_at.timestamp()
        elif isinstance(started_at, dict) and "_seconds" in started_at:
            started_at_seconds = started_at["_seconds"]
        else:
            started_at_seconds = 0
        
        # Add timestamps to new messages
        import time
        current_time = time.time()
        with_ts = [
            ConversationMessage(
                role=msg.role,
                content=msg.content,
                ts=msg.ts or current_time
            )
            for msg in messages
        ]
        
        updated = existing_messages + with_ts
        
        # Estimate size with new messages
        test_doc = ConversationDoc(
            session_id=session_id,
            mode=data.get("mode", "stt"),
            started_at=started_at_seconds,
            updated_at=current_time,
            messages=updated,
            continuation_id=data.get("continuationId")
        )
        estimated_size = _estimate_document_size(test_doc)
        
        # If approaching limit, create continuation document
        if estimated_size >= MAX_DOCUMENT_SIZE_BYTES:
            continuation_id = f"{session_id}-p{int(current_time)}"
            
            continuation_ref = db.collection("users").document(uid).collection("conversations").document(continuation_id)
            continuation_ref.set({
                "sessionId": continuation_id,
                "mode": data.get("mode", "stt"),
                "startedAt": data.get("startedAt"),  # Keep original start time
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "messages": [
                    {
                        "role": msg.role,
                        "content": msg.content,
                        "ts": msg.ts
                    }
                    for msg in with_ts
                ],
                "continuationId": session_id
            }, merge=True)
            
            # Mark original document with continuation link
            ref.update({"continuationId": continuation_id})
            
            logger.info(f"Document {session_id} split at ~{estimated_size // 1024}KB, continuing in {continuation_id}")
            return {"sessionId": continuation_id, "wasSplit": True}
        
        # Normal append within limit
        ref.update({
            "messages": [
                {
                    "role": msg.role,
                    "content": msg.content,
                    "ts": msg.ts
                }
                for msg in updated
            ],
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
        
        return {"sessionId": session_id, "wasSplit": False}
    
    except Exception as e:
        logger.error(f"Failed to append conversation chunk: {e}")
        raise

