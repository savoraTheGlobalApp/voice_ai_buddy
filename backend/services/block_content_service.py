"""
Block Content Service
Converts stories to server-driven block-based format for flexible content delivery.

Supports Named Formats System:
- Multiple content formats per story (standard, katha_night, interactive, etc.)
- Each format has its own content and display configuration
- Experiments control which format to serve
"""
import logging
import hashlib
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# ============================================
# Block Type Definitions
# ============================================

def create_text_block(
    block_id: str,
    order: int,
    content_en: str,
    content_hi: str,
    style: str = "normal"
) -> Dict[str, Any]:
    """Create a text block."""
    return {
        "id": block_id,
        "type": "text",
        "order": order,
        "content": {"en": content_en, "hi": content_hi},
        "style": style
    }


def create_hook_block(
    block_id: str,
    order: int,
    content_en: str,
    content_hi: str,
    icon: str = "🌙"
) -> Dict[str, Any]:
    """Create an attention-grabbing hook block."""
    return {
        "id": block_id,
        "type": "hook",
        "order": order,
        "content": {"en": content_en, "hi": content_hi},
        "icon": icon
    }


def create_story_body_block(
    block_id: str,
    order: int,
    content_en: str,
    content_hi: str,
    character_highlights: List[str] = None
) -> Dict[str, Any]:
    """Create a main story body block."""
    return {
        "id": block_id,
        "type": "story_body",
        "order": order,
        "content": {"en": content_en, "hi": content_hi},
        "characterHighlights": character_highlights or []
    }


def create_reflection_block(
    block_id: str,
    order: int,
    question_en: str,
    question_hi: str,
    prompt_en: str = None,
    prompt_hi: str = None,
    pause_duration: int = 10
) -> Dict[str, Any]:
    """Create a reflection/pause block."""
    block = {
        "id": block_id,
        "type": "reflection",
        "order": order,
        "question": {"en": question_en, "hi": question_hi},
        "pauseDuration": pause_duration
    }
    if prompt_en:
        block["prompt"] = {"en": prompt_en, "hi": prompt_hi or prompt_en}
    return block


def create_blessing_block(
    block_id: str,
    order: int,
    content_en: str,
    content_hi: str,
    character: str = None,
    icon: str = "🙏"
) -> Dict[str, Any]:
    """Create a sleep blessing block."""
    block = {
        "id": block_id,
        "type": "blessing",
        "order": order,
        "content": {"en": content_en, "hi": content_hi},
        "icon": icon
    }
    if character:
        block["character"] = character
    return block


def create_discussion_block(
    block_id: str,
    order: int,
    question_en: str,
    question_hi: str,
    hints: List[Dict[str, str]] = None
) -> Dict[str, Any]:
    """Create a discussion question block."""
    block = {
        "id": block_id,
        "type": "discussion",
        "order": order,
        "question": {"en": question_en, "hi": question_hi}
    }
    if hints:
        block["hints"] = hints
    return block


def create_divider_block(
    block_id: str,
    order: int,
    style: str = "stars"
) -> Dict[str, Any]:
    """Create a visual divider block."""
    return {
        "id": block_id,
        "type": "divider",
        "order": order,
        "style": style
    }


def create_value_highlight_block(
    block_id: str,
    order: int,
    value: str,
    explanation_en: str,
    explanation_hi: str,
    icon: str = None
) -> Dict[str, Any]:
    """Create a value highlight block."""
    block = {
        "id": block_id,
        "type": "value_highlight",
        "order": order,
        "value": value,
        "explanation": {"en": explanation_en, "hi": explanation_hi}
    }
    if icon:
        block["icon"] = icon
    return block


def create_quiz_block(
    block_id: str,
    order: int,
    question_en: str,
    question_hi: str,
    options: List[Dict[str, str]],
    correct_index: int,
    explanation_en: str,
    explanation_hi: str
) -> Dict[str, Any]:
    """Create a quiz block."""
    return {
        "id": block_id,
        "type": "quiz",
        "order": order,
        "question": {"en": question_en, "hi": question_hi},
        "options": options,
        "correctIndex": correct_index,
        "explanation": {"en": explanation_en, "hi": explanation_hi}
    }


# ============================================
# Format Converters (Legacy)
# ============================================

