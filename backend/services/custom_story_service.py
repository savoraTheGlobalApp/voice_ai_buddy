"""
Custom Story Service

Generates bilingual block-based stories on demand using GPT-4o-mini.
TTS audio + cover image are generated asynchronously as background tasks.

Firestore path: users/{uid}/custom_stories/{story_id}
Cloudinary path: custom-story-audio/{story_id}/{block_id}_{lang}.mp3
Cloudinary path: custom-story-covers/{story_id}.png
"""
import os
import json
import secrets
import logging
import asyncio
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

BLOCKS_BY_LENGTH = {
    "short":  10,
    "medium": 16,
    "long":   20,
}

SEQUENCE_BY_LENGTH = {
    "short":  "hook → story_body×5 → character_intro → story_body×1 → value_highlight → reflection",
    "medium": "hook → character_intro → story_body×7 → discussion → story_body×2 → value_highlight×2 → reflection → blessing",
    "long":   "hook → character_intro×2 → story_body×9 → discussion×2 → story_body×1 → value_highlight×2 → reflection → blessing",
}

LLM_SYSTEM_PROMPT = """You generate children's stories (ages 5–10) as bilingual JSON blocks.

Block types and required fields (JSON schema):
  hook:             { "id": "block-N", "type": "hook",            "content": {"en": "...", "hi": "..."} }
  story_body:       { "id": "block-N", "type": "story_body",      "content": {"en": "...", "hi": "..."} }
  character_intro:  { "id": "block-N", "type": "character_intro", "characterId": "char-N", "name": {"en":"..","hi":".."}, "description": {"en":"..","hi":".."}, "avatar": "🦸", "trait": {"en":"..","hi":".."} }
  value_highlight:  { "id": "block-N", "type": "value_highlight", "value": "courage", "explanation": {"en":"..","hi":".."} }
  reflection:       { "id": "block-N", "type": "reflection",      "question": {"en": "...", "hi": "..."} }
  discussion:       { "id": "block-N", "type": "discussion",      "question": {"en": "...", "hi": "..."} }
  blessing:         { "id": "block-N", "type": "blessing",        "content": {"en": "...", "hi": "..."} }

Rules:
- Each block: 2–4 short sentences. Warm, imaginative, age-appropriate.
- Hindi: simple conversational Devanagari (not overly formal).
- IDs: sequential "block-0", "block-1", etc.
- Output exactly {N} blocks. Rough sequence: {SEQUENCE}
- For mythology categories: include 1–2 character_intro blocks.
- value_highlight "value" field: single English word (e.g., "courage", "kindness").

Return ONLY valid JSON (no markdown):
{ "title": {"en":"...", "hi":"..."}, "values": ["value1", "value2"], "blocks": [...] }"""


