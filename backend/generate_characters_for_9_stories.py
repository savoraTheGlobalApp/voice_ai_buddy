"""
Generate character cards for all characters in the 9 new stories.
Uses GPT-4o to create bilingual character metadata.
"""
import json
import os
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# List of all unique characters from the 9 stories
CHARACTERS = [
    "Crocodile",
    "Crocodile's Wife",
    "Father",
    "Forest Animals",
    "Ganesha",
    "Gopis",
    "Hanuman",
    "Indra",
    "Kartikeya",
    "Krishna",
    "Lion",
    "Monkey",
    "Nachiketa",
    "Parvati",
    "Rabbit",
    "Rama",
    "Shiva",
    "Sita",
    "Squirrel",
    "Villagers",
    "Yama",
    "Yashoda"
]

# Already have these from the Arjuna story
EXISTING_CHARACTERS = ["Krishna", "Arjuna"]

# Characters to generate
NEW_CHARACTERS = [c for c in CHARACTERS if c not in EXISTING_CHARACTERS]


def generate_character_card(character_name: str) -> dict:
    """Generate a single character card using GPT-4o."""

    prompt = f"""Generate a character card for the mythological/story character "{character_name}" from Indian stories.

The character card should be:
- Age-appropriate for children (5-12 years)
- Educational and culturally accurate
- Engaging and inspiring

Output ONLY valid JSON with this structure:
{{
    "character_id": "lowercase-slug (e.g., hanuman, ganesha)",
    "character_name": {{
        "en": "English name",
        "hi": "हिंदी नाम (Devanagari)"
    }},
    "character_description": {{
        "en": "2-3 sentence description in English for kids",
        "hi": "2-3 sentence description in Hindi (Devanagari)"
    }},
    "character_avatar": "single emoji representing the character",
    "key_trait": {{
        "en": "One-word key trait (e.g., Brave, Wise, Playful)",
        "hi": "One-word Hindi trait (Devanagari)"
    }},
    "fun_fact": {{
        "en": "Interesting fun fact about the character",
        "hi": "Fun fact in Hindi (Devanagari)"
    }},
    "rarity": "common|rare|legendary (based on importance in mythology)"
}}

Guidelines for rarity:
- common: Minor characters, animals, generic groups (Gopis, Villagers, Squirrel, Monkey, etc.)
- rare: Important supporting characters (Hanuman, Sita, Yashoda, Indra, Kartikeya, etc.)
- legendary: Major deities and central figures (Rama, Krishna, Ganesha, Shiva, Parvati, Yama)

Character: {character_name}"""

    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7
            },
            timeout=60
        )

        if response.status_code != 200:
            print(f"❌ API error {response.status_code}: {response.text}")
            return None

        result = response.json()
        content = result['choices'][0]['message']['content'].strip()

        # Extract JSON from potential markdown code blocks
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]

        character_data = json.loads(content)
        return character_data

    except Exception as e:
        print(f"❌ Error generating {character_name}: {e}")
        return None


def generate_all_characters():
    """Generate character cards for all new characters."""
    print("=" * 80)
    print(f"GENERATING CHARACTER CARDS FOR {len(NEW_CHARACTERS)} CHARACTERS")
    print("=" * 80)
    print()

    all_character_cards = []

    for i, character_name in enumerate(NEW_CHARACTERS, 1):
        print(f"[{i}/{len(NEW_CHARACTERS)}] Generating: {character_name}")

        character_card = generate_character_card(character_name)

        if character_card:
            all_character_cards.append(character_card)
            print(f"   ✅ Generated: {character_card['character_id']}")
            print(f"      Avatar: {character_card['character_avatar']} | Rarity: {character_card['rarity']}")
        else:
            print(f"   ❌ Failed to generate")

        print()

    # Save to JSON file
    output_file = "generated_content/batch_9_characters.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_character_cards, f, ensure_ascii=False, indent=2)

    print("=" * 80)
    print("GENERATION SUMMARY")
    print("=" * 80)
    print(f"✅ Generated: {len(all_character_cards)}/{len(NEW_CHARACTERS)}")
    print(f"💾 Saved to: {output_file}")

    # Summary by rarity
    from collections import Counter
    rarity_counts = Counter(c['rarity'] for c in all_character_cards)
    print("\nRarity distribution:")
    for rarity, count in sorted(rarity_counts.items()):
        print(f"  {rarity}: {count}")

    print("\n✨ Character generation complete!")
    return all_character_cards


if __name__ == "__main__":
    generate_all_characters()
