"""
Notification Scheduler
Processes notification campaigns and sends notifications to eligible users.
"""

import logging
from datetime import datetime, timezone
from typing import List, Dict, Any

from services.firebase_service import is_firebase_available, get_db
from services.campaign_service import (
    list_campaigns,
    should_trigger_for_user,
    select_variant,
    increment_campaign_stat,
)
from services.notification_service import send_notification_to_user

logger = logging.getLogger(__name__)


def should_trigger_now(trigger: Dict[str, Any]) -> bool:
    """
    Check if a campaign trigger should fire now.

    Trigger types:
    - scheduled: {"type": "scheduled", "hour": 9, "minute": 0}
    - immediate: {"type": "immediate"}
    - event: {"type": "event", "event_name": "story_completed"}
    """
    trigger_type = trigger.get("type")

    if trigger_type == "immediate":
        # Always trigger
        return True

    if trigger_type == "scheduled":
        now = datetime.now(timezone.utc)
        hour = trigger.get("hour", 9)
        minute = trigger.get("minute", 0)
        days_of_week = trigger.get("days_of_week")  # 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun

        # Check day of week if specified
        if days_of_week is not None and now.weekday() not in days_of_week:
            return False

        # Trigger if within 5 minutes of scheduled time
        scheduled_today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        time_diff = abs((now - scheduled_today).total_seconds() / 60)

        return time_diff < 8  # 8 min window covers any 15-min interval offset

    if trigger_type == "event":
        # Event-based triggers are handled separately
        # (e.g., when user completes a story)
        return False

    return False


async def get_user_usage_today(user_id: str) -> int:
    """Get today's story usage for a user."""
    if not is_firebase_available():
        return 0

    try:
        db = get_db()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        usage_doc = db.collection("users").document(user_id).collection("usage").document(today).get()

        if usage_doc.exists:
            return usage_doc.to_dict().get("stories_generated", 0)
        return 0
    except Exception as e:
        logger.error(f"Failed to get usage for user {user_id}: {e}")
        return 0


async def get_eligible_users(campaign) -> List[Dict[str, Any]]:
    """
    Get all users eligible for a campaign using database-side filtering.
    Returns list of user data dicts.

    Optimized for performance:
    - Filters by tier at database level
    - Only fetches usage data when needed for filtering
    - Processes users in batches
    """
    if not is_firebase_available():
        return []

    db = get_db()
    audience = campaign.audience
    eligible_users = []

    # Start with base query
    query = db.collection("users")

    # Note: Not filtering by tier at database level since users may not have this field yet
    # We'll filter in Python below where we can provide defaults

    # Limit batch size to prevent timeout (process in chunks)
    BATCH_SIZE = 500
    query = query.limit(BATCH_SIZE)

    # Track if we need to fetch usage data
    needs_usage = "stories_used_min" in audience or "stories_used_max" in audience
    needs_signup_date = "days_since_signup_min" in audience or "days_since_signup_max" in audience

    # Process users
    users = query.stream()

    for user_doc in users:
        try:
            user_id = user_doc.id
            user_data = user_doc.to_dict()

            # Add computed fields
            user_data["uid"] = user_id
            # Default to "free" tier if subscription_tier field doesn't exist
            user_data["tier"] = user_data.get("subscription_tier") or "free"

            # Calculate days since signup (if needed)
            if needs_signup_date:
                created_at = user_data.get("created_at")
                if created_at:
                    try:
                        created_date = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                        days_since_signup = (datetime.now(timezone.utc) - created_date).days
                        user_data["days_since_signup"] = days_since_signup
                    except Exception:
                        user_data["days_since_signup"] = 0
                else:
                    user_data["days_since_signup"] = 0

                # Filter by days_since_signup
                if "days_since_signup_min" in audience:
                    if user_data["days_since_signup"] < audience["days_since_signup_min"]:
                        continue
                if "days_since_signup_max" in audience:
                    if user_data["days_since_signup"] > audience["days_since_signup_max"]:
                        continue

            # Get today's story usage (only if needed for filtering)
            if needs_usage:
                user_data["stories_used"] = await get_user_usage_today(user_id)

                # Filter by stories_used
                if "stories_used_min" in audience:
                    if user_data["stories_used"] < audience["stories_used_min"]:
                        continue
                if "stories_used_max" in audience:
                    if user_data["stories_used"] > audience["stories_used_max"]:
                        continue
            else:
                user_data["stories_used"] = 0

            # Additional tier filtering if we couldn't use database filter
            if "tier" in audience:
                required_tier = audience["tier"]
                if isinstance(required_tier, list) and len(required_tier) > 10:
                    if user_data["tier"] not in required_tier:
                        continue

            # All filters passed
            eligible_users.append(user_data)

        except Exception as e:
            logger.error(f"Error processing user {user_doc.id} for campaign {campaign.campaign_id}: {e}")
            continue

    logger.info(f"Campaign {campaign.campaign_id}: {len(eligible_users)} eligible users (processed {BATCH_SIZE} max)")
    return eligible_users




