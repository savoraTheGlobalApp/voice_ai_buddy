"""
Generate cover images for sacred stories using DALL-E 3,
upload to Cloudinary, and update Firestore with the URLs.

Usage: python3 add_cover_image.py
       STORY_IDS=rama-001,rama-002 python3 add_cover_image.py   # specific stories only
"""
import os
import json
import logging
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ── Story prompts ─────────────────────────────────────────────────────────────
STORY_PROMPTS = {
    "maha-001": (
        "Indian miniature painting style, dramatic Mahabharata scene on the battlefield of Kurukshetra. "
        "Arjuna stands in a golden chariot holding a divine bow, Krishna as charioteer glowing with divine light. "
        "Deep purple twilight sky, armies in the background, majestic and spiritual atmosphere. "
        "Rich jewel tones, gold accents, Rajput miniature painting aesthetic. No text, no letters."
    ),
    "rama-001": (
        "Indian miniature painting style, Hanuman standing heroically on a rocky cliff at the ocean shore, "
        "about to make his mighty leap across the sea to Lanka. "
        "Vibrant sunset sky in deep orange and violet, vast turquoise ocean below, "
        "Hanuman's form powerful and radiant with devotion, tail raised high. "
        "Rich jewel tones, gold accents, Rajput miniature painting aesthetic. No text, no letters."
    ),
    "rama-002": (
        "Indian miniature painting style, a tiny fluffy squirrel carrying small pebbles "
        "alongside a great army of Vanaras building a magnificent bridge across the ocean. "
        "Lord Rama kneels gently, watching the squirrel with a warm divine smile, "
        "blessing the little creature. Bright turquoise sea, golden light, lush greenery. "
        "Rich jewel tones, warm and heartwarming atmosphere, Rajput miniature painting aesthetic. No text, no letters."
    ),
}

# Override with env var if set: STORY_IDS=rama-001,rama-002
_env_ids = os.environ.get("STORY_IDS", "").strip()
STORY_IDS = [s.strip() for s in _env_ids.split(",") if s.strip()] if _env_ids else list(STORY_PROMPTS.keys())

# ── Firebase (Firestore only) ─────────────────────────────────────────────────
import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_KEY"])
cred = credentials.Certificate(SERVICE_ACCOUNT)
firebase_admin.initialize_app(cred)
db = firestore.client()

# ── OpenAI ────────────────────────────────────────────────────────────────────
from openai import OpenAI
openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# ── Cloudinary ────────────────────────────────────────────────────────────────
import cloudinary
import cloudinary.uploader

cloudinary.config(cloudinary_url=os.environ["CLOUDINARY_URL"])

# ── Pipeline ──────────────────────────────────────────────────────────────────

logger.info(f"Processing {len(STORY_IDS)} stories: {STORY_IDS}")

for story_id in STORY_IDS:
    prompt = STORY_PROMPTS.get(story_id)
    if not prompt:
        logger.warning(f"No prompt defined for {story_id} — skipping. Add it to STORY_PROMPTS.")
        continue

    logger.info(f"\n{'─'*60}\n[{story_id}]")
    local_path = Path(f"generated_content/story_covers/{story_id}.png")

    if local_path.exists():
        logger.info(f"Using cached image: {local_path}")
        img_bytes = local_path.read_bytes()
    else:
        logger.info(f"Generating DALL-E 3 image for {story_id}...")
        response = openai_client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )
        image_url = response.data[0].url
        logger.info(f"DALL-E URL: {image_url}")

        logger.info("Downloading image...")
        img_bytes = requests.get(image_url, timeout=30).content

        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(img_bytes)
        logger.info(f"Saved locally: {local_path}")

    logger.info("Uploading to Cloudinary...")
    result = cloudinary.uploader.upload(
        img_bytes,
        folder="story-covers",
        public_id=story_id,
        overwrite=True,
        resource_type="image",
    )
    cover_url = result["secure_url"]
    logger.info(f"Cloudinary URL: {cover_url}")

    logger.info("Updating Firestore...")
    db.collection("static_stories").document(story_id).update({"cover_image_url": cover_url})
    logger.info(f"✅ {story_id}.cover_image_url = {cover_url}")

logger.info("\n✅ All done!")
