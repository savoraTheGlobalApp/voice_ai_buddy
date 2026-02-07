"""
Content Generation Service for Static Mythological Stories
Generates bilingual (Hindi + English) stories using GPT-4.
"""
import logging
from typing import Dict, List, Optional, Any
import httpx
import os
import json

logger = logging.getLogger(__name__)


async def generate_bilingual_story_content(
    title: str,
    title_hindi: str,
    category: str,
    age_range: tuple[int, int] = (5, 7),
    values: List[str] = None,
    characters: List[str] = None,
) -> Dict[str, Any]:
    """
    Generate a complete mythological story in BOTH Hindi and English
    with segments, discussion questions, and character metadata.

    Args:
        title: Story title in English
        title_hindi: Story title in Hindi/Devanagari
        category: mahabharata | ramayana | gita | puranas | vedas | yoga
        age_range: Target age range (min, max)
        values: List of values to emphasize (e.g., ["Dharma", "Courage"])
        characters: List of main characters (e.g., ["Krishna", "Arjuna"])

    Returns:
        Dictionary with bilingual story structure
    """
    if values is None:
        values = ["Dharma (Duty)", "Courage"]
    if characters is None:
        characters = []

    min_age, max_age = age_range

    # Age 5-7: Simple vocabulary, short sentences, clear morals
    complexity = "very simple and child-friendly"
    segment_length = "100-150 words per segment"
    vocabulary = "basic vocabulary suitable for ages 5-7, no complex words"
    sentence_structure = "short, simple sentences (5-8 words each)"

    system_prompt = f"""You are an expert storyteller specializing in Indian mythology for young children.
Create an engaging, culturally accurate, and age-appropriate bilingual story.

CRITICAL REQUIREMENTS:
- Generate story in BOTH Hindi (Devanagari script) and English
- Target age: {min_age}-{max_age} years (EARLY READERS)
- Segment length: {segment_length}
- Vocabulary: {vocabulary}
- Sentence structure: {sentence_structure}
- Values to emphasize: {', '.join(values)}
- Main characters: {', '.join(characters)}

Story Structure:
- Create exactly 5 segments: opening, rising, climax, falling, resolution
- Each segment: {segment_length}
- Include 2 discussion questions total (in segments 1 and 4)
- Questions should be simple and help 5-7 year olds think about the moral

Hindi Writing Guidelines:
- Use proper Devanagari script (हिन्दी)
- Keep Hindi simple and appropriate for young children
- Use common Hindi words that children would know
- Avoid complex Sanskrit words unless explained

English Writing Guidelines:
- Simple, clear English suitable for early readers
- Short sentences (5-8 words)
- Active voice, present or simple past tense
- Clear moral lesson

Cultural Accuracy:
- Stay true to the original mythology
- Be respectful of Hindu culture and traditions
- Make it engaging for children while being authentic
"""

    user_prompt = f"""Generate a complete bilingual story for:
English Title: "{title}"
Hindi Title: "{title_hindi}"
Category: {category}

Create a JSON response with this EXACT structure:

{{
  "title": {{
    "en": "{title}",
    "hi": "{title_hindi}"
  }},
  "category": "{category}",
  "values": {json.dumps(values)},
  "characters": {json.dumps(characters)},
  "segments": [
    {{
      "segmentIndex": 0,
      "narrative": {{
        "en": "English opening text here... (100-150 words)",
        "hi": "हिन्दी प्रारंभ पाठ यहाँ... (100-150 words)"
      }},
      "segmentType": "opening",
      "discussionQuestion": null
    }},
    {{
      "segmentIndex": 1,
      "narrative": {{
        "en": "English rising action text...",
        "hi": "हिन्दी बढ़ती कार्रवाई पाठ..."
      }},
      "segmentType": "rising",
      "discussionQuestion": {{
        "en": "Simple question in English for 5-7 year olds?",
        "hi": "5-7 साल के बच्चों के लिए सरल प्रश्न?"
      }}
    }},
    {{
      "segmentIndex": 2,
      "narrative": {{
        "en": "English climax text...",
        "hi": "हिन्दी चरम पाठ..."
      }},
      "segmentType": "climax",
      "discussionQuestion": null
    }},
    {{
      "segmentIndex": 3,
      "narrative": {{
        "en": "English falling action text...",
        "hi": "हिन्दी गिरती कार्रवाई पाठ..."
      }},
      "segmentType": "falling",
      "discussionQuestion": null
    }},
    {{
      "segmentIndex": 4,
      "narrative": {{
        "en": "English resolution text...",
        "hi": "हिन्दी समाधान पाठ..."
      }},
      "segmentType": "resolution",
      "discussionQuestion": {{
        "en": "Final reflection question in English?",
        "hi": "हिन्दी में अंतिम विचार प्रश्न?"
      }}
    }}
  ],
  "metadata": {{
    "reading_time": 5,
    "difficulty_level": "beginner",
    "source_text": "Bhagavad Gita / Mahabharata",
    "recommended_age": [{min_age}, {max_age}],
    "prerequisite_story_ids": []
  }}
}}

IMPORTANT GUIDELINES:
1. Each segment should be exactly 100-150 words in BOTH languages
2. Use VERY SIMPLE language for ages 5-7
3. Hindi text in proper Devanagari script
4. Only 2 discussion questions total (not in every segment)
5. Questions should be open-ended but simple enough for young children
6. Make the story engaging and fun, not preachy
7. Clear moral lesson about {', '.join(values)}
"""

    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o",  # Using gpt-4o instead of gpt-4
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.7,
                    "response_format": {"type": "json_object"}
                }
            )

            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"OpenAI API error: {error_detail}")
                raise Exception(f"OpenAI API returned {response.status_code}: {error_detail}")

            result = response.json()
            story_data = json.loads(result["choices"][0]["message"]["content"])

            logger.info(f"Generated bilingual story: {title}")
            return story_data

    except Exception as e:
        logger.error(f"Failed to generate story '{title}': {e}")
        raise


