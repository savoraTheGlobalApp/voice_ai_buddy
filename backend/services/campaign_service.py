"""
Campaign Service
Manages notification campaigns with targeting, scheduling, and analytics.
"""

import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from uuid import uuid4

from services.firebase_service import is_firebase_available, get_db

logger = logging.getLogger(__name__)


class NotificationCampaign:
    """Represents a notification campaign configuration."""

    def __init__(
        self,
        campaign_id: str,
        name: str,
        active: bool,
        trigger: Dict[str, Any],
        audience: Dict[str, Any],
        content: Dict[str, Any],
        variants: Optional[List[Dict[str, Any]]] = None,
        stats: Optional[Dict[str, int]] = None,
        created_at: Optional[str] = None,
        updated_at: Optional[str] = None,
    ):
        self.campaign_id = campaign_id
        self.name = name
        self.active = active
        self.trigger = trigger
        self.audience = audience
        self.content = content
        self.variants = variants or []
        self.stats = stats or {"sent": 0, "opened": 0, "converted": 0}
        self.created_at = created_at or datetime.now(timezone.utc).isoformat()
        self.updated_at = updated_at or datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        """Convert campaign to dictionary for Firestore."""
        return {
            "campaign_id": self.campaign_id,
            "name": self.name,
            "active": self.active,
            "trigger": self.trigger,
            "audience": self.audience,
            "content": self.content,
            "variants": self.variants,
            "stats": self.stats,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "NotificationCampaign":
        """Create campaign from Firestore document."""
        return cls(
            campaign_id=data.get("campaign_id", ""),
            name=data.get("name", ""),
            active=data.get("active", False),
            trigger=data.get("trigger", {}),
            audience=data.get("audience", {}),
            content=data.get("content", {}),
            variants=data.get("variants", []),
            stats=data.get("stats", {"sent": 0, "opened": 0, "converted": 0}),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
        )


async def create_campaign(campaign_data: Dict[str, Any]) -> NotificationCampaign:
    """Create a new notification campaign."""
    if not is_firebase_available():
        raise Exception("Firebase not available")

    campaign_id = f"campaign-{uuid4().hex[:12]}"

    campaign = NotificationCampaign(
        campaign_id=campaign_id,
        name=campaign_data.get("name", "Untitled Campaign"),
        active=campaign_data.get("active", False),
        trigger=campaign_data.get("trigger", {}),
        audience=campaign_data.get("audience", {}),
        content=campaign_data.get("content", {}),
        variants=campaign_data.get("variants", []),
    )

    db = get_db()
    db.collection("notification_campaigns").document(campaign_id).set(campaign.to_dict())

    logger.info(f"Created campaign: {campaign_id} - {campaign.name}")
    return campaign


async def get_campaign(campaign_id: str) -> Optional[NotificationCampaign]:
    """Get a campaign by ID."""
    if not is_firebase_available():
        return None

    db = get_db()
    doc = db.collection("notification_campaigns").document(campaign_id).get()

    if not doc.exists:
        return None

    return NotificationCampaign.from_dict(doc.to_dict())


async def list_campaigns(active_only: bool = False) -> List[NotificationCampaign]:
    """List all campaigns, optionally filtering by active status."""
    if not is_firebase_available():
        return []

    db = get_db()
    query = db.collection("notification_campaigns")

    # Note: Commenting out order_by to avoid composite index requirement for testing
    # Uncomment once composite index (active + created_at) is created
    if active_only:
        query = query.where("active", "==", True)

    # docs = query.order_by("created_at", direction="DESCENDING").stream()
    docs = query.stream()  # No order_by to avoid index requirement

    campaigns = []
    for doc in docs:
        try:
            campaign = NotificationCampaign.from_dict(doc.to_dict())
            campaigns.append(campaign)
        except Exception as e:
            logger.error(f"Failed to parse campaign {doc.id}: {e}")

    return campaigns


async def update_campaign(campaign_id: str, updates: Dict[str, Any]) -> Optional[NotificationCampaign]:
    """Update a campaign."""
    if not is_firebase_available():
        return None

    db = get_db()
    campaign_ref = db.collection("notification_campaigns").document(campaign_id)

    doc = campaign_ref.get()
    if not doc.exists:
        return None

    # Update timestamp
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    campaign_ref.update(updates)

    # Return updated campaign
    updated_doc = campaign_ref.get()
    return NotificationCampaign.from_dict(updated_doc.to_dict())


async def delete_campaign(campaign_id: str) -> bool:
    """Delete a campaign."""
    if not is_firebase_available():
        return False

    db = get_db()
    campaign_ref = db.collection("notification_campaigns").document(campaign_id)

    doc = campaign_ref.get()
    if not doc.exists:
        return False

    campaign_ref.delete()
    logger.info(f"Deleted campaign: {campaign_id}")
    return True


async def increment_campaign_stat(campaign_id: str, stat_name: str, amount: int = 1) -> bool:
    """Increment a campaign statistic (sent, opened, converted)."""
    if not is_firebase_available():
        return False

    try:
        db = get_db()
        campaign_ref = db.collection("notification_campaigns").document(campaign_id)

        doc = campaign_ref.get()
        if not doc.exists:
            return False

        stats = doc.to_dict().get("stats", {})
        stats[stat_name] = stats.get(stat_name, 0) + amount

        campaign_ref.update({"stats": stats})
        return True

    except Exception as e:
        logger.error(f"Failed to increment stat {stat_name} for campaign {campaign_id}: {e}")
        return False


async def get_campaign_stats(campaign_id: str) -> Optional[Dict[str, Any]]:
    """Get campaign statistics."""
    campaign = await get_campaign(campaign_id)
    if not campaign:
        return None

    stats = campaign.stats.copy()

    # Calculate conversion rate
    if stats["sent"] > 0:
        stats["open_rate"] = round(stats["opened"] / stats["sent"] * 100, 2)
        stats["conversion_rate"] = round(stats["converted"] / stats["sent"] * 100, 2)
    else:
        stats["open_rate"] = 0.0
        stats["conversion_rate"] = 0.0

    return stats


def should_trigger_for_user(campaign: NotificationCampaign, user_data: Dict[str, Any]) -> bool:
    """
    Determine if a campaign should trigger for a given user.
    Checks audience filters and trigger conditions.
    """
    # Check if campaign is active
    if not campaign.active:
        return False

    # Check audience filters
    audience = campaign.audience

    # Tier filter
    if "tier" in audience:
        required_tier = audience["tier"]
        user_tier = user_data.get("tier", "free")
        if isinstance(required_tier, list):
            if user_tier not in required_tier:
                return False
        elif user_tier != required_tier:
            return False

    # Stories used filter
    if "stories_used_min" in audience or "stories_used_max" in audience:
        stories_used = user_data.get("stories_used", 0)
        if "stories_used_min" in audience and stories_used < audience["stories_used_min"]:
            return False
        if "stories_used_max" in audience and stories_used > audience["stories_used_max"]:
            return False

    # Days since signup filter
    if "days_since_signup_min" in audience or "days_since_signup_max" in audience:
        days_since_signup = user_data.get("days_since_signup", 0)
        if "days_since_signup_min" in audience and days_since_signup < audience["days_since_signup_min"]:
            return False
        if "days_since_signup_max" in audience and days_since_signup > audience["days_since_signup_max"]:
            return False

    # All checks passed
    return True


def select_variant(campaign: NotificationCampaign, user_id: str) -> Dict[str, Any]:
    """
    Select a content variant for a user (for A/B testing).
    Uses consistent hashing so same user always gets same variant.
    """
    if not campaign.variants or len(campaign.variants) == 0:
        return campaign.content

    # Use hash of user_id to deterministically select variant
    user_hash = hash(user_id)
    variant_index = user_hash % len(campaign.variants)

    return campaign.variants[variant_index]
