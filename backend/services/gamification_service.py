"""
Gamification Service (MVP)
Handles character unlocks and basic gamification features.
"""
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def unlock_character(uid: str, character_id: str, character_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Unlock a character for a user.

    Args:
        uid: User ID
        character_id: Character identifier (e.g., "krishna", "arjuna")
        character_data: Character metadata (name, description, avatar, etc.)

    Returns:
        Updated character document
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            raise Exception("Firebase not available")

        db = get_db()
        char_ref = (
            db.collection("users")
            .document(uid)
            .collection("character_collection")
            .document(character_id)
        )

        # Check if already unlocked
        existing = char_ref.get()
        if existing.exists:
            logger.info(f"Character {character_id} already unlocked for user {uid}")
            return existing.to_dict()

        # Unlock the character
        now = datetime.now(timezone.utc)
        character_doc = {
            **character_data,
            "character_id": character_id,
            "unlocked_at": now,
        }

        char_ref.set(character_doc)

        logger.info(f"Unlocked character {character_id} for user {uid}")

        # Return with ISO timestamp
        result = dict(character_doc)
        result["unlocked_at"] = now.isoformat()
        return result

    except Exception as e:
        logger.error(f"Failed to unlock character {character_id} for {uid}: {e}")
        raise


async def get_user_characters(uid: str) -> List[Dict[str, Any]]:
    """
    Get all unlocked characters for a user.

    Args:
        uid: User ID

    Returns:
        List of unlocked character documents
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            return []

        db = get_db()
        chars_collection = (
            db.collection("users")
            .document(uid)
            .collection("character_collection")
        )

        docs = chars_collection.stream()
        characters = []

        for doc in docs:
            data = doc.to_dict()
            data["character_id"] = doc.id

            # Convert timestamp to ISO string if present
            if data.get("unlocked_at"):
                if hasattr(data["unlocked_at"], "isoformat"):
                    data["unlocked_at"] = data["unlocked_at"].isoformat()
                else:
                    data["unlocked_at"] = str(data["unlocked_at"])

            characters.append(data)

        logger.info(f"Retrieved {len(characters)} unlocked characters for user {uid}")
        return characters

    except Exception as e:
        logger.error(f"Failed to get characters for {uid}: {e}")
        return []


async def unlock_story_characters(uid: str, story_data: Dict[str, Any], character_metadata: List[Dict[str, Any]]) -> List[str]:
    """
    Unlock all characters featured in a story when user completes it.

    Args:
        uid: User ID
        story_data: Story document containing character IDs
        character_metadata: List of character metadata documents

    Returns:
        List of character IDs that were unlocked
    """
    try:
        character_ids = story_data.get("characters", [])
        unlocked = []

        # Create lookup dict for character metadata
        char_lookup = {c["character_id"]: c for c in character_metadata}

        for char_name in character_ids:
            # Convert name to ID (e.g., "Krishna" -> "krishna")
            char_id = char_name.lower()

            # Get metadata for this character
            char_data = char_lookup.get(char_id)

            if not char_data:
                logger.warning(f"No metadata found for character {char_id}")
                continue

            # Unlock the character
            await unlock_character(uid, char_id, char_data)
            unlocked.append(char_id)

        logger.info(f"Unlocked {len(unlocked)} characters for user {uid} from story completion")
        return unlocked

    except Exception as e:
        logger.error(f"Failed to unlock story characters for {uid}: {e}")
        return []


async def seed_character_metadata(character_data: Dict[str, Any]) -> bool:
    """
    Seed character metadata to a global collection.
    Used for initial data setup.

    Args:
        character_data: Character metadata

    Returns:
        True if successful
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            raise Exception("Firebase not available")

        db = get_db()
        char_id = character_data.get("character_id")

        if not char_id:
            raise ValueError("character_data must have a 'character_id' field")

        # Save to global character metadata collection
        db.collection("character_metadata").document(char_id).set(character_data)

        logger.info(f"Seeded character metadata: {char_id}")
        return True

    except Exception as e:
        logger.error(f"Failed to seed character: {e}")
        raise


async def get_character_metadata(character_id: str) -> Optional[Dict[str, Any]]:
    """
    Get character metadata from global collection.

    Args:
        character_id: Character identifier

    Returns:
        Character metadata or None
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            return None

        db = get_db()
        doc = db.collection("character_metadata").document(character_id).get()

        if not doc.exists:
            return None

        return doc.to_dict()

    except Exception as e:
        logger.error(f"Failed to get character metadata for {character_id}: {e}")
        return None


async def get_all_character_metadata() -> List[Dict[str, Any]]:
    """
    Get all character metadata from global collection.

    Returns:
        List of all character metadata
    """
    try:
        from services.firebase_service import is_firebase_available, get_db

        if not is_firebase_available():
            return []

        db = get_db()
        docs = db.collection("character_metadata").stream()

        characters = []
        for doc in docs:
            data = doc.to_dict()
            data["character_id"] = doc.id
            characters.append(data)

        logger.info(f"Retrieved {len(characters)} character metadata documents")
        return characters

    except Exception as e:
        logger.error(f"Failed to get all character metadata: {e}")
        return []
