"""
Memory management for Firebase operations.
Ports functionality from lib/memories.ts.
"""
import logging
from typing import List, Optional
from dataclasses import dataclass
from firebase_admin import firestore
from firebase_admin import credentials, initialize_app

from .instruction_builder import UserMemory, crispify_memory_text

logger = logging.getLogger(__name__)


# Memory types matching frontend
MEMORY_TYPES = {
    "CORE_IDENTITY": "core_identity",
    "PREFERENCES": "preferences",
    "INTERESTS": "interests",
    "RELATIONSHIPS": "relationships",
    "ACHIEVEMENTS": "achievements",
    "FACTS": "facts",
}


@dataclass
class MemoryCandidate:
    """Memory candidate from extraction API."""
    text: str
    type: str
    importance: int


def _normalize(text: str) -> str:
    """Normalize text for duplicate detection."""
    import re
    return re.sub(r"[^a-z0-9\s]", "", text.lower()).strip()


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


def fetch_top_memories(uid: str, top_n: Optional[int] = None) -> List[UserMemory]:
    """
    Fetch top N memories for a user, sorted by importance.
    Ports fetchTopMemories() from lib/memories.ts.
    
    Args:
        uid: Firebase user ID
        top_n: Number of memories to fetch (default from config)
    
    Returns:
        List of UserMemory objects sorted by importance
    """
    from .config import config
    
    # Use fallback default if remote config not available (legacy function, not async)
    # In practice, use api_client.get_top_memories() which uses remote config
    n = top_n or config._FALLBACK_TOP_MEMORIES_COUNT
    db = _get_db()
    memories_ref = db.collection("users").document(uid).collection("memories")
    
    try:
        # Try to order by importance
        query = memories_ref.order_by("importance", direction=firestore.Query.DESCENDING).limit(n)
        docs = query.stream()
        
        memories_with_timestamps = []
        for doc_snap in docs:
            data = doc_snap.to_dict()
            created_at = data.get("createdAt")
            created_at_seconds = 0.0
            if hasattr(created_at, "timestamp"):
                created_at_seconds = created_at.timestamp()
            elif isinstance(created_at, dict) and "_seconds" in created_at:
                created_at_seconds = created_at["_seconds"]
            
            memories_with_timestamps.append((
                UserMemory(
                    id=doc_snap.id,
                    text=data.get("text", ""),
                    type=data.get("type", "facts"),
                    importance=data.get("importance", 3)
                ),
                created_at_seconds
            ))
        
        # Sort by importance (desc), then by createdAt (desc)
        memories_with_timestamps.sort(key=lambda x: (-x[0].importance, -x[1]))
        memories = [m[0] for m in memories_with_timestamps]
        
        return memories[:n]
    
    except Exception as e:
        logger.warning(f"Failed to fetch memories with ordering: {e}, falling back to unordered fetch")
        # Fallback to unordered fetch
        docs = memories_ref.limit(n * 2).stream()  # Fetch more for sorting
        
        memories = []
        for doc_snap in docs:
            data = doc_snap.to_dict()
            created_at = data.get("createdAt")
            created_at_seconds = 0
            if hasattr(created_at, "timestamp"):
                created_at_seconds = created_at.timestamp()
            elif isinstance(created_at, dict) and "_seconds" in created_at:
                created_at_seconds = created_at["_seconds"]
            
            memories.append(UserMemory(
                id=doc_snap.id,
                text=data.get("text", ""),
                type=data.get("type", "facts"),
                importance=data.get("importance", 3)
            ))
        
        # Sort by importance, then by createdAt
        memories.sort(key=lambda m: (
            -m.importance,
            -created_at_seconds
        ))
        
        return memories[:n]