def _build_user_prompt(
    category: str,
    request: Dict[str, Any],
    child_name: str,
    child_age: int,
    length: str,
) -> str:
    """Build category-specific user prompt for the LLM."""
    n = BLOCKS_BY_LENGTH.get(length, 16)
    base = f"Child's name: {child_name}. Age: {child_age}. Story length: {n} blocks.\n"

    if category == "habits":
        habit = request.get("habit", "healthy eating")
        challenge = request.get("challenge", "gets distracted")
        helper = request.get("helper", "magical creature")
        return f"{base}Story about {child_name} learning to {habit}. Struggles because {challenge}. A {helper} appears to guide them."

    elif category == "emotions":
        emotions = ", ".join(request.get("emotions", ["worry"]))
        trigger = request.get("trigger", "first time at something new")
        resolution = request.get("resolution", "with parent's help")
        return f"{base}Story where {child_name} experiences {emotions}. Feeling starts when {trigger}. Resolved by {resolution}. Show healthy emotional regulation."

    elif category == "moral_values":
        value = request.get("value", "kindness")
        dilemma = request.get("dilemma", "found something not theirs")
        setting = request.get("setting", "school")
        return f"{base}Story where {child_name} faces a dilemma: {dilemma}. Set in: {setting}. Naturally show why {value} matters."

    elif category == "mahabharata":
        characters = ", ".join(request.get("characters", ["Arjuna"]))
        theme = request.get("theme", "Bhagavad Gita teachings")
        lang_style = (
            "Simple language for young children"
            if request.get("language_style") == "simple"
            else "Classical language appropriate for older children"
        )
        return f"{base}Retell episode from Mahabharata: {theme}, featuring {characters}. {lang_style}. Weave in appropriate dharmic values."

    elif category == "ramayana":
        characters = ", ".join(request.get("characters", ["Rama"]))
        theme = request.get("theme", "Hanuman's great leap")
        lang_style = (
            "Simple language for young children"
            if request.get("language_style") == "simple"
            else "Classical language appropriate for older children"
        )
        return f"{base}Retell episode from Ramayana: {theme}, featuring {characters}. {lang_style}. Weave in appropriate values of devotion and righteousness."

    else:
        topics = ", ".join(request.get("topics", ["adventure"]))
        values = ", ".join(request.get("values", ["kindness"]))
        return f"{base}Story about {topics}. Teach values: {values}."


def _build_image_prompt(title: Dict, category: str, values: List[str], request: Dict) -> str:
    """Build a child-friendly Imagen prompt from story metadata."""
    style = (
        "A beautiful children's book illustration in warm, vibrant watercolor style. "
        "Colorful, magical, child-friendly. No text or letters in the image."
    )
    title_en = title.get("en", "a story") if isinstance(title, dict) else str(title)
    values_str = " and ".join(values[:2]) if values else "kindness"

    if category == "habits":
        habit = request.get("habit", "healthy habits")
        helper = request.get("helper", "a magical creature")
        return f"{style} A joyful Indian child learning to {habit}, guided by {helper}. Theme: {values_str}. Warm sunrise colors."

    elif category == "emotions":
        emotions = ", ".join(request.get("emotions", ["happiness"])[:2])
        return f"{style} An expressive Indian child feeling {emotions}. Soft pastel background with glowing light. Theme: {values_str}."

    elif category == "moral_values":
        value = request.get("value", "kindness")
        setting = request.get("setting", "a village")
        return f"{style} Indian children showing {value} in {setting}. Golden hour lighting. Theme: {values_str}."

    elif category == "mahabharata":
        characters = ", ".join(request.get("characters", ["Arjuna"])[:2])
        theme = request.get("theme", "the great battle")
        return f"{style} Epic scene from the Mahabharata: {theme}, featuring {characters}. Rich jewel tones, ancient Indian setting."

    elif category == "ramayana":
        characters = ", ".join(request.get("characters", ["Rama"])[:2])
        theme = request.get("theme", "Hanuman's great leap")
        return f"{style} Magical scene from the Ramayana: {theme}, featuring {characters}. Divine golden light, ancient Indian landscape."

    else:
        return f"{style} {title_en}. Featuring Indian characters. Theme of {values_str}. Warm, uplifting colors."


