"""
Static Story Service
Handles fetching and managing static mythological stories.
"""
import asyncio
import logging
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# In-memory cache — 10 min TTL, drastically cuts Firestore reads
_story_list_cache: dict = {}   # category_key → (stories, timestamp)
_STORY_LIST_TTL = 600          # 10 minutes

# Firestore call timeout — prevents the default 300s retry loop on 429 errors
_FIRESTORE_TIMEOUT = 10.0      # seconds per individual call


# ---------------------------------------------------------------------------
# Synchronous helpers — always called via asyncio.to_thread() so they never
# block the uvicorn event loop.
# ---------------------------------------------------------------------------

def _sync_fetch_stories(category: Optional[str]) -> List[Dict[str, Any]]:
    from services.firebase_service import get_db
    db = get_db()
    query = db.collection("static_stories")
    if category:
        query = query.where("category", "==", category)

    docs = list(query.stream(timeout=_FIRESTORE_TIMEOUT))
    all_stories = []
    for doc in docs:
        story_data = doc.to_dict()
        all_stories.append({
            "story_id": doc.id,
            "title": story_data.get("title"),
            "category": story_data.get("category"),
            "values": story_data.get("values", []),
            "characters": story_data.get("characters", []),
            "metadata": story_data.get("metadata", {}),
            "created_at": story_data.get("created_at"),
            "cover_image_url": story_data.get("cover_image_url"),
            "segment_count": len(story_data.get("segments", [])),
        })

    all_stories.sort(
        key=lambda x: x.get("created_at") or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return all_stories


def _sync_get_story(story_id: str) -> Optional[Dict[str, Any]]:
    from services.firebase_service import get_db
    db = get_db()
    doc = db.collection("static_stories").document(story_id).get(timeout=_FIRESTORE_TIMEOUT)
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["story_id"] = doc.id
    return data


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------

async def get_static_story(story_id: str) -> Optional[Dict[str, Any]]:
    try:
        from services.firebase_service import is_firebase_available
        if not is_firebase_available():
            logger.warning("Firebase not available")
            return None

        story_data = await asyncio.wait_for(
            asyncio.to_thread(_sync_get_story, story_id),
            timeout=_FIRESTORE_TIMEOUT + 2,
        )
        if story_data is None:
            logger.warning(f"Static story {story_id} not found")
        else:
            logger.info(f"Retrieved static story: {story_id}")
        return story_data

    except asyncio.TimeoutError:
        logger.error(f"Firestore timeout fetching story {story_id}")
        return None
    except Exception as e:
        logger.error(f"Failed to fetch static story {story_id}: {e}")
        raise


async def list_static_stories(
    category: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    from services.firebase_service import is_firebase_available
    if not is_firebase_available():
        logger.warning("Firebase not available")
        return []

    # Serve from cache when fresh
    cache_key = category or "__all__"
    cached = _story_list_cache.get(cache_key)
    if cached and (time.time() - cached[1]) < _STORY_LIST_TTL:
        stories = cached[0]
        end_idx = offset + limit if limit > 0 else len(stories)
        return stories[offset:end_idx]

    try:
        all_stories = await asyncio.wait_for(
            asyncio.to_thread(_sync_fetch_stories, category),
            timeout=_FIRESTORE_TIMEOUT + 2,
        )
    except asyncio.TimeoutError:
        logger.error("Firestore timeout listing stories — returning empty list")
        return []
    except Exception as e:
        logger.error(f"Failed to list static stories: {e}")
        raise

    _story_list_cache[cache_key] = (all_stories, time.time())
    logger.info(f"Cached {len(all_stories)} stories (category: {category or 'all'})")

    end_idx = offset + limit if limit > 0 else len(all_stories)
    stories = all_stories[offset:end_idx]
    logger.info(f"Retrieved {len(stories)} static stories (category: {category or 'all'})")
    return stories


async def get_user_story_progress(uid: str, story_id: str) -> Optional[Dict[str, Any]]:
    def _fetch():
        from services.firebase_service import get_db
        db = get_db()
        ref = (
            db.collection("users")
            .document(uid)
            .collection("story_progress")
            .document(story_id)
        )
        doc = ref.get(timeout=_FIRESTORE_TIMEOUT)
        if not doc.exists:
            return {
                "story_id": story_id,
                "status": "not_started",
                "current_segment": 0,
                "quiz_score": 0,
                "quiz_attempts": 0,
                "is_favorite": False,
            }
        progress = doc.to_dict()
        progress["story_id"] = story_id
        return progress

    try:
        from services.firebase_service import is_firebase_available
        if not is_firebase_available():
            return None

        return await asyncio.wait_for(
            asyncio.to_thread(_fetch),
            timeout=_FIRESTORE_TIMEOUT + 2,
        )
    except asyncio.TimeoutError:
        logger.error(f"Firestore timeout fetching progress {uid}/{story_id}")
        return None
    except Exception as e:
        logger.error(f"Failed to get progress for {uid}/{story_id}: {e}")
        return None


async def update_story_progress(
    uid: str,
    story_id: str,
    current_segment: int,
    status: str = "in_progress",
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)

    def _update():
        from services.firebase_service import get_db
        db = get_db()
        ref = (
            db.collection("users")
            .document(uid)
            .collection("story_progress")
            .document(story_id)
        )
        existing = ref.get(timeout=_FIRESTORE_TIMEOUT)
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
                "created_at": now,
            }

        progress_data["current_segment"] = current_segment
        progress_data["status"] = status
        progress_data["last_read_at"] = now

        if status == "completed" and not progress_data.get("completed_at"):
            progress_data["completed_at"] = now

        ref.set(progress_data, timeout=_FIRESTORE_TIMEOUT)
        return progress_data

    try:
        from services.firebase_service import is_firebase_available
        if not is_firebase_available():
            raise Exception("Firebase not available")

        progress_data = await asyncio.wait_for(
            asyncio.to_thread(_update),
            timeout=_FIRESTORE_TIMEOUT + 2,
        )
    except asyncio.TimeoutError:
        logger.error(f"Firestore timeout updating progress {uid}/{story_id}")
        raise Exception("Firestore timeout")
    except Exception as e:
        logger.error(f"Failed to update progress for {uid}/{story_id}: {e}")
        raise

    logger.info(f"Updated progress for {uid}/{story_id}: segment {current_segment}, status {status}")

    result = dict(progress_data)
    result["last_read_at"] = now.isoformat()
    if result.get("created_at"):
        result["created_at"] = result["created_at"].isoformat() if hasattr(result["created_at"], "isoformat") else str(result["created_at"])
    if result.get("completed_at"):
        result["completed_at"] = result["completed_at"].isoformat() if hasattr(result["completed_at"], "isoformat") else str(result["completed_at"])
    return result


async def get_all_user_progress(uid: str) -> List[Dict[str, Any]]:
    def _fetch():
        from services.firebase_service import get_db
        db = get_db()
        docs = (
            db.collection("users")
            .document(uid)
            .collection("story_progress")
            .stream(timeout=_FIRESTORE_TIMEOUT)
        )
        result = []
        for doc in docs:
            data = doc.to_dict()
            data["story_id"] = doc.id
            result.append(data)
        return result

    try:
        from services.firebase_service import is_firebase_available
        if not is_firebase_available():
            return []

        progress_list = await asyncio.wait_for(
            asyncio.to_thread(_fetch),
            timeout=_FIRESTORE_TIMEOUT + 2,
        )
        logger.info(f"Retrieved {len(progress_list)} progress records for user {uid}")
        return progress_list
    except asyncio.TimeoutError:
        logger.error(f"Firestore timeout getting all progress for {uid}")
        return []
    except Exception as e:
        logger.error(f"Failed to get all progress for {uid}: {e}")
        return []


async def seed_static_story(story_data: Dict[str, Any]) -> bool:
    story_id = story_data.get("story_id")
    if not story_id:
        raise ValueError("story_data must have a 'story_id' field")

    story_data["created_at"] = datetime.now(timezone.utc)

    def _seed():
        from services.firebase_service import get_db
        db = get_db()
        db.collection("static_stories").document(story_id).set(story_data, timeout=_FIRESTORE_TIMEOUT)

    try:
        from services.firebase_service import is_firebase_available
        if not is_firebase_available():
            raise Exception("Firebase not available")

        await asyncio.wait_for(asyncio.to_thread(_seed), timeout=_FIRESTORE_TIMEOUT + 2)
        logger.info(f"Seeded static story: {story_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to seed story: {e}")
        raise
