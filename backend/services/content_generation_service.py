"""
Content Generation Service for Static Mythological Stories
Generates bilingual (Hindi + English) bedtime stories using GPT-4.

Story Format: "Katha Nights" - Optimized for bedtime routines
- 3-4 minute reading time per story
- Calming, sensory-rich language
- Complete mini-story (no cliffhangers at bedtime)
- Sleep blessing at the end
- Parent-child connection moments
"""
import logging
from typing import Dict, List, Optional, Any
import httpx
import os
import json

logger = logging.getLogger(__name__)

# Sleep blessing templates by value/theme
SLEEP_BLESSINGS = {
    "courage": {
        "en": "Like {character} found courage in their heart, may brave and beautiful dreams visit you tonight. Sleep well, little warrior. 🙏",
        "hi": "जैसे {character} ने अपने दिल में साहस पाया, वैसे ही आज रात तुम्हें बहादुर और सुंदर सपने आएं। अच्छी नींद सो, छोटे योद्धा। 🙏"
    },
    "wisdom": {
        "en": "Like {character} listened to wise words, may peaceful thoughts guide your dreams tonight. Rest now, little one. 🕉️",
        "hi": "जैसे {character} ने बुद्धिमान शब्दों को सुना, वैसे ही आज रात शांत विचार तुम्हारे सपनों का मार्गदर्शन करें। अब आराम करो, छोटे। 🕉️"
    },
    "kindness": {
        "en": "Like {character} showed love to others, may warmth and kindness wrap around you as you sleep. Sweet dreams, dear child. 💙",
        "hi": "जैसे {character} ने दूसरों को प्यार दिखाया, वैसे ही सोते समय तुम्हें गर्माहट और दया घेर ले। मीठे सपने, प्यारे बच्चे। 💙"
    },
    "devotion": {
        "en": "Like {character}'s heart was full of love, may the stars watch over you tonight. Sleep peacefully, little devotee. 🙏",
        "hi": "जैसे {character} का दिल प्यार से भरा था, वैसे ही आज रात तारे तुम पर नज़र रखें। शांति से सो, छोटे भक्त। 🙏"
    },
    "friendship": {
        "en": "Like {character} was a true friend, may happy memories dance in your dreams tonight. Goodnight, little friend. ⭐",
        "hi": "जैसे {character} एक सच्चे मित्र थे, वैसे ही आज रात खुशी की यादें तुम्हारे सपनों में नाचें। शुभ रात्रि, छोटे मित्र। ⭐"
    },
    "default": {
        "en": "Like the heroes of old, may you be safe and warm tonight. The moon watches over you. Sleep well, dear child. 🌙",
        "hi": "पुराने नायकों की तरह, आज रात तुम सुरक्षित और गर्म रहो। चंद्रमा तुम पर नज़र रखता है। अच्छी नींद सो, प्यारे बच्चे। 🌙"
    }
}


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