def static_story_segments_to_blocks(
    segments: List[Dict[str, Any]],
    characters: List[str]
) -> List[Dict[str, Any]]:
    """
    Convert StaticStory segments to blocks.

    Args:
        segments: List of story segments
        characters: List of character IDs

    Returns:
        List of content blocks
    """
    blocks = []
    order = 0

    for idx, segment in enumerate(segments):
        # Get narrative content
        narrative = segment.get("narrative", {})
        narrative_en = narrative.get("en", "") if isinstance(narrative, dict) else str(narrative)
        narrative_hi = narrative.get("hi", narrative_en) if isinstance(narrative, dict) else str(narrative)

        # Create story body block for each segment
        story_block = create_story_body_block(
            block_id=f"segment-{segment.get('segmentIndex', idx)}",
            order=order,
            content_en=narrative_en,
            content_hi=narrative_hi,
            character_highlights=characters
        )
        blocks.append(story_block)
        order += 1

        # Add discussion question if present
        discussion_q = segment.get("discussionQuestion")
        if discussion_q:
            q_en = discussion_q.get("en", "") if isinstance(discussion_q, dict) else str(discussion_q)
            q_hi = discussion_q.get("hi", q_en) if isinstance(discussion_q, dict) else str(discussion_q)

            discussion_block = create_discussion_block(
                block_id=f"discussion-{idx}",
                order=order,
                question_en=q_en,
                question_hi=q_hi
            )
            blocks.append(discussion_block)
            order += 1

        # Add divider between segments (except after last)
        if idx < len(segments) - 1:
            divider_block = create_divider_block(
                block_id=f"divider-{idx}",
                order=order,
                style="stars"
            )
            blocks.append(divider_block)
            order += 1

    return blocks


def katha_night_content_to_blocks(
    content: Dict[str, Any],
    characters: List[str],
    main_character: str = None
) -> List[Dict[str, Any]]:
    """
    Convert KathaNight content to blocks.

    Args:
        content: Katha Night content dict
        characters: List of character IDs
        main_character: Main character name

    Returns:
        List of content blocks
    """
    blocks = []
    order = 0

    if not main_character and characters:
        main_character = characters[0]

    # Opening hook block
    opening_hook = content.get("opening_hook", {})
    hook_block = create_hook_block(
        block_id="opening-hook",
        order=order,
        content_en=opening_hook.get("en", ""),
        content_hi=opening_hook.get("hi", ""),
        icon="🌙"
    )
    blocks.append(hook_block)
    order += 1

    # Divider
    blocks.append(create_divider_block("divider-1", order, "om"))
    order += 1

    # Main story body
    story_body = content.get("story_body", {})
    body_block = create_story_body_block(
        block_id="story-body",
        order=order,
        content_en=story_body.get("en", ""),
        content_hi=story_body.get("hi", ""),
        character_highlights=characters
    )
    blocks.append(body_block)
    order += 1

    # Divider
    blocks.append(create_divider_block("divider-2", order, "stars"))
    order += 1

    # Reflection moment
    reflection = content.get("reflection_moment", {})
    reflection_block = create_reflection_block(
        block_id="reflection",
        order=order,
        question_en=reflection.get("en", ""),
        question_hi=reflection.get("hi", ""),
        pause_duration=10
    )
    blocks.append(reflection_block)
    order += 1

    # Divider
    blocks.append(create_divider_block("divider-3", order, "om"))
    order += 1

    # Sleep blessing
    blessing = content.get("sleep_blessing", {})
    blessing_block = create_blessing_block(
        block_id="sleep-blessing",
        order=order,
        content_en=blessing.get("en", ""),
        content_hi=blessing.get("hi", ""),
        character=main_character,
        icon="🙏"
    )
    blocks.append(blessing_block)
    order += 1

    return blocks


# ============================================
# Named Formats System
# ============================================

