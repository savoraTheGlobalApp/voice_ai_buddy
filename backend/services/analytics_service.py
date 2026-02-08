"""
Simple analytics service using existing Firestore data.
No additional logging required - queries existing collections.
"""
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# Simple in-memory cache
_cache: Dict[str, Tuple[Any, datetime]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


def _get_from_cache(key: str) -> Optional[Any]:
    """Get value from cache if not expired."""
    if key in _cache:
        value, cached_time = _cache[key]
        age = (datetime.now(timezone.utc) - cached_time).total_seconds()
        if age < CACHE_TTL_SECONDS:
            logger.info(f"Cache hit for {key} (age: {age:.1f}s)")
            return value
        else:
            logger.info(f"Cache expired for {key} (age: {age:.1f}s)")
            del _cache[key]
    return None


def _set_cache(key: str, value: Any) -> None:
    """Set value in cache with current timestamp."""
    _cache[key] = (value, datetime.now(timezone.utc))
    logger.info(f"Cached {key}")


def clear_cache() -> None:
    """Clear all cached analytics data."""
    global _cache
    _cache = {}
    logger.info("Analytics cache cleared")


async def get_daily_metrics(date: str = None) -> Dict[str, Any]:
    """
    Get basic daily metrics from existing Firestore data.

    Args:
        date: Date string in YYYY-MM-DD format (defaults to today)

    Returns:
        Dictionary with daily metrics
    """
    # Check cache first
    cache_key = f"daily_metrics_{date or 'today'}"
    cached = _get_from_cache(cache_key)
    if cached is not None:
        return cached

    from services.firebase_service import get_db

    db = get_db()

    # Parse date
    if date:
        target_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        target_date = datetime.now(timezone.utc)

    # Date range: start of day to end of day
    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)

    logger.info(f"Calculating metrics for {target_date.strftime('%Y-%m-%d')}")

    metrics = {
        "date": target_date.strftime("%Y-%m-%d"),
        "daily_active_users": 0,
        "stories_started": 0,
        "stories_completed": 0,
        "stories_generated": 0,
        "total_users": 0,
        "top_stories": {},
        "completion_rate": 0.0
    }

    try:
        # Get all users
        users_ref = db.collection('users')
        all_users = users_ref.stream()

        active_user_ids = set()
        stories_started_count = 0
        stories_completed_count = 0
        story_counts = {}

        # Iterate through users and their progress
        for user_doc in all_users:
            user_id = user_doc.id

            # Get user's story progress (fixed collection name)
            progress_ref = users_ref.document(user_id).collection('story_progress')

            try:
                progress_docs = progress_ref.stream()

                for progress_doc in progress_docs:
                    progress_data = progress_doc.to_dict()
                    story_id = progress_doc.id

                    # Check if user was active (read) on target date
                    last_read_at = progress_data.get('last_read_at')
                    if last_read_at:
                        # Handle both Firestore timestamp and datetime
                        if hasattr(last_read_at, 'timestamp'):
                            # Firestore timestamp
                            activity_date = datetime.fromtimestamp(last_read_at.timestamp(), tz=timezone.utc)
                        else:
                            activity_date = last_read_at

                        if start_of_day <= activity_date <= end_of_day:
                            active_user_ids.add(user_id)
                            story_counts[story_id] = story_counts.get(story_id, 0) + 1

                    # Check if story was started on target date
                    created_at = progress_data.get('created_at')
                    if created_at:
                        if hasattr(created_at, 'timestamp'):
                            created_date = datetime.fromtimestamp(created_at.timestamp(), tz=timezone.utc)
                        else:
                            created_date = created_at

                        if start_of_day <= created_date <= end_of_day:
                            stories_started_count += 1

                    # Check if story was completed on target date
                    completed_at = progress_data.get('completed_at')
                    if completed_at:
                        if hasattr(completed_at, 'timestamp'):
                            completed_date = datetime.fromtimestamp(completed_at.timestamp(), tz=timezone.utc)
                        else:
                            completed_date = completed_at

                        if start_of_day <= completed_date <= end_of_day:
                            stories_completed_count += 1

            except Exception as e:
                logger.error(f"Error processing user {user_id}: {e}")
                continue

        # Count AI-generated stories created on target date
        stories_generated_count = 0
        users_ref_2 = db.collection('users')
        all_users_2 = users_ref_2.stream()

        for user_doc in all_users_2:
            try:
                generated_stories_ref = users_ref_2.document(user_doc.id).collection('stories')
                generated_stories = generated_stories_ref.stream()

                for story_doc in generated_stories:
                    story_data = story_doc.to_dict()
                    created_at = story_data.get('createdAt')

                    if created_at:
                        if hasattr(created_at, 'timestamp'):
                            created_date = datetime.fromtimestamp(created_at.timestamp(), tz=timezone.utc)
                        else:
                            created_date = created_at

                        if start_of_day <= created_date <= end_of_day:
                            stories_generated_count += 1
            except Exception as e:
                logger.error(f"Error counting generated stories for user {user_doc.id}: {e}")
                continue

        # Get total users count
        total_users = len(list(db.collection('users').stream()))

        # Calculate metrics
        metrics["daily_active_users"] = len(active_user_ids)
        metrics["stories_started"] = stories_started_count
        metrics["stories_completed"] = stories_completed_count
        metrics["stories_generated"] = stories_generated_count
        metrics["total_users"] = total_users
        metrics["top_stories"] = dict(sorted(story_counts.items(), key=lambda x: x[1], reverse=True)[:5])

        if stories_started_count > 0:
            metrics["completion_rate"] = round(stories_completed_count / stories_started_count, 2)

        logger.info(f"Metrics calculated: {metrics}")

        # Cache the result
        _set_cache(cache_key, metrics)

        return metrics

    except Exception as e:
        logger.error(f"Failed to calculate daily metrics: {e}")
        raise


