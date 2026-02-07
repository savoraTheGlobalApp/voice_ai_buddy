"""
Seed Static Stories to Firestore
Loads generated stories and character metadata into Firebase.
"""
import asyncio
import json
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def seed_database():
    """
    Seed the database with generated story and character data.
    """
    from services.static_story_service import seed_static_story
    from services.gamification_service import seed_character_metadata

    # Load generated content
    content_dir = Path(__file__).parent / "generated_content"

    story_file = content_dir / "arjuna_story_bilingual.json"
    characters_file = content_dir / "characters_bilingual.json"

    if not story_file.exists():
        logger.error(f"Story file not found: {story_file}")
        return False

    if not characters_file.exists():
        logger.error(f"Characters file not found: {characters_file}")
        return False

    # Load story data
    with open(story_file, 'r', encoding='utf-8') as f:
        story_data = json.load(f)

    # Load character data
    with open(characters_file, 'r', encoding='utf-8') as f:
        characters_data = json.load(f)

    logger.info("=" * 60)
    logger.info("SEEDING STATIC STORIES TO FIRESTORE")
    logger.info("=" * 60)

    # Seed the story
    logger.info(f"\n📖 Seeding story: {story_data['title']['en']}")
    logger.info(f"   ID: {story_data['story_id']}")
    logger.info(f"   Category: {story_data['category']}")
    logger.info(f"   Segments: {len(story_data['segments'])}")

    try:
        await seed_static_story(story_data)
        logger.info("   ✅ Story seeded successfully!")
    except Exception as e:
        logger.error(f"   ❌ Failed to seed story: {e}")
        return False

    # Seed characters
    logger.info(f"\n👥 Seeding {len(characters_data)} characters:")

    for char in characters_data:
        char_name = char['character_name']['en']
        char_id = char['character_id']

        logger.info(f"   - {char_name} ({char_id}) {char['character_avatar']}")

        try:
            await seed_character_metadata(char)
            logger.info(f"     ✅ Seeded!")
        except Exception as e:
            logger.error(f"     ❌ Failed: {e}")
            return False

    logger.info("\n" + "=" * 60)
    logger.info("✅ DATABASE SEEDING COMPLETE!")
    logger.info("=" * 60)
    logger.info("\n📊 Summary:")
    logger.info(f"   Stories: 1")
    logger.info(f"   Characters: {len(characters_data)}")
    logger.info("\n🔍 You can now test the API endpoints:")
    logger.info(f"   GET  /api/static-stories/{story_data['story_id']}")
    logger.info(f"   POST /api/users/{{uid}}/static-stories/{story_data['story_id']}/progress")
    logger.info(f"   GET  /api/users/{{uid}}/characters")

    return True


if __name__ == "__main__":
    success = asyncio.run(seed_database())
    exit(0 if success else 1)