async def generate_katha_night_story(
    title: str,
    title_hindi: str,
    category: str,
    night_number: int = 1,
    total_nights: int = 5,
    collection_name: str = "Story Collection",
    age_range: tuple[int, int] = (5, 7),
    values: List[str] = None,
    primary_value: str = "courage",
    characters: List[str] = None,
    main_character: str = None,
) -> Dict[str, Any]:
    """
    Generate a bedtime-optimized "Katha Night" story.

    Each Katha Night is a complete mini-story (3-4 minutes) designed for bedtime:
    - Calming, sensory-rich language
    - No cliffhangers (complete story arc)
    - Sleep blessing at the end
    - Gentle tone suitable for winding down

    Args:
        title: Story title in English
        title_hindi: Story title in Hindi
        category: mahabharata | ramayana | gita | puranas | vedas | yoga
        night_number: Which night in the series (1-5)
        total_nights: Total nights in this story arc
        collection_name: Name of the story collection
        age_range: Target age range
        values: List of values to emphasize
        primary_value: Main value for sleep blessing
        characters: List of characters in the story
        main_character: Primary character (for sleep blessing)

    Returns:
        Bedtime-optimized story structure
    """
    if values is None:
        values = ["Courage", "Wisdom"]
    if characters is None:
        characters = []
    if main_character is None:
        main_character = characters[0] if characters else "the hero"

    min_age, max_age = age_range

    # Bedtime-optimized system prompt
    system_prompt = f"""You are a gentle storyteller creating BEDTIME stories for young children.
Your stories help children wind down and feel safe before sleep.

🌙 BEDTIME STORY GUIDELINES:

TONE & LANGUAGE:
- Warm, gentle, soothing pace
- Sensory-rich descriptions (soft sounds, warm colors, gentle movements)
- Short sentences (5-8 words)
- Present tense for immediacy
- NO scary moments, loud sounds, or tension before bed
- Avoid: battles, fighting, villains, danger, fear
- Include: whispers, gentle breezes, warm light, soft touches, peaceful feelings

STRUCTURE (The 3-2-1 Format):
1. OPENING HOOK (2-3 sentences) - Captures attention with calming imagery
2. STORY BODY (10-15 sentences) - Complete mini-adventure with gentle conflict
3. REFLECTION MOMENT (1 simple question) - Parent-child connection
4. SLEEP BLESSING (2 sentences) - Connects story value to bedtime peace

READING TIME: 3-4 minutes total (approximately 300-400 words)

TARGET AUDIENCE:
- Age: {min_age}-{max_age} years
- Time: Bedtime (child is winding down)
- Context: Parent reading aloud, child cuddling

CULTURAL ACCURACY:
- Stay true to Indian mythology
- Respectful of Hindu traditions
- Make it gentle and age-appropriate

VALUES TO EMPHASIZE: {', '.join(values)}
MAIN CHARACTERS: {', '.join(characters)}
"""

    user_prompt = f"""Create a bedtime "Katha Night" story:

📖 STORY INFO:
- English Title: "{title}"
- Hindi Title: "{title_hindi}"
- Collection: "{collection_name}" (Night {night_number} of {total_nights})
- Category: {category}

Generate a JSON response with this EXACT structure:

{{
  "story_id": "{category[:4]}-{night_number:03d}",
  "title": {{
    "en": "{title}",
    "hi": "{title_hindi}"
  }},
  "collection": {{
    "name": "{collection_name}",
    "night_number": {night_number},
    "total_nights": {total_nights}
  }},
  "category": "{category}",
  "values": {json.dumps(values)},
  "characters": {json.dumps(characters)},
  "content": {{
    "opening_hook": {{
      "en": "2-3 calming sentences with sensory imagery. Set the peaceful scene.",
      "hi": "2-3 शांत वाक्य संवेदी कल्पना के साथ। शांतिपूर्ण दृश्य सेट करें।"
    }},
    "story_body": {{
      "en": "10-15 sentences. Complete mini-story with gentle conflict and resolution. Use dialogue. Include warm feelings.",
      "hi": "10-15 वाक्य। कोमल संघर्ष और समाधान के साथ पूर्ण लघु-कथा।"
    }},
    "reflection_moment": {{
      "en": "One simple question connecting story to child's life. Can be answered with one word or silently.",
      "hi": "एक सरल प्रश्न जो कहानी को बच्चे के जीवन से जोड़े।"
    }},
    "sleep_blessing": {{
      "en": "2 gentle sentences connecting the story's lesson to peaceful sleep. Include 🙏 or 🌙 emoji.",
      "hi": "2 कोमल वाक्य कहानी की सीख को शांतिपूर्ण नींद से जोड़ते हुए। 🙏 या 🌙 इमोजी शामिल करें।"
    }}
  }},
  "metadata": {{
    "reading_time_minutes": 4,
    "difficulty_level": "beginner",
    "source_text": "Source text name",
    "recommended_age": [{min_age}, {max_age}],
    "bedtime_suitable": true,
    "primary_value": "{primary_value}",
    "main_character": "{main_character}"
  }}
}}

🌙 IMPORTANT BEDTIME GUIDELINES:
1. Total length: ~300-400 words (3-4 min reading)
2. Opening: Start with calming imagery (moon, stars, gentle evening)
3. Conflict: GENTLE only (confusion, a question, a choice - NOT danger)
4. Resolution: Warm, satisfying ending
5. Sleep blessing: Connect the moral to feeling safe/peaceful
6. Language: Soft, warm words (whisper, gentle, warm, soft, peaceful)
7. Avoid: Battles, fighting, scary moments, loud sounds, tension
8. Include: Dialogue (children love hearing character voices)
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
                    "model": "gpt-4o",
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

            logger.info(f"Generated Katha Night story: {title} (Night {night_number})")
            return story_data

    except Exception as e:
        logger.error(f"Failed to generate Katha Night story '{title}': {e}")
        raise


async def generate_katha_night_collection(
    collection_name: str,
    collection_name_hindi: str,
    category: str,
    nights: List[Dict[str, str]],
    characters: List[str],
    primary_value: str = "courage",
    age_range: tuple[int, int] = (5, 7),
) -> List[Dict[str, Any]]:
    """
    Generate a complete "Katha Night" collection (e.g., 5 nights = 1 week of bedtime stories).

    Args:
        collection_name: Collection name in English
        collection_name_hindi: Collection name in Hindi
        category: Story category
        nights: List of dicts with 'title_en' and 'title_hi' for each night
        characters: Characters appearing across the collection
        primary_value: Main value taught
        age_range: Target age range

    Returns:
        List of Katha Night stories
    """
    stories = []
    total_nights = len(nights)

    for i, night in enumerate(nights):
        story = await generate_katha_night_story(
            title=night["title_en"],
            title_hindi=night["title_hi"],
            category=category,
            night_number=i + 1,
            total_nights=total_nights,
            collection_name=collection_name,
            age_range=age_range,
            values=[primary_value.capitalize()],
            primary_value=primary_value,
            characters=characters,
            main_character=characters[0] if characters else None,
        )
        stories.append(story)
        logger.info(f"Generated night {i + 1}/{total_nights}: {night['title_en']}")

    return stories


async def generate_arjuna_katha_nights() -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Generate the Arjuna story as 5 "Katha Nights" - bedtime-optimized mini-stories.

    Each night is a complete 3-4 minute story, together telling the full arc.

    Returns:
        Tuple of (list of 5 stories, list of characters)
    """
    logger.info("Generating Arjuna Katha Nights collection (5 bedtime stories)")

    nights = [
        {
            "title_en": "The Prince Who Felt Confused",
            "title_hi": "राजकुमार जो उलझन में था"
        },
        {
            "title_en": "Krishna's Gentle Words",
            "title_hi": "कृष्ण के कोमल शब्द"
        },
        {
            "title_en": "The Secret of the Heart",
            "title_hi": "दिल का रहस्य"
        },
        {
            "title_en": "Finding Inner Strength",
            "title_hi": "आंतरिक शक्ति खोजना"
        },
        {
            "title_en": "The Peaceful Warrior",
            "title_hi": "शांतिपूर्ण योद्धा"
        }
    ]

    stories = await generate_katha_night_collection(
        collection_name="Arjuna's Journey",
        collection_name_hindi="अर्जुन की यात्रा",
        category="mahabharata",
        nights=nights,
        characters=["Krishna", "Arjuna"],
        primary_value="courage",
        age_range=(5, 7),
    )

    # Generate character metadata
    krishna = await generate_bilingual_character_metadata(
        character_name_en="Krishna",
        character_name_hi="कृष्ण",
        category="mahabharata",
        stories_featuring=[s["story_id"] for s in stories]
    )

    arjuna = await generate_bilingual_character_metadata(
        character_name_en="Arjuna",
        character_name_hi="अर्जुन",
        category="mahabharata",
        stories_featuring=[s["story_id"] for s in stories]
    )

    characters = [krishna, arjuna]

    logger.info("Successfully generated 5 Katha Nights + character metadata")
    return stories, characters


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
    # Test script to generate stories
    import asyncio
    import sys
    from dotenv import load_dotenv

    # Load environment variables from .env file
    load_dotenv()

    async def generate_legacy_story():
        """Generate the original 5-segment story format."""
        print("🚀 Generating bilingual story (legacy format)...")
        print("📖 Story: Arjuna's Doubt on the Battlefield")
        print("🌏 Languages: Hindi (हिन्दी) + English")
        print("👶 Age: 5-7 years (early readers)")
        print("📏 Length: ~100-150 words per segment × 5 segments\n")

        story, characters = await generate_arjuna_battlefield_story()

        # Save to JSON files for review
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

    async def generate_katha_nights():
        """Generate the new Katha Nights bedtime-optimized format."""
        print("🌙 Generating Katha Nights Collection (Bedtime Format)...")
        print("=" * 60)
        print("📖 Collection: Arjuna's Journey")
        print("🌏 Languages: Hindi (हिन्दी) + English")
        print("👶 Age: 5-7 years")
        print("⏱️  Length: ~3-4 min per night × 5 nights")
        print("🛏️  Format: Bedtime-optimized with sleep blessings")
        print("=" * 60 + "\n")

        stories, characters = await generate_arjuna_katha_nights()

        # Save to JSON files
        from pathlib import Path

        output_dir = Path(__file__).parent.parent / "generated_content"
        output_dir.mkdir(exist_ok=True)

        # Save all stories
        stories_file = output_dir / "arjuna_katha_nights.json"
        with open(stories_file, "w", encoding="utf-8") as f:
            json.dump(stories, f, indent=2, ensure_ascii=False)

        # Save characters
        chars_file = output_dir / "characters_katha_nights.json"
        with open(chars_file, "w", encoding="utf-8") as f:
            json.dump(characters, f, indent=2, ensure_ascii=False)

        print("✅ Katha Nights collection generated!\n")
        print(f"📁 Files saved to: {output_dir}")
        print(f"   - {stories_file.name}")
        print(f"   - {chars_file.name}\n")

        print("🌙 KATHA NIGHTS GENERATED:")
        print("-" * 40)
        for i, story in enumerate(stories):
            print(f"\n  Night {i + 1}: {story['title']['en']}")
            print(f"           {story['title']['hi']}")
            print(f"           ⏱️ {story['metadata']['reading_time_minutes']} min")

        print(f"\n👥 Characters: {', '.join([c['character_name']['en'] for c in characters])}")
        print(f"💎 Primary Value: Courage")
        print(f"🛏️  Bedtime Suitable: ✓")

        # Show sample of first story
        print("\n" + "=" * 60)
        print("📖 SAMPLE - Night 1 Preview:")
        print("=" * 60)
        first_story = stories[0]
        print(f"\n🌟 Opening Hook:")
        print(f"   {first_story['content']['opening_hook']['en'][:150]}...")
        print(f"\n🌙 Sleep Blessing:")
        print(f"   {first_story['content']['sleep_blessing']['en']}")

    async def main():
        # Check command line args
        if len(sys.argv) > 1 and sys.argv[1] == "--katha-nights":
            await generate_katha_nights()
        elif len(sys.argv) > 1 and sys.argv[1] == "--legacy":
            await generate_legacy_story()
        else:
            print("🌙 Sacred Stories Content Generator")
            print("=" * 40)
            print("\nUsage:")
            print("  python content_generation_service.py --katha-nights")
            print("      Generate 5 bedtime-optimized Katha Night stories")
            print("\n  python content_generation_service.py --legacy")
            print("      Generate original 5-segment story format")
            print("\n💡 Recommended: Use --katha-nights for bedtime stories!")

    asyncio.run(main())