async def get_weekly_summary() -> Dict[str, Any]:
    """
    Get summary for last 7 days.

    Returns:
        Dictionary with weekly summary
    """
    # Check cache first
    cache_key = "weekly_summary"
    cached = _get_from_cache(cache_key)
    if cached is not None:
        return cached

    today = datetime.now(timezone.utc)
    weekly_data = []

    for i in range(7):
        date = today - timedelta(days=i)
        date_str = date.strftime("%Y-%m-%d")

        try:
            daily = await get_daily_metrics(date_str)
            weekly_data.append(daily)
        except Exception as e:
            logger.error(f"Failed to get metrics for {date_str}: {e}")
            weekly_data.append({
                "date": date_str,
                "error": str(e)
            })

    result = {
        "period": "last_7_days",
        "data": weekly_data
    }

    # Cache the result
    _set_cache(cache_key, result)

    return result


async def get_all_time_stats() -> Dict[str, Any]:
    """
    Get all-time statistics.

    Returns:
        Dictionary with all-time stats
    """
    # Check cache first
    cache_key = "all_time_stats"
    cached = _get_from_cache(cache_key)
    if cached is not None:
        return cached

    from services.firebase_service import get_db

    db = get_db()

    try:
        # Total users
        total_users = len(list(db.collection('users').stream()))

        # Total stories
        total_stories = len(list(db.collection('static_stories').stream()))

        # Count total progress documents (all time story reads)
        all_time_reads = 0
        all_time_completions = 0

        users = db.collection('users').stream()
        for user_doc in users:
            try:
                progress_docs = db.collection('users').document(user_doc.id)\
                    .collection('story_progress').stream()

                for progress_doc in progress_docs:
                    all_time_reads += 1
                    progress_data = progress_doc.to_dict()
                    if progress_data.get('status') == 'completed':
                        all_time_completions += 1
            except:
                continue

        result = {
            "total_users": total_users,
            "total_stories": total_stories,
            "all_time_reads": all_time_reads,
            "all_time_completions": all_time_completions,
            "overall_completion_rate": round(all_time_completions / all_time_reads, 2) if all_time_reads > 0 else 0
        }

        # Cache the result
        _set_cache(cache_key, result)

        return result

    except Exception as e:
        logger.error(f"Failed to get all-time stats: {e}")
        raise