async def generate_cover_image(story_id: str, title: Dict, category: str, values: List[str], request: Dict) -> Optional[str]:
    """
    Generate a cover image using Vertex AI Imagen 3, upload to Cloudinary.
    Returns the Cloudinary URL or None on failure.
    Cost: ~$0.03 per image (Imagen 3 standard).
    """
    import cloudinary
    import cloudinary.uploader

    try:
        creds_json = os.environ.get("GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY")
        if not creds_json:
            logger.warning("[image-bg] GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY not set, skipping image generation")
            return None

        creds_dict = json.loads(creds_json)
        project_id = creds_dict["project_id"]

        # Write creds to temp file for Vertex AI auth
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(creds_dict, f)
            creds_file = f.name

        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_file

        from google import genai
        from google.genai import types as genai_types

        client = genai.Client(vertexai=True, project=project_id, location="us-central1")
        prompt = _build_image_prompt(title, category, values, request)

        logger.info(f"[image-bg] Generating cover image for {story_id}...")

        def _generate():
            return client.models.generate_images(
                model="imagen-3.0-generate-002",
                prompt=prompt,
                config=genai_types.GenerateImagesConfig(
                    number_of_images=1,
                    aspect_ratio="4:3",
                ),
            )

        response = await asyncio.to_thread(_generate)

        os.unlink(creds_file)

        if not response.generated_images:
            logger.warning(f"[image-bg] Imagen returned no images for {story_id}")
            return None

        image_bytes = response.generated_images[0].image.image_bytes

        # Upload to Cloudinary
        cloudinary_url = os.environ.get("CLOUDINARY_URL")
        if cloudinary_url:
            cloudinary.config(cloudinary_url=cloudinary_url)

        def _upload(img_bytes=image_bytes):
            return cloudinary.uploader.upload(
                img_bytes,
                resource_type="image",
                folder="custom-story-covers",
                public_id=story_id,
                overwrite=True,
                format="png",
            )

        result = await asyncio.to_thread(_upload)
        url = result["secure_url"]
        logger.info(f"[image-bg] Cover image uploaded for {story_id}: {url}")
        return url

    except Exception as e:
        logger.error(f"[image-bg] Cover image generation failed for {story_id}: {e}")
        return None


def _normalize_blocks(blocks: List[Dict]) -> List[Dict]:
    """Add order field, ensure IDs and characterIds are present."""
    result = []
    for i, block in enumerate(blocks):
        b = dict(block)
        b["id"] = b.get("id", f"block-{i}")
        b["order"] = i
        if b.get("type") == "character_intro" and "characterId" not in b:
            name = b.get("name", {})
            en_name = name.get("en", f"char-{i}") if isinstance(name, dict) else f"char-{i}"
            b["characterId"] = en_name.lower().replace(" ", "-")[:20]
        result.append(b)
    return result


