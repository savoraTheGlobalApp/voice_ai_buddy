"""
Memory service for Firebase operations.
Ports logic from lib/memories.ts to backend.
"""
import logging
import re
from typing import List, Optional
from dataclasses import dataclass
from firebase_admin import firestore

from .firebase_service import get_db

logger = logging.getLogger(__name__)


@dataclass
class UserMemory:
    """User memory data structure."""
    id: Optional[str] = None
    text: str = ""
    type: str = "facts"
    importance: int = 3
    created_at: Optional[any] = None


@dataclass
class MemoryCandidate:
    """Memory candidate from extraction."""
    text: str
    type: str
    importance: int


def _normalize(text: str) -> str:
    """Normalize text for duplicate detection."""
    return re.sub(r"[^a-z0-9\s]", "", text.lower()).strip()


def _get_timestamp_seconds(created_at: any) -> float:
    """Extract timestamp in seconds from Firestore timestamp."""
    if hasattr(created_at, "timestamp"):
        return created_at.timestamp()
    elif isinstance(created_at, dict) and "_seconds" in created_at:
        return created_at["_seconds"]
    return 0.0


def fetch_top_memories(uid: str, top_n: int = 10) -> List[UserMemory]:
    """
    Fetch top N memories for a user, sorted by importance.
    Ports fetchTopMemories() from lib/memories.ts.
    
    Args:
        uid: Firebase user ID
        top_n: Number of memories to fetch
    
    Returns:
        List of UserMemory objects sorted by importance
    """
    db = get_db()
    memories_ref = db.collection("users").document(uid).collection("memories")
    
    try:
        # Try to order by importance
        query = memories_ref.order_by("importance", direction=firestore.Query.DESCENDING).limit(top_n)
        docs = query.stream()
        
        memories_with_timestamps = []
        for doc_snap in docs:
            data = doc_snap.to_dict()
            created_at = data.get("createdAt")
            created_at_seconds = _get_timestamp_seconds(created_at)
            
            memories_with_timestamps.append((
                UserMemory(
                    id=doc_snap.id,
                    text=data.get("text", ""),
                    type=data.get("type", "facts"),
                    importance=data.get("importance", 3),
                    created_at=created_at
                ),
                created_at_seconds
            ))
        
        # Sort by importance (desc), then by createdAt (desc)
        memories_with_timestamps.sort(key=lambda x: (-x[0].importance, -x[1]))
        memories = [m[0] for m in memories_with_timestamps]
        
        return memories[:top_n]
    
    except Exception as e:
        logger.warning(f"Failed to fetch memories with ordering: {e}, falling back to unordered fetch")
        # Fallback to unordered fetch
        docs = list(memories_ref.limit(top_n * 2).stream())
        
        memories_with_timestamps = []
        for doc_snap in docs:
            data = doc_snap.to_dict()
            created_at = data.get("createdAt")
            created_at_seconds = _get_timestamp_seconds(created_at)
            
            memories_with_timestamps.append((
                UserMemory(
                    id=doc_snap.id,
                    text=data.get("text", ""),
                    type=data.get("type", "facts"),
                    importance=data.get("importance", 3),
                    created_at=created_at
                ),
                created_at_seconds
            ))
        
        # Sort by importance, then by createdAt
        memories_with_timestamps.sort(key=lambda x: (-x[0].importance, -x[1]))
        memories = [m[0] for m in memories_with_timestamps]
        
        return memories[:top_n]