def get_format_from_story(
    story: Dict[str, Any],
    format_name: str = None
) -> Optional[Dict[str, Any]]:
    """
    Get a specific format from a story document.

    Args:
        story: Story document
        format_name: Name of format to retrieve (e.g., "standard", "katha_night")

    Returns:
        Format dict or None if not found
    """
    # New format: Named formats
    if "formats" in story:
        formats = story["formats"]
        if format_name and format_name in formats:
            return formats[format_name]
        # Return default format
        default = story.get("default_format", "standard")
        return formats.get(default)

    # Legacy format: Check for old structure
    if format_name == "katha_night" and "content" in story:
        return {
            "type": "katha_night",
            "content": {"content": story["content"]},
            "display": {
                "navigation": "scroll",
                "theme": "bedtime",
                "showProgress": True
            }
        }

    # Legacy format: StaticStory with segments
    if "segments" in story:
        return {
            "type": "static_story",
            "content": {"segments": story["segments"]},
            "display": {
                "navigation": "paginated",
                "theme": "adventure",
                "showProgress": True
            }
        }

    return None


def format_to_blocks(
    format_data: Dict[str, Any],
    metadata: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Convert a format to blocks based on its type.

    Args:
        format_data: Format dict with type, content, display
        metadata: Shared story metadata

    Returns:
        List of content blocks
    """
    format_type = format_data.get("type", "static_story")
    content = format_data.get("content", {})
    characters = metadata.get("characters", [])

    if format_type == "katha_night":
        katha_content = content.get("content", content)
        main_char = metadata.get("main_character", characters[0] if characters else "the hero")
        return katha_night_content_to_blocks(katha_content, characters, main_char)

    elif format_type == "static_story":
        segments = content.get("segments", [])
        return static_story_segments_to_blocks(segments, characters)

    # Add more format types here as needed
    # elif format_type == "interactive_quiz":
    #     return quiz_story_to_blocks(content, characters)

    logger.warning(f"Unknown format type: {format_type}")
    return []


def story_to_blocks_with_format(
    story: Dict[str, Any],
    format_name: str = None
) -> Dict[str, Any]:
    """
    Convert any story format to BlockBasedContent using named formats.

    Args:
        story: Story document from Firestore
        format_name: Optional format name to use

    Returns:
        BlockBasedContent dictionary
    """
    # Extract metadata
    metadata = story.get("metadata", {})
    if not metadata:
        # Legacy: metadata at root level
        metadata = {
            "reading_time": story.get("reading_time", 5),
            "values": story.get("values", []),
            "characters": story.get("characters", []),
            "difficulty_level": story.get("difficulty_level", "beginner"),
        }

    # Get title (can be at root or in metadata)
    title = story.get("title", metadata.get("title", {"en": "Story", "hi": "कहानी"}))
    if isinstance(title, str):
        title = {"en": title, "hi": title}

    # Get the requested format
    format_data = get_format_from_story(story, format_name)
    if not format_data:
        logger.error(f"Format '{format_name}' not found in story {story.get('story_id')}")
        return None

    # Convert format to blocks
    blocks = format_to_blocks(format_data, metadata)

    # Get display config from format
    display = format_data.get("display", {
        "navigation": "paginated",
        "theme": "adventure",
        "showProgress": True
    })

    # Build BlockBasedContent
    return {
        "contentId": story.get("story_id", "unknown"),
        "title": title,
        "category": story.get("category", metadata.get("category", "mythology")),
        "blocks": blocks,
        "display": display,
        "metadata": {
            "reading_time_minutes": metadata.get("reading_time_minutes", metadata.get("reading_time", 5)),
            "values": metadata.get("values", []),
            "characters": metadata.get("characters", []),
            "difficulty_level": metadata.get("difficulty_level", "beginner")
        },
        "format_used": format_name or story.get("default_format", "standard"),
        "created_at": story.get("created_at")
    }


# ============================================
# Experiment System
# ============================================

# Active experiments configuration
EXPERIMENTS = {
    "katha-content-format": {
        "id": "katha-content-format",
        "name": "Katha Night vs Standard Format",
        "description": "Testing bedtime-optimized content vs standard segments",
        "variants": [
            {
                "id": "control",
                "weight": 50,
                "config": {
                    "format": "standard"  # Uses standard format
                }
            },
            {
                "id": "katha_night",
                "weight": 50,
                "config": {
                    "format": "katha_night"  # Uses katha_night format
                }
            }
        ],
        "active": True
    },
    "story-length": {
        "id": "story-length",
        "name": "Story Length Test",
        "description": "Testing shorter vs standard story content",
        "variants": [
            {"id": "standard", "weight": 70, "config": {"max_segments": 5}},
            {"id": "short", "weight": 30, "config": {"max_segments": 3}}
        ],
        "active": False  # Disabled for now
    }
}


async def get_user_experiment_override(user_id: str, experiment_id: str) -> Optional[str]:
    """
    Get stored experiment override for a user from their user document.

    Args:
        user_id: User's UID
        experiment_id: Experiment identifier

    Returns:
        Variant ID if override exists, None otherwise
    """
    try:
        from services.firebase_service import get_db
        db = get_db()
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()

        if user_doc.exists:
            user_data = user_doc.to_dict()
            experiment_overrides = user_data.get('experiment_overrides', {})
            return experiment_overrides.get(experiment_id)
    except Exception as e:
        logger.error(f"Failed to get user experiment override: {e}")

    return None


async def set_user_experiment_override(user_id: str, experiment_id: str, variant_id: str) -> bool:
    """
    Set experiment override for a user in their user document.

    Args:
        user_id: User's UID
        experiment_id: Experiment identifier
        variant_id: Variant to assign (e.g., "control", "katha_night")

    Returns:
        True if successful, False otherwise
    """
    try:
        from services.firebase_service import get_db
        db = get_db()
        user_ref = db.collection('users').document(user_id)

        # Update the experiment_overrides field
        user_ref.set({
            'experiment_overrides': {
                experiment_id: variant_id
            }
        }, merge=True)

        logger.info(f"Set experiment override for user {user_id}: {experiment_id} -> {variant_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to set user experiment override: {e}")
        return False


async def remove_user_experiment_override(user_id: str, experiment_id: str) -> bool:
    """
    Remove experiment override for a user (revert to hash-based assignment).

    Args:
        user_id: User's UID
        experiment_id: Experiment identifier

    Returns:
        True if successful, False otherwise
    """
    try:
        from services.firebase_service import get_db
        from google.cloud.firestore_v1 import FieldFilter

        db = get_db()
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()

        if user_doc.exists:
            user_data = user_doc.to_dict()
            experiment_overrides = user_data.get('experiment_overrides', {})

            if experiment_id in experiment_overrides:
                del experiment_overrides[experiment_id]
                user_ref.update({'experiment_overrides': experiment_overrides})
                logger.info(f"Removed experiment override for user {user_id}: {experiment_id}")

        return True
    except Exception as e:
        logger.error(f"Failed to remove user experiment override: {e}")
        return False


async def get_experiment_assignment(
    user_id: str,
    experiment_id: str,
    override_variant: str = None
) -> Optional[Dict[str, Any]]:
    """
    Get deterministic experiment assignment for a user.

    Priority:
    1. URL override parameter (for testing)
    2. User's stored override in Firestore
    3. Hash-based deterministic assignment

    Args:
        user_id: User's unique ID
        experiment_id: Experiment identifier
        override_variant: Optional override for testing

    Returns:
        Experiment info with assigned variant, or None if experiment not found
    """
    experiment = EXPERIMENTS.get(experiment_id)
    if not experiment or not experiment.get("active"):
        return None

    # Priority 1: URL override parameter (for testing)
    if override_variant:
        for variant in experiment["variants"]:
            if variant["id"] == override_variant:
                return {
                    "experimentId": experiment_id,
                    "variantId": variant["id"],
                    "experimentName": experiment.get("name"),
                    "config": variant.get("config", {})
                }

    # Priority 2: Check user's stored override in Firestore
    stored_variant = await get_user_experiment_override(user_id, experiment_id)
    if stored_variant:
        for variant in experiment["variants"]:
            if variant["id"] == stored_variant:
                return {
                    "experimentId": experiment_id,
                    "variantId": variant["id"],
                    "experimentName": experiment.get("name"),
                    "config": variant.get("config", {}),
                    "source": "user_override"  # Indicate this came from override
                }

    # Deterministic assignment using hash
    hash_input = f"{user_id}:{experiment_id}"
    hash_value = int(hashlib.md5(hash_input.encode()).hexdigest(), 16)
    bucket = hash_value % 100

    # Find variant based on weights
    cumulative = 0
    for variant in experiment["variants"]:
        cumulative += variant["weight"]
        if bucket < cumulative:
            return {
                "experimentId": experiment_id,
                "variantId": variant["id"],
                "experimentName": experiment.get("name"),
                "config": variant.get("config", {})
            }

    # Fallback to first variant
    variant = experiment["variants"][0]
    return {
        "experimentId": experiment_id,
        "variantId": variant["id"],
        "experimentName": experiment.get("name"),
        "config": variant.get("config", {})
    }


# ============================================
# Main API Functions
# ============================================

async def get_block_content(
    story_id: str,
    user_id: str = None,
    experiment_id: str = None,
    variant_override: str = None
) -> Optional[Dict[str, Any]]:
    """
    Get story as block-based content with automatic experiment assignment.

    Backend-driven experiments: Story document specifies which experiments apply.
    Frontend doesn't need to know about experiments.

    Args:
        story_id: Story identifier
        user_id: Optional user ID for experiment assignment
        experiment_id: Optional experiment to apply (legacy, overrides story config)
        variant_override: Optional variant override for testing

    Returns:
        BlockBasedContent dictionary or None if story not found
    """
    try:
        from services.static_story_service import get_static_story

        # Fetch the story
        story = await get_static_story(story_id)
        if not story:
            logger.warning(f"Story {story_id} not found")
            return None

        # Determine which format to use
        format_name = None
        experiment_info = None

        # Backend-driven: Check story's experiments configuration
        story_experiments = story.get("experiments", [])

        # Priority 1: Legacy experiment_id parameter (for backward compatibility)
        if experiment_id and user_id:
            experiment_info = await get_experiment_assignment(user_id, experiment_id, variant_override)
            if experiment_info:
                format_name = experiment_info.get("config", {}).get("format")
                logger.info(f"Using legacy experiment_id parameter: {experiment_id}")

        # Priority 2: Story's configured experiments (Backend decides)
        elif story_experiments and user_id:
            # Use first applicable experiment from story config
            # Future: Could support multiple experiments and merge configs
            for exp_id in story_experiments:
                experiment_info = await get_experiment_assignment(user_id, exp_id, variant_override)
                if experiment_info:
                    format_name = experiment_info.get("config", {}).get("format")
                    logger.info(f"Backend-driven experiment: {exp_id} for story {story_id}")
                    break

        # Convert to blocks using the selected format
        content = story_to_blocks_with_format(story, format_name)

        if not content:
            logger.error(f"Failed to convert story {story_id} to blocks")
            return None

        # Add experiment info if present
        if experiment_info:
            content["experiment"] = {
                "experimentId": experiment_info["experimentId"],
                "variantId": experiment_info["variantId"],
                "experimentName": experiment_info.get("experimentName")
            }

        logger.info(f"Generated block content for story {story_id}, format: {format_name or 'default'}")
        return content

    except Exception as e:
        logger.error(f"Failed to get block content for {story_id}: {e}")
        raise


async def get_all_experiments() -> List[Dict[str, Any]]:
    """
    Get all active experiments.

    Returns:
        List of experiment configurations
    """
    return [
        {
            "id": exp["id"],
            "name": exp["name"],
            "description": exp["description"],
            "variants": [{"id": v["id"], "weight": v["weight"]} for v in exp["variants"]],
            "active": exp["active"]
        }
        for exp in EXPERIMENTS.values()
    ]


async def update_experiment_weights(
    experiment_id: str,
    variant_weights: Dict[str, int]
) -> bool:
    """
    Update experiment variant weights.

    Args:
        experiment_id: Experiment identifier
        variant_weights: Dict of variant_id -> weight

    Returns:
        True if successful
    """
    experiment = EXPERIMENTS.get(experiment_id)
    if not experiment:
        return False

    for variant in experiment["variants"]:
        if variant["id"] in variant_weights:
            variant["weight"] = variant_weights[variant["id"]]

    # Normalize weights to sum to 100
    total = sum(v["weight"] for v in experiment["variants"])
    if total != 100:
        for variant in experiment["variants"]:
            variant["weight"] = int(variant["weight"] * 100 / total)

    logger.info(f"Updated weights for experiment {experiment_id}: {variant_weights}")
    return True
