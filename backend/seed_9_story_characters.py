"""
Seed character cards for the 9 new stories to Firestore.
"""
import json
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def seed_all_characters():
    """Seed all character cards from batch_9_characters.json."""
    from services.gamification_service import seed_character_metadata

    # Load character data
    characters_file = Path("generated_content/batch_9_characters.json")

    if not characters_file.exists():
        logger.error(f"Characters file not found: {characters_file}")
        return False

    with open(characters_file, 'r', encoding='utf-8') as f:
        characters_data = json.load(f)

    logger.info("=" * 80)
    logger.info(f"SEEDING {len(characters_data)} CHARACTER CARDS TO FIRESTORE")
    logger.info("=" * 80)

    results = []

    for i, char in enumerate(characters_data, 1):
        char_name = char['character_name']['en']
        char_id = char['character_id']

        logger.info(f"\n[{i}/{len(characters_data)}] Seeding: {char_name} ({char_id})")
        logger.info(f"   Avatar: {char['character_avatar']} | Rarity: {char['rarity']}")

        try:
            await seed_character_metadata(char)
            logger.info(f"   ✅ Seeded successfully!")
            results.append(True)
        except Exception as e:
            logger.error(f"   ❌ Failed: {e}")
            results.append(False)

    logger.info("\n" + "=" * 80)
    logger.info("SEEDING SUMMARY")
    logger.info("=" * 80)

    success_count = sum(results)
    failed_count = len(results) - success_count

    logger.info(f"✅ Successfully seeded: {success_count}/{len(characters_data)}")
    logger.info(f"❌ Failed: {failed_count}/{len(characters_data)}")

    if success_count == len(characters_data):
        logger.info("\n🎉 All character cards seeded successfully!")
        logger.info("\nNext steps:")
        logger.info("1. Test character unlocking in mobile app")
        logger.info("2. Verify character collection screen shows all characters")
        logger.info("3. Update story library to show all 10 stories (maha-001 + 9 new)")

    return success_count == len(characters_data)


if __name__ == "__main__":
    success = asyncio.run(seed_all_characters())
    exit(0 if success else 1)
