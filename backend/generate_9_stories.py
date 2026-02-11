"""
Batch generate 9 static stories across 5 categories.

Categories:
- Ramayana (2 stories)
- Krishna (2 stories)
- Panchatantra (2 stories)
- Ganesha (2 stories)
- Upanishads (1 story)
"""
import asyncio
import os
from dotenv import load_dotenv
from services.content_generation_service import generate_static_story_bilingual

# Load environment
load_dotenv()

# Story definitions
STORIES_TO_GENERATE = [
    # RAMAYANA (2 stories)
    {
        "story_id": "rama-001",
        "title": {
            "en": "Hanuman's Leap to Lanka",
            "hi": "हनुमान की लंका की छलांग"
        },
        "category": "ramayana",
        "values": ["Courage", "Devotion", "Determination"],
        "characters": ["Hanuman", "Rama", "Sita"],
        "age_range": [7, 12],
        "difficulty": "intermediate",
        "description": "The heroic story of Hanuman leaping across the ocean to find Sita in Lanka, demonstrating unwavering courage and devotion to Rama.",
        "moral": "With faith and courage, no obstacle is too great to overcome."
    },
    {
        "story_id": "rama-002",
        "title": {
            "en": "The Squirrel's Contribution",
            "hi": "गिलहरी का योगदान"
        },
        "category": "ramayana",
        "values": ["Humility", "Teamwork", "Perseverance"],
        "characters": ["Rama", "Squirrel", "Hanuman"],
        "age_range": [5, 7],
        "difficulty": "beginner",
        "description": "A small squirrel helps build the bridge to Lanka by carrying tiny pebbles, teaching that every contribution matters.",
        "moral": "No act of kindness is too small; everyone's effort counts."
    },

    # KRISHNA (2 stories)
    {
        "story_id": "krishna-001",
        "title": {
            "en": "The Butter Thief",
            "hi": "माखन चोर"
        },
        "category": "krishna",
        "values": ["Joy", "Love", "Playfulness"],
        "characters": ["Krishna", "Yashoda", "Gopis"],
        "age_range": [5, 8],
        "difficulty": "beginner",
        "description": "Young Krishna's playful adventures stealing butter from the gopis, showing divine joy and the bond between mother and child.",
        "moral": "Pure love and joy can be found in simple, playful moments."
    },
    {
        "story_id": "krishna-002",
        "title": {
            "en": "Lifting Govardhan Hill",
            "hi": "गोवर्धन पर्वत उठाना"
        },
        "category": "krishna",
        "values": ["Protection", "Faith", "Strength"],
        "characters": ["Krishna", "Indra", "Villagers"],
        "age_range": [7, 12],
        "difficulty": "intermediate",
        "description": "Krishna lifts the Govardhan mountain on his little finger to protect the villagers from Indra's wrath.",
        "moral": "True strength comes from protecting those who depend on you."
    },

    # PANCHATANTRA (2 stories)
    {
        "story_id": "pancha-001",
        "title": {
            "en": "The Monkey and the Crocodile",
            "hi": "बंदर और मगरमच्छ"
        },
        "category": "panchatantra",
        "values": ["Wisdom", "Trust", "Friendship"],
        "characters": ["Monkey", "Crocodile", "Crocodile's Wife"],
        "age_range": [5, 10],
        "difficulty": "beginner",
        "description": "A clever monkey outwits a crocodile who tries to betray their friendship, teaching about trust and quick thinking.",
        "moral": "True friends don't betray each other; use wisdom to protect yourself."
    },
    {
        "story_id": "pancha-002",
        "title": {
            "en": "The Foolish Lion and Clever Rabbit",
            "hi": "मूर्ख शेर और चतुर खरगोश"
        },
        "category": "panchatantra",
        "values": ["Intelligence", "Courage", "Strategy"],
        "characters": ["Lion", "Rabbit", "Forest Animals"],
        "age_range": [6, 12],
        "difficulty": "intermediate",
        "description": "A small rabbit uses cleverness to defeat a mighty lion, saving all the forest animals.",
        "moral": "Intelligence and courage can overcome brute strength."
    },

    # GANESHA (2 stories)
    {
        "story_id": "ganesha-001",
        "title": {
            "en": "The Race Around the World",
            "hi": "दुनिया की परिक्रमा"
        },
        "category": "ganesha",
        "values": ["Devotion", "Wisdom", "Family Love"],
        "characters": ["Ganesha", "Kartikeya", "Shiva", "Parvati"],
        "age_range": [5, 10],
        "difficulty": "beginner",
        "description": "Ganesha and Kartikeya race to circle the world, but Ganesha finds a wise solution by circling his parents.",
        "moral": "True wisdom lies in understanding what matters most."
    },
    {
        "story_id": "ganesha-002",
        "title": {
            "en": "How Ganesha Got His Elephant Head",
            "hi": "गणेश को हाथी का सिर कैसे मिला"
        },
        "category": "ganesha",
        "values": ["Obedience", "Transformation", "Divine Love"],
        "characters": ["Ganesha", "Parvati", "Shiva"],
        "age_range": [5, 12],
        "difficulty": "beginner",
        "description": "The story of how young Ganesha received his elephant head, teaching about transformation and divine grace.",
        "moral": "Sometimes challenges transform us into something greater."
    },

    # UPANISHADS (1 story)
    {
        "story_id": "upan-001",
        "title": {
            "en": "Nachiketa and the God of Death",
            "hi": "नचिकेता और यमराज"
        },
        "category": "upanishads",
        "values": ["Courage", "Wisdom", "Truth-seeking"],
        "characters": ["Nachiketa", "Yama", "Father"],
        "age_range": [9, 12],
        "difficulty": "advanced",
        "description": "Young Nachiketa visits Yama, the god of death, and asks profound questions about life and death, receiving eternal wisdom.",
        "moral": "Seeking truth with courage leads to the greatest knowledge."
    }
]