async def generate_static_story_bilingual(
    story_id: str,
    title: Dict[str, str],
    category: str,
    values: List[str],
    characters: List[str],
    age_range: List[int],
    difficulty: str,
    description: str,
    moral: str
) -> Dict[str, Any]:
    """
    Generate a complete bilingual static story for the Sacred Stories collection.

    Args:
        story_id: Unique identifier (e.g., "rama-001")
        title: Bilingual title {"en": "...", "hi": "..."}
        category: Story category (ramayana, krishna, panchatantra, etc.)
        values: List of values taught (e.g., ["Courage", "Devotion"])
        characters: Main characters in the story
        age_range: [min_age, max_age] e.g., [5, 10]
        difficulty: "beginner", "intermediate", or "advanced"
        description: Brief description of the story
        moral: The main lesson/moral of the story

    Returns:
        Complete story document with bilingual segments
    """
    logger.info(f"Generating bilingual story: {title['en']} ({story_id})")

    # Create detailed prompt for GPT-4
    prompt = f"""You are an expert children's storyteller specializing in Indian mythology and moral tales.

Generate a bilingual (English + Hindi) children's story based on these specifications:

**Story Details:**
- Title (English): {title['en']}
- Title (Hindi): {title['hi']}
- Category: {category}
- Target Age: {age_range[0]}-{age_range[1]} years
- Difficulty: {difficulty}
- Values to teach: {', '.join(values)}
- Main characters: {', '.join(characters)}

**Story Description:**
{description}

**Moral/Lesson:**
{moral}

**Requirements:**
1. Create exactly 5 story segments (opening, rising action, climax, falling action, resolution)
2. Each segment should be 80-120 words in English
3. Each segment should be 80-120 words in Hindi (Devanagari script)
4. Use simple, age-appropriate language
5. Include 2 discussion questions (after segment 2 and segment 4)
6. Highlight the main characters throughout the story
7. Emphasize the values and moral clearly
8. Make it engaging and memorable for kids

**Output Format (JSON):**
{{
  "segments": [
    {{
      "segmentIndex": 0,
      "narrative": {{
        "en": "English narrative text here...",
        "hi": "Hindi narrative text here in Devanagari..."
      }},
      "segmentType": "opening",
      "characterHighlights": ["Character1", "Character2"],
      "discussionQuestion": null
    }},
    {{
      "segmentIndex": 1,
      "narrative": {{
        "en": "English narrative...",
        "hi": "Hindi narrative..."
      }},
      "segmentType": "rising",
      "characterHighlights": ["Character1"],
      "discussionQuestion": {{
        "en": "What would you do in this situation?",
        "hi": "इस स्थिति में आप क्या करेंगे?"
      }}
    }},
    ... (continue for all 5 segments)
  ]
}}

Important:
- Segment types: "opening", "rising", "climax", "falling", "resolution"
- Discussion questions ONLY at segmentIndex 1 and 3 (null for others)
- Hindi must be grammatically correct Devanagari
- Keep language simple for the target age group
- Make it culturally authentic
- Include sensory details (what they see, hear, feel)

Generate the complete story now in valid JSON format."""

    try:
        # Call OpenAI API
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o",
                    "messages": [
                        {"role": "system", "content": "You are an expert bilingual storyteller for children. You generate engaging, educational stories in both English and Hindi."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.8,
                    "response_format": {"type": "json_object"}
                }
            )

            response.raise_for_status()
            result = response.json()

            # Parse the generated content
            generated_content = json.loads(result["choices"][0]["message"]["content"])

            # Build complete story document
            story_document = {
                "story_id": story_id,
                "title": title,
                "category": category,
                "segments": generated_content.get("segments", []),
                "values": values,
                "characters": characters,
                "metadata": {
                    "reading_time_minutes": 4,
                    "difficulty_level": difficulty,
                    "recommended_age": age_range,
                    "moral": moral,
                    "description": description
                },
                "created_at": None,  # Will be set by Firestore

                # Add experiment support (for A/B testing)
                "experiments": ["katha-content-format"],
                "formats": {
                    "standard": {
                        "blocks": generate_standard_blocks(generated_content.get("segments", []), characters),
                        "display": {
                            "theme": "adventure",
                            "showProgress": True,
                            "navigation": "paginated"
                        }
                    },
                    "katha_night": {
                        "blocks": generate_katha_night_blocks(generated_content.get("segments", []), characters, values),
                        "display": {
                            "theme": "bedtime",
                            "showProgress": False,
                            "navigation": "scroll"
                        }
                    }
                }
            }

            logger.info(f"Successfully generated story: {story_id}")
            return story_document

    except Exception as e:
        logger.error(f"Failed to generate story {story_id}: {e}")
        raise


