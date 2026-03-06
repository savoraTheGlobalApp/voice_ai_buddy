"""
Static Story Service
Handles fetching and managing static mythological stories.
"""
import logging
import time
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# In-memory cache — 10 min TTL, drastically cuts Firestore reads
_story_list_cache: dict = {}   # category_key → (stories, timestamp)
_STORY_LIST_TTL = 600          # 10 minutes


async def get_static_story(story_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch a single static story by ID from Firestore.

    Args:
        story_id: Story identifier (e.g., "maha-001")

    Returns:
        Story document as dictionary, or None if not found
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            logger.warning("Firebase not available")
            return None

        db = get_db()
        doc_ref = db.collection("static_stories").document(story_id)
        doc = doc_ref.get()

        if not doc.exists:
            logger.warning(f"Static story {story_id} not found")
            return None

        story_data = doc.to_dict()
        story_data["story_id"] = doc.id

        logger.info(f"Retrieved static story: {story_id}")
        return story_data

    except Exception as e:
        logger.error(f"Failed to fetch static story {story_id}: {e}")
        raise


async def list_static_stories(
    category: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    List all available static stories from Firestore.
    Returns story metadata without full segments for performance.

    Args:
        category: Optional category filter (mahabharata, ramayana, etc.)
        limit: Maximum number of stories to return
        offset: Number of stories to skip

    Returns:
        List of story metadata dictionaries
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            logger.warning("Firebase not available")
            return []

        # Return cached result if fresh
        cache_key = category or "__all__"
        cached = _story_list_cache.get(cache_key)
        if cached and (time.time() - cached[1]) < _STORY_LIST_TTL:
            stories = cached[0]
            start_idx = offset
            end_idx = offset + limit if limit > 0 else len(stories)
            return stories[start_idx:end_idx]

        db = get_db()

        # Get all stories first (Firestore ordering with missing fields is tricky)
        query = db.collection("static_stories")

        # Filter by category if provided
        if category:
            query = query.where("category", "==", category)

        # Execute query
        docs = query.stream()
        all_stories = []

        for doc in docs:
            story_data = doc.to_dict()

            # Return lightweight version without full segments
            # This improves performance for listing many stories
            story_metadata = {
                "story_id": doc.id,
                "title": story_data.get("title"),
                "category": story_data.get("category"),
                "values": story_data.get("values", []),
                "characters": story_data.get("characters", []),
                "metadata": story_data.get("metadata", {}),
                "created_at": story_data.get("created_at"),
                "cover_image_url": story_data.get("cover_image_url"),
                # Include segment count but not full segments
                "segment_count": len(story_data.get("segments", []))
            }

            all_stories.append(story_metadata)

        # Sort by created_at (newest first), handling missing timestamps
        # Stories without created_at go to the end
        all_stories.sort(
            key=lambda x: x.get("created_at") or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True
        )

        # Cache the full sorted list before pagination
        _story_list_cache[cache_key] = (all_stories, time.time())
        logger.info(f"Cached {len(all_stories)} stories (category: {category or 'all'})")

        # Apply pagination in Python
        start_idx = offset
        end_idx = offset + limit if limit > 0 else len(all_stories)
        stories = all_stories[start_idx:end_idx]

        logger.info(f"Retrieved {len(stories)} static stories (category: {category or 'all'})")
        return stories

    except Exception as e:
        logger.error(f"Failed to list static stories: {e}")
        raise


async def get_user_story_progress(uid: str, story_id: str) -> Optional[Dict[str, Any]]:
    """
    Get user's progress on a specific story.

    Args:
        uid: User ID
        story_id: Story identifier

    Returns:
        Progress document or None if not started
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            return None

        db = get_db()
        progress_ref = (
            db.collection("users")
            .document(uid)
            .collection("story_progress")
            .document(story_id)
        )

        doc = progress_ref.get()

        if not doc.exists:
            # Story not started yet
            return {
                "story_id": story_id,
                "status": "not_started",
                "current_segment": 0,
                "quiz_score": 0,
                "quiz_attempts": 0,
                "is_favorite": False
            }

        progress = doc.to_dict()
        progress["story_id"] = story_id
        return progress

    except Exception as e:
        logger.error(f"Failed to get progress for {uid}/{story_id}: {e}")
        return None


async def update_story_progress(
    uid: str,
    story_id: str,
    current_segment: int,
    status: str = "in_progress"
) -> Dict[str, Any]:
    """
    Update user's reading progress on a story.

    Args:
        uid: User ID
        story_id: Story identifier
        current_segment: Current segment index (0-4)
        status: "not_started" | "in_progress" | "completed"

    Returns:
        Updated progress document
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            raise Exception("Firebase not available")

        db = get_db()
        progress_ref = (
            db.collection("users")
            .document(uid)
            .collection("story_progress")
            .document(story_id)
        )

        now = datetime.now(timezone.utc)

        # Get existing progress or create new
        existing = progress_ref.get()
        if existing.exists:
            progress_data = existing.to_dict()
        else:
            progress_data = {
                "story_id": story_id,
                "status": "not_started",
                "current_segment": 0,
                "quiz_score": 0,
                "quiz_attempts": 0,
                "is_favorite": False,
                "created_at": now
            }

        # Update progress
        progress_data["current_segment"] = current_segment
        progress_data["status"] = status
        progress_data["last_read_at"] = now

        if status == "completed" and not progress_data.get("completed_at"):
            progress_data["completed_at"] = now

        # Save to Firestore
        progress_ref.set(progress_data)

        logger.info(f"Updated progress for {uid}/{story_id}: segment {current_segment}, status {status}")

        # Return without Firebase-specific timestamp objects
        result = dict(progress_data)
        result["last_read_at"] = now.isoformat()
        if result.get("created_at"):
            result["created_at"] = result["created_at"].isoformat() if hasattr(result["created_at"], "isoformat") else str(result["created_at"])
        if result.get("completed_at"):
            result["completed_at"] = result["completed_at"].isoformat() if hasattr(result["completed_at"], "isoformat") else str(result["completed_at"])

        return result

    except Exception as e:
        logger.error(f"Failed to update progress for {uid}/{story_id}: {e}")
        raise


async def get_all_user_progress(uid: str) -> List[Dict[str, Any]]:
    """
    Get user's progress on all static stories.

    Args:
        uid: User ID

    Returns:
        List of progress documents
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            return []

        db = get_db()
        progress_collection = (
            db.collection("users")
            .document(uid)
            .collection("story_progress")
        )

        docs = progress_collection.stream()
        progress_list = []

        for doc in docs:
            data = doc.to_dict()
            data["story_id"] = doc.id
            progress_list.append(data)

        logger.info(f"Retrieved {len(progress_list)} progress records for user {uid}")
        return progress_list

    except Exception as e:
        logger.error(f"Failed to get all progress for {uid}: {e}")
        return []


async def seed_static_story(story_data: Dict[str, Any]) -> bool:
    """
    Seed a static story to Firestore.
    Used for initial data setup.

    Args:
        story_data: Complete story document

    Returns:
        True if successful
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            raise Exception("Firebase not available")

        db = get_db()
        story_id = story_data.get("story_id")

        if not story_id:
            raise ValueError("story_data must have a 'story_id' field")

        # Add created_at timestamp
        story_data["created_at"] = datetime.now(timezone.utc)

        # Save to Firestore
        db.collection("static_stories").document(story_id).set(story_data)

        logger.info(f"Seeded static story: {story_id}")
        return True

    except Exception as e:
        logger.error(f"Failed to seed story: {e}")
        raise
