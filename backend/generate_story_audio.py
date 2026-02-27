"""
Generate TTS narration audio for all alpha stories.

EN: OpenAI tts-1 "shimmer" — warm, expressive, story-telling prosody
HI: OpenAI tts-1 "nova"    — warmer tone, handles Hindi/Devanagari well

Uploads MP3s to Cloudinary (resource_type="raw") and saves
audio_url_en + audio_url_hi back to each block in Firestore under
  static_stories/{storyId}/formats/standard/blocks

Usage:
  python3 generate_story_audio.py              # all stories
  python3 generate_story_audio.py --id maha-001  # single story
  python3 generate_story_audio.py --dry-run    # preview only
"""
import os
import json
import logging
import argparse
import asyncio
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

import httpx
import cloudinary
import cloudinary.uploader
import firebase_admin
from firebase_admin import credentials, firestore

# ── Firebase ──────────────────────────────────────────────────────────────────
SERVICE_ACCOUNT = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_KEY"])
cred = credentials.Certificate(SERVICE_ACCOUNT)
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)
db = firestore.client()

# ── Cloudinary ────────────────────────────────────────────────────────────────
cloudinary.config(cloudinary_url=os.environ["CLOUDINARY_URL"])

# ── Block text extraction ─────────────────────────────────────────────────────

SKIP_TYPES = {"divider", "audio", "image"}

# Which field holds the narration text for each block type
BLOCK_TEXT_FIELD = {
    "hook":            "content",
    "text":            "content",
    "story_body":      "content",
    "blessing":        "content",
    "reflection":      "question",
    "discussion":      "question",
    "quiz":            "question",
    "value_highlight": "explanation",
    "character_intro": "name",
}


def get_block_text(block: dict, lang: str) -> str | None:
    btype = block.get("type", "")
    if btype in SKIP_TYPES:
        return None
    field = BLOCK_TEXT_FIELD.get(btype)
    if not field:
        return None
    val = block.get(field)
    if isinstance(val, dict):
        return (val.get(lang) or "").strip() or None
    return (val or "").strip() or None


# ── TTS generation ────────────────────────────────────────────────────────────

async def openai_tts(text: str, lang: str) -> bytes:
    """Generate TTS via OpenAI API.
    EN: shimmer voice — warm, narrative, child-friendly
    HI: nova voice   — warmer tone, handles Devanagari text
    """
    voice = "shimmer" if lang == "en" else "nova"
    api_key = os.environ["OPENAI_API_KEY"]
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.openai.com/v1/audio/speech",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "tts-1",
                "input": text,
                "voice": voice,
                "response_format": "mp3",
            },
            timeout=60.0,
        )
        r.raise_for_status()
        return r.content


# ── Cloudinary upload ─────────────────────────────────────────────────────────

def upload_audio(audio_bytes: bytes, story_id: str, block_id: str, lang: str) -> str:
    """Upload MP3 bytes to Cloudinary and return the secure URL."""
    public_id = f"{story_id}/{block_id}_{lang}"
    result = cloudinary.uploader.upload(
        audio_bytes,
        resource_type="raw",
        folder="story-audio",
        public_id=public_id,
        overwrite=True,
        format="mp3",
    )
    return result["secure_url"]


# ── Story processing ──────────────────────────────────────────────────────────

async def process_story(story_id: str, dry_run: bool = False):
    log.info(f"\n{'─'*60}\n[{story_id}]")
    doc_ref = db.collection("static_stories").document(story_id)
    doc = doc_ref.get()
    if not doc.exists:
        log.warning(f"  Story not found in Firestore — skipping")
        return

    story = doc.to_dict()
    formats = story.get("formats", {})
    standard = formats.get("standard", {})
    blocks: list[dict] = standard.get("blocks", [])

    if not blocks:
        log.warning(f"  No blocks in formats.standard — skipping")
        return

    log.info(f"  {len(blocks)} blocks found")
    updated = False

    for block in blocks:
        bid = block.get("id", "?")
        btype = block.get("type", "?")

        if btype in SKIP_TYPES:
            continue

        needs_en = not block.get("audio_url_en")
        needs_hi = not block.get("audio_url_hi")

        if not needs_en and not needs_hi:
            log.info(f"  {bid} ({btype}): audio already present — skipping")
            continue

        for lang, needs in [("en", needs_en), ("hi", needs_hi)]:
            if not needs:
                continue
            text = get_block_text(block, lang)
            if not text:
                log.info(f"  {bid} {lang.upper()}: no text — skipping")
                continue

            log.info(f"  {bid} {lang.upper()} ({btype}): {len(text)} chars")
            if dry_run:
                log.info(f"    [DRY RUN] would generate: \"{text[:60]}...\"")
                continue

            try:
                audio = await openai_tts(text, lang)
                url = upload_audio(audio, story_id, bid, lang)
                block[f"audio_url_{lang}"] = url
                log.info(f"    ✓ {url}")
                updated = True
            except Exception as e:
                log.error(f"    ✗ Failed ({lang}): {e}")

    if updated and not dry_run:
        doc_ref.update({"formats.standard.blocks": blocks})
        log.info(f"  ✓ Firestore updated")
    elif dry_run:
        log.info(f"  [DRY RUN] no writes")
    else:
        log.info(f"  No updates needed")


async def main():
    parser = argparse.ArgumentParser(description="Generate TTS narration for story blocks")
    parser.add_argument("--id", help="Process a single story_id (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without generating audio")
    args = parser.parse_args()

    if args.dry_run:
        log.info("DRY RUN — no API calls or writes will be made\n")

    if args.id:
        await process_story(args.id, dry_run=args.dry_run)
    else:
        stories = list(db.collection("static_stories").stream())
        story_ids = [s.id for s in stories]
        log.info(f"Found {len(story_ids)} stories: {story_ids}\n")
        for sid in story_ids:
            await process_story(sid, dry_run=args.dry_run)

    log.info("\n✅ Done!")


if __name__ == "__main__":
    asyncio.run(main())