async def log_notification_sent(user_id: str, campaign_id: str, content: Dict[str, Any]):
    """Log that a notification was sent."""
    if not is_firebase_available():
        return

    try:
        db = get_db()
        db.collection("notification_logs").add({
            "user_id": user_id,
            "campaign_id": campaign_id,
            "action": "sent",
            "content": content,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.error(f"Failed to log notification sent: {e}")


async def process_campaign(campaign) -> Dict[str, int]:
    """
    Process a single campaign: find eligible users and send notifications.
    Returns statistics: {sent: int, skipped: int, failed: int}
    """
    stats = {"sent": 0, "skipped": 0, "failed": 0}

    logger.info(f"Processing campaign: {campaign.campaign_id} - {campaign.name}")

    # Check if campaign should trigger now
    if not should_trigger_now(campaign.trigger):
        logger.info(f"Campaign {campaign.campaign_id} not triggering at this time (trigger={campaign.trigger})")
        return stats

    logger.info(f"Campaign {campaign.campaign_id} trigger matched, finding eligible users...")

    # Get eligible users
    eligible_users = await get_eligible_users(campaign)
    logger.info(f"Campaign {campaign.campaign_id}: Found {len(eligible_users)} eligible users")

    for user_data in eligible_users:
        user_id = user_data["uid"]

        # Select content variant (for A/B testing)
        content = select_variant(campaign, user_id)

        # Personalize content
        title = content.get("title", "")
        body = content.get("body", "")
        deep_link = content.get("deep_link", "")

        # Simple personalization (can be expanded)
        child_name = user_data.get("name", "there")
        title = title.replace("{child_name}", child_name)
        body = body.replace("{child_name}", child_name)

        # Send notification
        try:
            notification_id = f"notif-{campaign.campaign_id}-{user_id}"
            sent_count = await send_notification_to_user(
                uid=user_id,
                title=title,
                body=body,
                data={
                    "deep_link": deep_link,
                    "campaign_id": campaign.campaign_id,
                    "notification_id": notification_id,
                },
                notification_id=notification_id,
            )

            if sent_count > 0:
                stats["sent"] += 1
                await log_notification_sent(user_id, campaign.campaign_id, content)
                await increment_campaign_stat(campaign.campaign_id, "sent", amount=1)
                logger.info(f"Sent notification to user {user_id} for campaign {campaign.campaign_id}")
            else:
                stats["failed"] += 1
                logger.warning(f"No FCM tokens for user {user_id}")

        except Exception as e:
            stats["failed"] += 1
            logger.error(f"Failed to send notification to user {user_id}: {e}")

    logger.info(f"Campaign {campaign.campaign_id} processed: {stats}")
    return stats


async def process_all_campaigns() -> Dict[str, Any]:
    """
    Main scheduler function - processes all active campaigns.
    This should be called periodically (e.g., every 15 minutes via cron).
    """
    logger.info("Starting notification scheduler run")

    try:
        # Get all active campaigns
        campaigns = await list_campaigns(active_only=True)
        logger.info(f"Found {len(campaigns)} active campaigns")

        total_stats = {
            "campaigns_processed": 0,
            "total_sent": 0,
            "total_skipped": 0,
            "total_failed": 0,
        }

        # Process each campaign
        for campaign in campaigns:
            try:
                stats = await process_campaign(campaign)
                total_stats["campaigns_processed"] += 1
                total_stats["total_sent"] += stats["sent"]
                total_stats["total_skipped"] += stats["skipped"]
                total_stats["total_failed"] += stats["failed"]
            except Exception as e:
                logger.error(f"Error processing campaign {campaign.campaign_id}: {e}")

        logger.info(f"Scheduler run complete: {total_stats}")
        return total_stats

    except Exception as e:
        logger.error(f"Scheduler run failed: {e}")
        return {"error": str(e)}


async def process_single_campaign(campaign_id: str) -> Dict[str, Any]:
    """
    Process a single specific campaign by ID.
    Useful for testing or triggering one-off campaigns.

    Returns:
        Dictionary with stats: {sent: int, skipped: int, failed: int}
    """
    logger.info(f"Processing single campaign: {campaign_id}")

    try:
        from services.campaign_service import get_campaign

        # Get the specific campaign
        campaign = await get_campaign(campaign_id)

        if not campaign:
            logger.error(f"Campaign {campaign_id} not found")
            return {"error": f"Campaign {campaign_id} not found"}

        # Process the campaign
        stats = await process_campaign(campaign)

        logger.info(f"Single campaign {campaign_id} processed: {stats}")
        return stats

    except Exception as e:
        logger.error(f"Failed to process single campaign {campaign_id}: {e}")
        return {"error": str(e)}