async def generate_custom_story(
    uid: str,
    request: Dict[str, Any],
    child_name: str = "Little One",
    child_age: int = 6,
) -> Dict[str, Any]:
    """
    Generate a custom story using GPT-4o-mini.

    Saves to Firestore with audio_status="pending".
    Returns the story doc formatted as BlockBasedContent + audio_status.
    """
    import httpx
    import json
    from services.firebase_service import get_db, is_firebase_available

    category = request.get("category", "habits")
    length = request.get("length", "medium")
    n_blocks = BLOCKS_BY_LENGTH.get(length, 16)
    sequence = SEQUENCE_BY_LENGTH.get(length, SEQUENCE_BY_LENGTH["medium"])

    system_prompt = LLM_SYSTEM_PROMPT.replace("{N}", str(n_blocks)).replace("{SEQUENCE}", sequence)
    user_prompt = _build_user_prompt(category, request, child_name, child_age, length)

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not configured")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.8,
                "max_tokens": 4000,
                "response_format": {"type": "json_object"},
            },
            timeout=90.0,
        )
        resp.raise_for_status()
        result = resp.json()

    story_data = json.loads(result["choices"][0]["message"]["content"])
    blocks = _normalize_blocks(story_data.get("blocks", []))
    title = story_data.get("title", {"en": "My Story", "hi": "मेरी कहानी"})
    values = story_data.get("values", [])

    story_id = f"cstory-{secrets.token_hex(6)}"
    reading_time = max(1, round(n_blocks * 0.5))

    story_doc = {
        "story_id": story_id,
        "title": title,
        "category": category,
        "audio_status": "pending",
        "image_status": "pending",
        "cover_image_url": None,
        "values": values,
        "blocks": blocks,
        "metadata": {
            "blocks_count": len(blocks),
            "length": length,
            "reading_time_minutes": reading_time,
        },
        "request": request,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if is_firebase_available():
        try:
            db = get_db()
            doc_ref = db.collection("users").document(uid).collection("custom_stories").document(story_id)
            await asyncio.to_thread(lambda: doc_ref.set(story_doc))
        except Exception as e:
            logger.error(f"Failed to save custom story {story_id} to Firestore: {e}")

    return _story_to_block_content(story_doc)


async def generate_audio_background(uid: str, story_id: str, blocks: List[Dict], story_meta: Optional[Dict] = None) -> None:
    """
    Background task: generate TTS audio for all blocks + cover image in parallel.
    Uploads to Cloudinary, updates Firestore blocks with audio URLs and cover_image_url.
    """
    import cloudinary
    import cloudinary.uploader
    from services.firebase_service import get_db, is_firebase_available
    from services.tts_service import get_tts_provider, extract_block_text

    cloudinary_url = os.environ.get("CLOUDINARY_URL")
    if cloudinary_url:
        cloudinary.config(cloudinary_url=cloudinary_url)

    logger.info(f"[assets-bg] Starting asset generation for {story_id} ({len(blocks)} blocks)")

    # Kick off image generation in parallel with audio
    meta = story_meta or {}
    image_task = asyncio.create_task(
        generate_cover_image(
            story_id=story_id,
            title=meta.get("title", {}),
            category=meta.get("category", ""),
            values=meta.get("values", []),
            request=meta.get("request", {}),
        )
    )

    # Audio generation
    try:
        provider = get_tts_provider()
        updated_blocks = [dict(b) for b in blocks]
        audio_ok = 0

        for i, block in enumerate(updated_blocks):
            block_id = block.get("id", f"block-{i}")
            for lang in ("en", "hi"):
                text = extract_block_text(block, lang)
                if not text:
                    continue
                try:
                    audio_bytes = await asyncio.wait_for(
                        provider.synthesize(text, lang), timeout=30.0
                    )
                    public_id = f"{story_id}/{block_id}_{lang}"

                    def _upload(ab=audio_bytes, pid=public_id):
                        return cloudinary.uploader.upload(
                            ab,
                            resource_type="raw",
                            folder="custom-story-audio",
                            public_id=pid,
                            overwrite=True,
                            format="mp3",
                        )

                    result = await asyncio.to_thread(_upload)
                    block[f"audio_url_{lang}"] = result["secure_url"]
                    audio_ok += 1
                    logger.info(f"[audio-bg] {block_id} {lang.upper()}: uploaded ({audio_ok} done)")
                except Exception as e:
                    logger.error(f"[audio-bg] Failed TTS for {block_id} {lang}: {e}")

        # Wait for image to finish
        cover_image_url = await image_task

        if is_firebase_available():
            db = get_db()
            doc_ref = db.collection("users").document(uid).collection("custom_stories").document(story_id)
            final_status = "ready" if audio_ok > 0 else "failed"
            update_data = {
                "blocks": updated_blocks,
                "audio_status": final_status,
                "image_status": "ready" if cover_image_url else "failed",
                "cover_image_url": cover_image_url,
            }
            await asyncio.to_thread(lambda: doc_ref.update(update_data))
            logger.info(f"[assets-bg] Done for {story_id}: audio={final_status}, image={'ready' if cover_image_url else 'failed'}")
        else:
            logger.warning(f"[assets-bg] Firebase unavailable — cannot update statuses for {story_id}")

    except Exception as e:
        logger.error(f"[assets-bg] Asset generation failed for {story_id}: {e}")
        # Cancel image task if still running
        if not image_task.done():
            image_task.cancel()
        try:
            if is_firebase_available():
                db = get_db()
                doc_ref = db.collection("users").document(uid).collection("custom_stories").document(story_id)
                await asyncio.to_thread(lambda: doc_ref.update({"audio_status": "failed", "image_status": "failed"}))
        except Exception as update_err:
            logger.error(f"[assets-bg] Failed to mark statuses=failed for {story_id}: {update_err}")


async def get_custom_story(uid: str, story_id: str) -> Optional[Dict[str, Any]]:
    """Get a custom story by ID, formatted as BlockBasedContent + audio_status."""
    from services.firebase_service import get_db, is_firebase_available

    if not is_firebase_available():
        return None

    try:
        db = get_db()
        doc_ref = db.collection("users").document(uid).collection("custom_stories").document(story_id)
        doc = await asyncio.to_thread(lambda: doc_ref.get())

        if not doc.exists:
            return None

        return _story_to_block_content(doc.to_dict())
    except Exception as e:
        logger.error(f"Failed to get custom story {story_id} for uid={uid}: {e}")
        return None


async def list_custom_stories(uid: str) -> List[Dict[str, Any]]:
    """List custom stories for a user (lightweight summary, newest first)."""
    from services.firebase_service import get_db, is_firebase_available

    if not is_firebase_available():
        return []

    try:
        db = get_db()
        docs = await asyncio.to_thread(
            lambda: list(
                db.collection("users").document(uid).collection("custom_stories").stream()
            )
        )

        stories = []
        for doc in docs:
            data = doc.to_dict()
            stories.append({
                "story_id": data.get("story_id"),
                "title": data.get("title", {"en": "Story", "hi": "कहानी"}),
                "category": data.get("category", ""),
                "audio_status": data.get("audio_status", "pending"),
                "values": data.get("values", []),
                "metadata": data.get("metadata", {}),
                "created_at": data.get("created_at"),
            })

        stories.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return stories
    except Exception as e:
        logger.error(f"Failed to list custom stories for uid={uid}: {e}")
        return []


async def count_custom_stories(uid: str) -> int:
    """Count total custom stories for a user (for limit enforcement)."""
    from services.firebase_service import get_db, is_firebase_available

    if not is_firebase_available():
        return 0

    try:
        db = get_db()
        docs = await asyncio.to_thread(
            lambda: list(
                db.collection("users").document(uid).collection("custom_stories").stream()
            )
        )
        return len(docs)
    except Exception as e:
        logger.error(f"Failed to count custom stories for uid={uid}: {e}")
        return 0


async def delete_custom_story(uid: str, story_id: str) -> bool:
    """Delete a custom story from Firestore and clean up Cloudinary audio."""
    import cloudinary.api
    from services.firebase_service import get_db, is_firebase_available

    success = True

    if is_firebase_available():
        try:
            db = get_db()
            doc_ref = db.collection("users").document(uid).collection("custom_stories").document(story_id)
            await asyncio.to_thread(lambda: doc_ref.delete())
        except Exception as e:
            logger.error(f"Failed to delete Firestore doc for {story_id}: {e}")
            success = False

    # Best-effort Cloudinary cleanup
    try:
        await asyncio.to_thread(
            lambda: cloudinary.api.delete_resources_by_prefix(
                f"custom-story-audio/{story_id}/",
                resource_type="raw",
            )
        )
    except Exception as e:
        logger.warning(f"Cloudinary cleanup failed for {story_id}: {e}")

    return success


def _story_to_block_content(data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert custom story Firestore doc to BlockBasedContent + audio_status."""
    metadata = data.get("metadata", {})
    return {
        "contentId": data.get("story_id", ""),
        "title": data.get("title", {"en": "Story", "hi": "कहानी"}),
        "category": data.get("category", ""),
        "blocks": data.get("blocks", []),
        "display": {
            "navigation": "scroll",
            "theme": "adventure",
            "showProgress": True,
        },
        "metadata": {
            "reading_time_minutes": metadata.get("reading_time_minutes", 5),
            "values": data.get("values", []),
            "characters": [],
            "difficulty_level": "beginner",
        },
        "cover_image_url": data.get("cover_image_url"),
        "audio_status": data.get("audio_status", "pending"),
        "image_status": data.get("image_status", "pending"),
        "created_at": data.get("created_at"),
    }