async def generate_bilingual_character_metadata(
    character_name_en: str,
    character_name_hi: str,
    category: str,
    stories_featuring: List[str] = None
) -> Dict[str, Any]:
    """
    Generate bilingual character card metadata.

    Args:
        character_name_en: Character name in English
        character_name_hi: Character name in Hindi/Devanagari
        category: Category of mythology
        stories_featuring: List of story IDs featuring this character

    Returns:
        Bilingual character metadata dictionary
    """
    if stories_featuring is None:
        stories_featuring = []

    system_prompt = """You are an expert in Indian mythology.
Create a bilingual character card for young children (ages 5-7) that is:
- Accurate to traditional texts
- Very simple language
- Culturally respectful
- Fun and engaging"""

    user_prompt = f"""Create a bilingual character card for:
English: {character_name_en}
Hindi: {character_name_hi}
Category: {category}

Return JSON with this structure:
{{
  "character_id": "lowercase-english-name",
  "character_name": {{
    "en": "{character_name_en}",
    "hi": "{character_name_hi}"
  }},
  "character_description": {{
    "en": "2-3 SIMPLE sentences for ages 5-7. Who is this character? What did they do?",
    "hi": "5-7 साल के बच्चों के लिए 2-3 सरल वाक्य। यह चरित्र कौन है? उन्होंने क्या किया?"
  }},
  "character_avatar": "Emoji (e.g., '🏹', '🦚', '🛡️')",
  "key_trait": {{
    "en": "One word (e.g., 'Wisdom')",
    "hi": "एक शब्द (e.g., 'ज्ञान')"
  }},
  "fun_fact": {{
    "en": "One simple, interesting fact children would enjoy",
    "hi": "एक सरल, रोचक तथ्य जो बच्चों को पसंद आएगा"
  }},
  "rarity": "common"
}}

Keep language VERY SIMPLE for young children!
"""

    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o",  # Using gpt-4o
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.7,
                    "response_format": {"type": "json_object"}
                }
            )

            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"OpenAI API error: {error_detail}")
                raise Exception(f"OpenAI API returned {response.status_code}: {error_detail}")

            result = response.json()
            character_data = json.loads(result["choices"][0]["message"]["content"])
            character_data["stories_read"] = stories_featuring

            logger.info(f"Generated bilingual character metadata: {character_name_en}")
            return character_data

    except Exception as e:
        logger.error(f"Failed to generate character metadata: {e}")
        raise