def generate_standard_blocks(segments: List[Dict], characters: List[str]) -> List[Dict]:
    """Generate standard format blocks from segments."""
    blocks = []
    block_order = 0

    for i, segment in enumerate(segments):
        # Add story segment
        blocks.append({
            "id": f"segment-{i}",
            "type": "story_body",
            "order": block_order,
            "content": segment["narrative"],
            "characterHighlights": segment.get("characterHighlights", characters[:2])
        })
        block_order += 1

        # Add divider after each segment (except last)
        if i < len(segments) - 1:
            blocks.append({
                "id": f"divider-{i}",
                "type": "divider",
                "order": block_order,
                "style": "stars"
            })
            block_order += 1

        # Add discussion question if present
        if segment.get("discussionQuestion"):
            blocks.append({
                "id": f"discussion-{i}",
                "type": "discussion",
                "order": block_order,
                "question": segment["discussionQuestion"]
            })
            block_order += 1

    return blocks


def generate_katha_night_blocks(segments: List[Dict], characters: List[str], values: List[str]) -> List[Dict]:
    """Generate Katha Night bedtime format blocks."""
    blocks = []

    # Hook (from first segment)
    blocks.append({
        "id": "hook-1",
        "type": "hook",
        "order": 0,
        "content": segments[0]["narrative"],
        "characterHighlights": characters
    })

    blocks.append({"id": "divider-1", "type": "divider", "order": 1, "style": "stars"})

    # Main story (combine middle segments)
    combined_narrative = {
        "en": " ".join(seg["narrative"]["en"] for seg in segments[1:4]),
        "hi": " ".join(seg["narrative"]["hi"] for seg in segments[1:4])
    }

    blocks.append({
        "id": "story-1",
        "type": "story_body",
        "order": 2,
        "content": combined_narrative,
        "characterHighlights": characters
    })

    blocks.append({"id": "divider-2", "type": "divider", "order": 3, "style": "stars"})

    # Reflection (from last segment + discussion)
    blocks.append({
        "id": "reflection-1",
        "type": "reflection",
        "order": 4,
        "content": segments[-1]["narrative"],
        "question": segments[1].get("discussionQuestion") if len(segments) > 1 else None
    })

    blocks.append({"id": "divider-3", "type": "divider", "order": 5, "style": "stars"})

    # Blessing (based on primary value)
    primary_value = values[0].lower() if values else "default"
    blessing_template = SLEEP_BLESSINGS.get(primary_value, SLEEP_BLESSINGS["default"])

    blessing = {
        "en": blessing_template["en"].format(character=characters[0] if characters else "our hero"),
        "hi": blessing_template["hi"].format(character=characters[0] if characters else "हमारे नायक")
    }

    blocks.append({
        "id": "blessing-1",
        "type": "blessing",
        "order": 6,
        "content": blessing
    })

    return blocks
