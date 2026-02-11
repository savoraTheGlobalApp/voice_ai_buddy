"""
Seed 9 new static stories to Firestore.

Stories:
- rama-001, rama-002 (Ramayana)
- krishna-001, krishna-002 (Krishna)
- pancha-001, pancha-002 (Panchatantra)
- ganesha-001, ganesha-002 (Ganesha)
- upan-001 (Upanishads)
"""
import json
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

STORY_IDS = [
    "rama-001",
    "rama-002",
    "krishna-001",
    "krishna-002",
    "pancha-001",
    "pancha-002",
    "ganesha-001",
    "ganesha-002",
    "upan-001"
]

async def seed_story(story_id: str):
    """Seed a single story to Firestore."""
    from services.static_story_service import seed_static_story

    json_path = f"generated_content/batch_9_stories/{story_id}.json"

    if not Path(json_path).exists():
        logger.error(f"Story file not found: {json_path}")
        return False

    with open(json_path, 'r', encoding='utf-8') as f:
        story_data = json.load(f)

    try:
        await seed_static_story(story_data)

        logger.info(f"✅ Seeded: {story_id} - {story_data['title']['en']}")
        logger.info(f"   Category: {story_data['category']}")
        logger.info(f"   Values: {', '.join(story_data['values'])}")
        logger.info(f"   Characters: {', '.join(story_data['characters'])}")

        return True
    except Exception as e:
        logger.error(f"❌ Failed to seed {story_id}: {e}")
        return False

async def main():
    """Seed all 9 stories."""
    logger.info("=" * 80)
    logger.info("SEEDING 9 STATIC STORIES TO FIRESTORE")
    logger.info("=" * 80)

    results = []
    for story_id in STORY_IDS:
        logger.info(f"\nSeeding {story_id}...")
        result = await seed_story(story_id)
        results.append(result)

    logger.info("\n" + "=" * 80)
    logger.info("SEEDING SUMMARY")
    logger.info("=" * 80)
    success_count = sum(results)
    failed_count = len(results) - success_count

    logger.info(f"✅ Successfully seeded: {success_count}/{len(STORY_IDS)}")
    logger.info(f"❌ Failed: {failed_count}/{len(STORY_IDS)}")

    if success_count == len(STORY_IDS):
        logger.info("\n🎉 All stories seeded successfully!")
        logger.info("\nNext steps:")
        logger.info("1. Create character cards for new characters")
        logger.info("2. Test stories in mobile app")
        logger.info("3. Update story library UI to show all 10 stories")

    return success_count == len(STORY_IDS)

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)
