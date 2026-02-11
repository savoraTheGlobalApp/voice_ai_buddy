"""
Amplitude analytics service for tracking user events and retention.
"""
import os
from typing import Dict, Any, Optional
from amplitude import Amplitude, BaseEvent
import logging

logger = logging.getLogger(__name__)

# Initialize Amplitude client
AMPLITUDE_API_KEY = os.getenv("AMPLITUDE_API_KEY")

if AMPLITUDE_API_KEY:
    amplitude_client = Amplitude(AMPLITUDE_API_KEY)
    logger.info("Amplitude analytics initialized")
else:
    amplitude_client = None
    logger.warning("Amplitude API key not found - analytics disabled")


def track_event(
    user_id: str,
    event_name: str,
    event_properties: Optional[Dict[str, Any]] = None,
    user_properties: Optional[Dict[str, Any]] = None
) -> None:
    """
    Track an event in Amplitude.

    Args:
        user_id: Unique user identifier (Firebase UID)
        event_name: Name of the event (e.g., "story_started")
        event_properties: Event-specific properties (e.g., story_id, category)
        user_properties: User properties to set (e.g., subscription_tier, language)
    """
    if not amplitude_client:
        logger.debug(f"Analytics disabled - would track: {event_name} for user {user_id}")
        return

    try:
        event = BaseEvent(
            event_type=event_name,
            user_id=user_id,
            event_properties=event_properties or {},
            user_properties=user_properties or {}
        )

        amplitude_client.track(event)
        logger.debug(f"Tracked event: {event_name} for user {user_id}")

    except Exception as e:
        # Don't fail requests if analytics fails
        logger.error(f"Failed to track event {event_name}: {e}")


# Convenience functions for common events

def track_user_signup(user_id: str, method: str = "email"):
    """Track when a user signs up."""
    track_event(
        user_id=user_id,
        event_name="user_signed_up",
        event_properties={"signup_method": method},
        user_properties={"signup_date": "today"}  # Amplitude sets timestamp
    )


def track_story_started(user_id: str, story_id: str, category: str, is_paid_user: bool):
    """Track when user starts reading a story."""
    track_event(
        user_id=user_id,
        event_name="story_started",
        event_properties={
            "story_id": story_id,
            "category": category
        },
        user_properties={
            "subscription_tier": "paid" if is_paid_user else "free"
        }
    )


def track_story_completed(user_id: str, story_id: str, category: str, reading_time_seconds: int):
    """Track when user completes a story."""
    track_event(
        user_id=user_id,
        event_name="story_completed",
        event_properties={
            "story_id": story_id,
            "category": category,
            "reading_time_seconds": reading_time_seconds
        }
    )


def track_segment_completed(user_id: str, story_id: str, segment_index: int):
    """Track when user completes a story segment."""
    track_event(
        user_id=user_id,
        event_name="story_segment_completed",
        event_properties={
            "story_id": story_id,
            "segment_index": segment_index
        }
    )


def track_subscription_started(user_id: str, plan: str, price: float):
    """Track when user starts a subscription."""
    track_event(
        user_id=user_id,
        event_name="subscription_started",
        event_properties={
            "plan": plan,
            "price": price
        },
        user_properties={
            "subscription_tier": "paid",
            "plan": plan
        }
    )


def track_paywall_seen(user_id: str, trigger: str):
    """Track when user sees paywall."""
    track_event(
        user_id=user_id,
        event_name="paywall_seen",
        event_properties={
            "trigger": trigger  # "story_limit", "feature_locked", etc.
        }
    )


def track_character_unlocked(user_id: str, character_id: str, character_name: str):
    """Track when user unlocks a character."""
    track_event(
        user_id=user_id,
        event_name="character_unlocked",
        event_properties={
            "character_id": character_id,
            "character_name": character_name
        }
    )


def track_language_switched(user_id: str, from_lang: str, to_lang: str):
    """Track when user switches language."""
    track_event(
        user_id=user_id,
        event_name="language_switched",
        event_properties={
            "from_language": from_lang,
            "to_language": to_lang
        },
        user_properties={
            "preferred_language": to_lang
        }
    )


def set_user_properties(user_id: str, properties: Dict[str, Any]):
    """
    Set or update user properties.

    Example properties:
    - name, email
    - age_group (e.g., "5-7", "8-10")
    - signup_date
    - subscription_tier
    - total_stories_read
    - total_stories_completed
    """
    if not amplitude_client:
        return

    try:
        # Amplitude automatically updates user properties with each event
        # But we can also explicitly set them
        track_event(
            user_id=user_id,
            event_name="user_properties_updated",
            user_properties=properties
        )
    except Exception as e:
        logger.error(f"Failed to set user properties: {e}")