async def generate_arjuna_battlefield_story() -> tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Generate the MVP story: "Arjuna's Doubt on the Battlefield"
    in both Hindi and English with character metadata.

    Returns:
        Tuple of (story_data, character_list)
    """
    logger.info("Generating MVP bilingual story: Arjuna's Doubt on the Battlefield")

    # Generate the bilingual story
    story = await generate_bilingual_story_content(
        title="Arjuna's Doubt on the Battlefield",
        title_hindi="अर्जुन की युद्धभूमि पर शंका",
        category="mahabharata",
        age_range=(5, 7),
        values=["Dharma (Duty)", "Courage"],
        characters=["Krishna", "Arjuna"]
    )

    # Add story ID
    story["story_id"] = "maha-001"
    story["order_index"] = 1

    # Generate bilingual character metadata
    krishna = await generate_bilingual_character_metadata(
        character_name_en="Krishna",
        character_name_hi="कृष्ण",
        category="mahabharata",
        stories_featuring=["maha-001"]
    )

    arjuna = await generate_bilingual_character_metadata(
        character_name_en="Arjuna",
        character_name_hi="अर्जुन",
        category="mahabharata",
        stories_featuring=["maha-001"]
    )

    characters = [krishna, arjuna]

    logger.info("Successfully generated bilingual MVP story and character metadata")
    return story, characters


if __name__ == "__main__":
    # Test script to generate the MVP story
    import asyncio
    from dotenv import load_dotenv

    # Load environment variables from .env file
    load_dotenv()

    async def main():
        print("🚀 Generating bilingual story and character metadata...")
        print("📖 Story: Arjuna's Doubt on the Battlefield")
        print("🌏 Languages: Hindi (हिन्दी) + English")
        print("👶 Age: 5-7 years (early readers)")
        print("📏 Length: ~100-150 words per segment × 5 segments\n")

        story, characters = await generate_arjuna_battlefield_story()

        # Save to JSON files for review
        import json
        from pathlib import Path

        output_dir = Path(__file__).parent.parent / "generated_content"
        output_dir.mkdir(exist_ok=True)

        # Save story
        story_file = output_dir / "arjuna_story_bilingual.json"
        with open(story_file, "w", encoding="utf-8") as f:
            json.dump(story, f, indent=2, ensure_ascii=False)

        # Save characters
        chars_file = output_dir / "characters_bilingual.json"
        with open(chars_file, "w", encoding="utf-8") as f:
            json.dump(characters, f, indent=2, ensure_ascii=False)

        print("✅ Story and character metadata generated successfully!\n")
        print(f"📁 Files saved to: {output_dir}")
        print(f"   - {story_file.name}")
        print(f"   - {chars_file.name}\n")
        print(f"📖 Story Title:")
        print(f"   English: {story['title']['en']}")
        print(f"   Hindi: {story['title']['hi']}")
        print(f"\n📝 Segments: {len(story['segments'])}")
        print(f"👥 Characters: {', '.join([c['character_name']['en'] for c in characters])}")
        print(f"\n⏱️  Estimated reading time: ~{story['metadata']['reading_time']} minutes")
        print(f"🎯 Target age: {story['metadata']['recommended_age'][0]}-{story['metadata']['recommended_age'][1]} years")
        print(f"\n💎 Values taught: {', '.join(story['values'])}")

    asyncio.run(main())
