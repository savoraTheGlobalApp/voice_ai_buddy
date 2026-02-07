"""
Per-user rate limiting with tier-based limits.
Uses SlowAPI backed by in-memory storage.
"""
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import Request, HTTPException
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger(__name__)

# In-memory cache for subscription tiers: {uid: (tier, timestamp)}
_tier_cache: dict[str, tuple[str, float]] = {}
TIER_CACHE_TTL = 300  # 5 minutes


def _get_uid_from_request(request: Request) -> str:
    """
    Extract user uid from the request state (set by auth middleware).
    Falls back to client IP if no auth token is present.
    """
    # The auth dependency stores decoded token on the endpoint level,
    # but SlowAPI key functions run before the endpoint. So we parse
    # the token from the Authorization header directly here.
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            from firebase_admin import auth as firebase_auth
            from services.firebase_service import get_firebase_app
            get_firebase_app()
            token = auth_header.split("Bearer ", 1)[1]
            decoded = firebase_auth.verify_id_token(token)
            return decoded.get("uid", request.client.host)
        except Exception:
            pass
    return request.client.host


def get_subscription_tier(uid: str) -> str:
    """
    Get user's subscription tier from Firestore with caching.
    Returns "free" or "premium".
    """
    now = time.time()
    cached = _tier_cache.get(uid)
    if cached and (now - cached[1]) < TIER_CACHE_TTL:
        return cached[0]

    tier = "free"
    try:
        from services.firebase_service import is_firebase_available, get_db
        if is_firebase_available():
            db = get_db()
            doc = db.collection("users").document(uid).get()
            if doc.exists:
                tier = doc.to_dict().get("subscription_tier", "free")
    except Exception as e:
        logger.warning(f"Failed to fetch subscription tier for {uid}: {e}")

    _tier_cache[uid] = (tier, now)
    return tier


# Create the limiter instance
limiter = Limiter(key_func=_get_uid_from_request)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """Custom handler for rate limit exceeded errors."""
    retry_after = exc.detail.split("per")[0].strip() if exc.detail else "later"
    raise HTTPException(
        status_code=429,
        detail=f"Rate limit exceeded. Try again {retry_after}.",
        headers={"Retry-After": str(retry_after)},
    )


# --- Rate limit strings per tier ---

RATE_LIMITS = {
    "story_generate": {"free": "10/day", "premium": "50/day"},
    "story_read":     {"free": "30/day", "premium": "200/day"},
    "tts":            {"free": "20/day", "premium": "200/day"},
    "chat":           {"free": "30/day", "premium": "200/day"},
}


def get_limit_for(category: str, uid: str) -> str:
    """Get the rate limit string for a category based on user's tier."""
    tier = get_subscription_tier(uid)
    return RATE_LIMITS.get(category, {}).get(tier, "10/day")


# --- Usage tracking ---

async def track_usage(uid: str, category: str) -> None:
    """
    Increment usage counter in Firestore for the current day.
    Non-blocking — failures are logged but don't affect the request.
    """
    try:
        from services.firebase_service import is_firebase_available, get_db
        if not is_firebase_available():
            return

        db = get_db()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        usage_ref = db.collection("users").document(uid).collection("usage").document(today)

        from google.cloud.firestore_v1 import Increment
        usage_ref.set({category: Increment(1)}, merge=True)
    except Exception as e:
        logger.warning(f"Failed to track usage for {uid}/{category}: {e}")


async def get_usage_summary(uid: str) -> dict:
    """Get today's usage counts for a user."""
    try:
        from services.firebase_service import is_firebase_available, get_db
        if not is_firebase_available():
            return {}

        db = get_db()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        doc = db.collection("users").document(uid).collection("usage").document(today).get()

        if doc.exists:
            data = doc.to_dict()
            tier = get_subscription_tier(uid)
            return {
                "date": today,
                "tier": tier,
                "stories_generated": data.get("stories_generated", 0),
                "tts_calls": data.get("tts_calls", 0),
                "chat_calls": data.get("chat_calls", 0),
                "limits": {k: v[tier] for k, v in RATE_LIMITS.items()},
            }
        return {"date": today, "tier": get_subscription_tier(uid)}
    except Exception as e:
        logger.warning(f"Failed to get usage summary for {uid}: {e}")
        return {}