async def generate_all_stories():
    """Generate all 9 stories in bilingual format."""
    print("=" * 80)
    print("GENERATING 9 STATIC STORIES")
    print("=" * 80)

    # Check OpenAI API key
    if not os.getenv("OPENAI_API_KEY"):
        print("ERROR: OPENAI_API_KEY not found in .env")
        return

    results = []

    for i, story_def in enumerate(STORIES_TO_GENERATE, 1):
        print(f"\n[{i}/9] Generating: {story_def['title']['en']}")
        print(f"Category: {story_def['category'].upper()}")
        print(f"Values: {', '.join(story_def['values'])}")
        print("-" * 80)

        try:
            # Generate story using the content generation service
            story_content = await generate_static_story_bilingual(
                story_id=story_def["story_id"],
                title=story_def["title"],
                category=story_def["category"],
                values=story_def["values"],
                characters=story_def["characters"],
                age_range=story_def["age_range"],
                difficulty=story_def["difficulty"],
                description=story_def["description"],
                moral=story_def["moral"]
            )

            results.append({
                "story_id": story_def["story_id"],
                "status": "success",
                "content": story_content
            })

            print(f"✅ Generated successfully!")
            print(f"   Segments: {len(story_content.get('segments', []))}")
            print(f"   Characters: {', '.join(story_def['characters'])}")

        except Exception as e:
            print(f"❌ Failed to generate: {e}")
            results.append({
                "story_id": story_def["story_id"],
                "status": "failed",
                "error": str(e)
            })

    # Summary
    print("\n" + "=" * 80)
    print("GENERATION SUMMARY")
    print("=" * 80)

    success_count = sum(1 for r in results if r["status"] == "success")
    failed_count = sum(1 for r in results if r["status"] == "failed")

    print(f"✅ Successful: {success_count}/9")
    print(f"❌ Failed: {failed_count}/9")

    if failed_count > 0:
        print("\nFailed stories:")
        for r in results:
            if r["status"] == "failed":
                print(f"  - {r['story_id']}: {r['error']}")

    # Save results
    import json
    output_dir = "generated_content/batch_9_stories"
    os.makedirs(output_dir, exist_ok=True)

    for result in results:
        if result["status"] == "success":
            filename = f"{output_dir}/{result['story_id']}.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(result["content"], f, ensure_ascii=False, indent=2)
            print(f"💾 Saved: {filename}")

    print("\n✨ Batch generation complete!")
    return results


async def main():
    """Main execution."""
    print("\nStarting batch story generation...")
    print(f"Total stories to generate: {len(STORIES_TO_GENERATE)}")
    print("\nBreakdown by category:")

    from collections import Counter
    category_counts = Counter(s["category"] for s in STORIES_TO_GENERATE)
    for category, count in sorted(category_counts.items()):
        print(f"  {category.capitalize()}: {count} stories")

    print("\nThis will use OpenAI API (estimated cost: ~$5-10)")
    print("\n🚀 Starting generation automatically...")

    results = await generate_all_stories()

    # Print categorized list
    print("\n" + "=" * 80)
    print("CATEGORIZED STORY LIST")
    print("=" * 80)

    for category in ["ramayana", "krishna", "panchatantra", "ganesha", "upanishads"]:
        stories = [s for s in STORIES_TO_GENERATE if s["category"] == category]
        print(f"\n📚 {category.upper()} ({len(stories)} stories):")
        for story in stories:
            print(f"   • {story['story_id']}: {story['title']['en']}")
            print(f"     Hindi: {story['title']['hi']}")
            print(f"     Values: {', '.join(story['values'])}")
            print(f"     Age: {story['age_range'][0]}-{story['age_range'][1]} | Difficulty: {story['difficulty']}")
            print()


if __name__ == "__main__":
    asyncio.run(main())