def add_memories_with_limit(
    uid: str,
    memories: List[MemoryCandidate],
    user_name: Optional[str] = None
) -> None:
    """
    Add memories with limit enforcement and duplicate detection.
    Ports addMemoriesWithLimit() from lib/memories.ts.
    
    Args:
        uid: Firebase user ID
        memories: List of memory candidates to add
        user_name: User's name for crispifying memory text
    """
    from .config import config
    
    if not memories:
        return
    
    # Use fallback default if remote config not available (legacy function, not async)
    # In practice, use api_client.save_memories() which uses remote config
    max_memories = config._FALLBACK_MEMORY_LIMIT
    db = _get_db()
    memories_ref = db.collection("users").document(uid).collection("memories")
    
    # Fetch existing memories
    existing = []
    try:
        query = memories_ref.order_by("importance", direction=firestore.Query.DESCENDING)
        docs = query.stream()
        for doc_snap in docs:
            data = doc_snap.to_dict()
            created_at = data.get("createdAt")
            created_at_seconds = 0
            if hasattr(created_at, "timestamp"):
                created_at_seconds = created_at.timestamp()
            elif isinstance(created_at, dict) and "_seconds" in created_at:
                created_at_seconds = created_at["_seconds"]
            
            existing.append(UserMemory(
                id=doc_snap.id,
                text=data.get("text", ""),
                type=data.get("type", "facts"),
                importance=data.get("importance", 3)
            ))
    except Exception as e:
        logger.warning(f"Failed to fetch existing memories with ordering: {e}, using unordered fetch")
        docs = memories_ref.stream()
        for doc_snap in docs:
            data = doc_snap.to_dict()
            existing.append(UserMemory(
                id=doc_snap.id,
                text=data.get("text", ""),
                type=data.get("type", "facts"),
                importance=data.get("importance", 3)
            ))
    
    # Build normalized set for duplicate detection
    existing_set = {_normalize(m.text) for m in existing}
    
    # Process each new memory
    for mem in memories:
        # Crispify memory text
        crisp_text = crispify_memory_text(mem.text, user_name)
        if not crisp_text:
            continue
        
        norm = _normalize(crisp_text)
        if not norm:
            continue
        
        if norm in existing_set:
            # Skip duplicates
            continue
        
        total_if_added = len(existing) + 1
        if total_if_added > max_memories:
            # Find least important (tie-breaker: oldest)
            if not existing:
                break
            
            # Get timestamps for existing memories
            existing_with_timestamps = []
            for mem in existing:
                # Fetch the document to get createdAt
                try:
                    doc_snap = memories_ref.document(mem.id).get()
                    if doc_snap.exists:
                        data = doc_snap.to_dict()
                        created_at = data.get("createdAt")
                        created_at_seconds = 0.0
                        if hasattr(created_at, "timestamp"):
                            created_at_seconds = created_at.timestamp()
                        elif isinstance(created_at, dict) and "_seconds" in created_at:
                            created_at_seconds = created_at["_seconds"]
                        existing_with_timestamps.append((mem, created_at_seconds))
                    else:
                        existing_with_timestamps.append((mem, 0.0))
                except Exception:
                    existing_with_timestamps.append((mem, 0.0))
            
            existing_sorted = sorted(existing_with_timestamps, key=lambda x: (x[0].importance, x[1]))
            least = existing_sorted[0][0]
            least = existing_sorted[0]
            
            # Only evict if new memory is more important
            if mem.importance > least.importance:
                if least.id:
                    try:
                        memories_ref.document(least.id).delete()
                    except Exception as e:
                        logger.error(f"Failed to delete memory {least.id}: {e}")
                
                existing.remove(least)
                existing_set.discard(_normalize(least.text))
            else:
                # Skip adding this memory (not important enough)
                continue
        
        # Add new memory
        try:
            doc_ref = memories_ref.document()
            doc_ref.set({
                "text": crisp_text,
                "type": mem.type,
                "importance": mem.importance,
                "createdAt": firestore.SERVER_TIMESTAMP
            })
            
            # Update local state
            new_memory = UserMemory(
                id=doc_ref.id,
                text=crisp_text,
                type=mem.type,
                importance=mem.importance
            )
            existing.append(new_memory)
            existing_set.add(norm)
        except Exception as e:
            logger.error(f"Failed to add memory: {e}")
    
    # Final safety: trim to limit
    _trim_memories_to_limit(uid, max_memories)


def _trim_memories_to_limit(uid: str, max_memories: int) -> None:
    """Trim memories collection to limit."""
    db = _get_db()
    memories_ref = db.collection("users").document(uid).collection("memories")
    
    docs = list(memories_ref.stream())
    if len(docs) <= max_memories:
        return
    
    # Sort by least important first, then oldest first
    memories_with_docs = []
    for doc_snap in docs:
        data = doc_snap.to_dict()
        created_at = data.get("createdAt")
        created_at_seconds = 0
        if hasattr(created_at, "timestamp"):
            created_at_seconds = created_at.timestamp()
        elif isinstance(created_at, dict) and "_seconds" in created_at:
            created_at_seconds = created_at["_seconds"]
        
        memories_with_docs.append((
            doc_snap,
            data.get("importance", 3),
            created_at_seconds
        ))
    
    memories_with_docs.sort(key=lambda x: (x[1], x[2]))  # importance, then age
    
    # Delete excess
    to_delete = memories_with_docs[:len(docs) - max_memories]
    for doc_snap, _, _ in to_delete:
        try:
            doc_snap.reference.delete()
        except Exception as e:
            logger.error(f"Failed to delete memory during trim: {e}")