def add_memories_with_limit(
    uid: str,
    memories: List[MemoryCandidate],
    user_name: Optional[str] = None,
    max_memories: int = 100
) -> None:
    """
    Add memories with limit enforcement and duplicate detection.
    Ports addMemoriesWithLimit() from lib/memories.ts.
    
    Args:
        uid: Firebase user ID
        memories: List of memory candidates to add
        user_name: User's name for crispifying memory text (optional)
        max_memories: Maximum number of memories per user
    """
    if not memories:
        return
    
    db = get_db()
    memories_ref = db.collection("users").document(uid).collection("memories")
    
    # Crispify function (simplified version)
    def crispify_memory_text(text: str, name: Optional[str] = None) -> str:
        """Crispify memory text by removing user name and connectors."""
        if not text:
            return text
        t = text.strip()
        if name and len(name) > 0:
            name_escaped = re.escape(name)
            t = re.sub(f"^{name_escaped}'s\\s+", "", t, flags=re.IGNORECASE)
            t = re.sub(f"^{name_escaped}\\s+(is|has|likes|loves|enjoys)\\s+", "", t, flags=re.IGNORECASE)
            t = re.sub(f"^{name_escaped}\\s+", "", t, flags=re.IGNORECASE)
        t = re.sub(r"\s+is\s+", ": ", t, flags=re.IGNORECASE)
        t = re.sub(r"\s+has\s+", ": ", t, flags=re.IGNORECASE)
        t = re.sub(r"\s+are\s+", ": ", t, flags=re.IGNORECASE)
        t = re.sub(r"\s+likes\s+", ": ", t, flags=re.IGNORECASE)
        t = re.sub(r"\s+loves\s+", ": ", t, flags=re.IGNORECASE)
        t = re.sub(r"\s+enjoys\s+", ": ", t, flags=re.IGNORECASE)
        t = re.sub(r"^my\s+", "", t, flags=re.IGNORECASE)
        t = re.sub(r"^i\s+(am|have|like|love|enjoy)\s+", "", t, flags=re.IGNORECASE)
        return t.strip()
    
    # Fetch existing memories
    existing = []
    try:
        query = memories_ref.order_by("importance", direction=firestore.Query.DESCENDING)
        docs = query.stream()
        for doc_snap in docs:
            data = doc_snap.to_dict()
            created_at = data.get("createdAt")
            created_at_seconds = _get_timestamp_seconds(created_at)
            
            existing.append((
                UserMemory(
                    id=doc_snap.id,
                    text=data.get("text", ""),
                    type=data.get("type", "facts"),
                    importance=data.get("importance", 3),
                    created_at=created_at
                ),
                created_at_seconds
            ))
    except Exception as e:
        logger.warning(f"Failed to fetch existing memories with ordering: {e}, using unordered fetch")
        docs = memories_ref.stream()
        for doc_snap in docs:
            data = doc_snap.to_dict()
            existing.append((
                UserMemory(
                    id=doc_snap.id,
                    text=data.get("text", ""),
                    type=data.get("type", "facts"),
                    importance=data.get("importance", 3),
                    created_at=data.get("createdAt")
                ),
                0.0
            ))
    
    # Build normalized set for duplicate detection
    existing_set = {_normalize(m[0].text) for m in existing}
    
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
            
            existing_sorted = sorted(existing, key=lambda x: (x[0].importance, x[1]))
            least = existing_sorted[0][0]
            
            # Only evict if new memory is more important
            if mem.importance > least.importance:
                if least.id:
                    try:
                        memories_ref.document(least.id).delete()
                    except Exception as e:
                        logger.error(f"Failed to delete memory {least.id}: {e}")
                
                existing.remove(existing_sorted[0])
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
            existing.append((new_memory, 0.0))
            existing_set.add(norm)
        except Exception as e:
            logger.error(f"Failed to add memory: {e}")
    
    # Final safety: trim to limit
    _trim_memories_to_limit(uid, max_memories)


def _trim_memories_to_limit(uid: str, max_memories: int) -> None:
    """Trim memories collection to limit."""
    db = get_db()
    memories_ref = db.collection("users").document(uid).collection("memories")
    
    docs = list(memories_ref.stream())
    if len(docs) <= max_memories:
        return
    
    # Sort by least important first, then oldest first
    memories_with_timestamps = []
    for doc_snap in docs:
        data = doc_snap.to_dict()
        created_at = data.get("createdAt")
        created_at_seconds = _get_timestamp_seconds(created_at)
        
        memories_with_timestamps.append((
            doc_snap,
            data.get("importance", 3),
            created_at_seconds
        ))
    
    memories_with_timestamps.sort(key=lambda x: (x[1], x[2]))  # importance, then age
    
    # Delete excess
    to_delete = memories_with_timestamps[:len(docs) - max_memories]
    for doc_snap, _, _ in to_delete:
        try:
            doc_snap.reference.delete()
        except Exception as e:
            logger.error(f"Failed to delete memory during trim: {e}")

