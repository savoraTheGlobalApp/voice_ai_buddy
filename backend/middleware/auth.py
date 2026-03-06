"""
Firebase Auth token verification middleware for FastAPI.
Provides dependencies for authenticating requests via Firebase ID tokens.
"""
import logging
from typing import Optional

from fastapi import HTTPException, Request
from firebase_admin import auth as firebase_auth

from services.firebase_service import get_firebase_app

logger = logging.getLogger(__name__)


async def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency that extracts and verifies a Firebase ID token
    from the Authorization header.

    Returns:
        Decoded token dict with uid, email, etc.

    Raises:
        HTTPException 401: Missing or invalid token
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Expected: Bearer <token>"
        )

    token = auth_header.split("Bearer ", 1)[1]

    try:
        get_firebase_app()
        decoded_token = firebase_auth.verify_id_token(token)
        request.state.uid = decoded_token.get("uid")
        return decoded_token
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except firebase_auth.RevokedIdTokenError:
        raise HTTPException(status_code=401, detail="Token has been revoked")
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed")


def require_user_match(uid: str, token: dict) -> None:
    """
    Verify that the path uid matches the authenticated user's uid.

    Args:
        uid: The uid from the URL path parameter
        token: The decoded Firebase token from get_current_user

    Raises:
        HTTPException 403: If the uid does not match the authenticated user
    """
    if token.get("uid") != uid:
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to access this user's resources"
        )
