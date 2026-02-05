"""
Notification Service
Handles FCM token storage and push notification sending.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from firebase_admin import messaging

from services.firebase_service import is_firebase_available, get_db

logger = logging.getLogger(__name__)


async def store_fcm_token(uid: str, token: str, platform: str) -> bool:
    """
    Store or update FCM token for a user.
    Each user can have multiple tokens (one per device).
    """
    if not is_firebase_available():
        logger.warning("Firebase not available, cannot store FCM token")
        return False

    try:
        db = get_db()
        user_ref = db.collection("users").document(uid)

        # Get existing tokens
        user_doc = user_ref.get()
        existing_tokens = []
        if user_doc.exists:
            existing_tokens = user_doc.to_dict().get("fcm_tokens", [])

        # Remove any existing entry for this token (to update timestamp)
        existing_tokens = [t for t in existing_tokens if t.get("token") != token]

        # Add the new/updated token
        existing_tokens.append({
            "token": token,
            "platform": platform,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        # Keep only the last 5 tokens per user (limit device sprawl)
        if len(existing_tokens) > 5:
            existing_tokens = existing_tokens[-5:]

        # Update user document
        user_ref.set({"fcm_tokens": existing_tokens}, merge=True)

        logger.info(f"Stored FCM token for user {uid} (platform: {platform})")
        return True

    except Exception as e:
        logger.error(f"Failed to store FCM token for {uid}: {e}")
        return False


async def remove_fcm_token(uid: str, token: str) -> bool:
    """Remove a specific FCM token (e.g., on logout or token invalidation)."""
    if not is_firebase_available():
        return False

    try:
        db = get_db()
        user_ref = db.collection("users").document(uid)

        user_doc = user_ref.get()
        if not user_doc.exists:
            return False

        existing_tokens = user_doc.to_dict().get("fcm_tokens", [])
        updated_tokens = [t for t in existing_tokens if t.get("token") != token]

        user_ref.set({"fcm_tokens": updated_tokens}, merge=True)
        return True

    except Exception as e:
        logger.error(f"Failed to remove FCM token for {uid}: {e}")
        return False


async def get_user_fcm_tokens(uid: str) -> list[str]:
    """Get all FCM tokens for a user."""
    if not is_firebase_available():
        return []

    try:
        db = get_db()
        user_doc = db.collection("users").document(uid).get()

        if not user_doc.exists:
            return []

        tokens = user_doc.to_dict().get("fcm_tokens", [])
        return [t.get("token") for t in tokens if t.get("token")]

    except Exception as e:
        logger.error(f"Failed to get FCM tokens for {uid}: {e}")
        return []


async def send_notification_to_user(
    uid: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    notification_id: Optional[str] = None,
) -> int:
    """
    Send a push notification to all of a user's devices.
    Returns the number of successfully sent notifications.
    """
    tokens = await get_user_fcm_tokens(uid)
    if not tokens:
        logger.info(f"No FCM tokens for user {uid}, skipping notification")
        return 0

    # Prepare notification data
    notification_data = data or {}
    if notification_id:
        notification_data["notification_id"] = notification_id

    success_count = 0
    failed_tokens = []

    for token in tokens:
        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body,
                ),
                data={k: str(v) for k, v in notification_data.items()},
                token=token,
            )
            messaging.send(message)
            success_count += 1
        except messaging.UnregisteredError:
            # Token is invalid, mark for removal
            failed_tokens.append(token)
        except Exception as e:
            logger.error(f"Failed to send notification to token {token[:20]}...: {e}")

    # Clean up invalid tokens
    for token in failed_tokens:
        await remove_fcm_token(uid, token)
        logger.info(f"Removed invalid FCM token for user {uid}")

    return success_count


async def track_notification_opened(uid: str, notification_id: str) -> bool:
    """Track when a user opens a notification (for analytics)."""
    if not is_firebase_available():
        return False

    try:
        db = get_db()

        # Log to notification_logs collection
        db.collection("notification_logs").add({
            "user_id": uid,
            "notification_id": notification_id,
            "opened_at": datetime.now(timezone.utc).isoformat(),
            "action": "opened",
        })

        logger.info(f"Tracked notification opened: {notification_id} by user {uid}")
        return True

    except Exception as e:
        logger.error(f"Failed to track notification opened: {e}")
        return False
