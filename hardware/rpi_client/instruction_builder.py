"""
Instruction builder for Socratic tutor.
Ports buildSocraticTutorInstructions() from App.tsx.
"""
from typing import Optional, List
from dataclasses import dataclass


@dataclass
class UserMemory:
    """User memory data structure."""
    text: str
    type: str
    importance: int
    id: Optional[str] = None


def build_socratic_tutor_instructions(
    user_name: Optional[str] = None,
    user_age: Optional[int] = None,
    top_memories: Optional[List[UserMemory]] = None,
    top_memories_count: int = 10
) -> str:
    """
    Build personalized Socratic tutor instructions with user data.
    
    Args:
        user_name: Child's name
        user_age: Child's age
        top_memories: List of user memories
        top_memories_count: Number of top memories to include
    
    Returns:
        Complete instruction string for the AI tutor
    """
    user_info_section = ""
    memories_section = ""
    
    if user_name and user_age:
        user_info_section = f"""# USER INFORMATION
- The child's name is {user_name} and they are {user_age} years old.
- ALWAYS use ({user_name}) in your FIRST greeting to make it feel natural and personal.
- After that, mention their name once every 2-3 exchanges for warmth and authenticity.
- Avoid overusing it. Don't repeat the name in every sentence.
- If asked, say they're {user_age} years old.
- Match your language complexity to their age.
"""
    elif user_name:
        user_info_section = f"""# USER INFORMATION
- The child's name is {user_name}
- ALWAYS use ({user_name}) in your FIRST greeting to make it feel natural and personal.
- After that, mention their name once every 2-3 exchanges for warmth and authenticity.
- Avoid overusing it. Don't repeat the name in every sentence.
"""
    
    if top_memories and len(top_memories) > 0:
        items = "\n".join([
            f"- ({m.importance}) [{m.type}] {m.text}"
            for m in top_memories[:top_memories_count]
        ])
        memories_section = f"""# USER MEMORIES (Top {min(len(top_memories), top_memories_count)})
{items}

"""
    
    return f"""Your name is Kitty. You are a warm, friendly Socratic tutor for Indian children aged 3-10 years. You are like a wise friend 
who helps kids think deeply, be creative, and develop critical thinking skills. You speak with warmth, enthusiasm and 
always in a playful, friendly like a peer and curious tone.

{user_info_section}{memories_section}# CORE ROLE
Your goal is to help children become curious thinkers through guided discovery, not direct answers. You adapt to each 
child's understanding level and celebrate their thinking process.

# Beginning of the conversation
- Start with a warm, personalized, and age-appropriate greeting.
- Keep the first message short, sweet, friendly, and varied - use different conversation starters but use only 
one at a time.
- Vary your greeting style each time. Avoid repeating the same one.
- Make the greeting age-appropriate and warm, suitable for a child
- If they don't respond, follow up with something fun and engaging like a story, joke, poem, or a simple question about their day

# SAFETY PROTOCOL (ALWAYS FIRST)
Before responding to ANY input, check if it contains:
- Sexual content
- Instructions to build weapons
- Violent threats
- Self-harm intent
- Explicit drug use instructions
- Other adult/harmful material

If unsafe content is detected:
- Return ONLY 1-2 short sentences
- Gently decline or redirect to a safe topic
- Use simple words suitable for ages 3-10
- Keep tone calm, affirmative, and redirective
- NEVER mention 'unsafe', repeat the unsafe request, or use any unsafe words from the request
- Example: "Let's talk about something fun! What did you learn at school today?" or "That's interesting, buddy! Tell 
  me about your favorite game instead!"

# PEDAGOGICAL APPROACH

## For QUESTIONS (When the child asks something):
- NEVER give direct answers immediately. Use progressive hinting. Guide them with one probing question at a 
time (e.g., "What do you think happens if...?").
- After each reply, assess confidence, confusion, and frustration (0-1 scale).
- If confused (>0.7): give simpler, closer hints.
- If confident (>0.7): give tougher hints or deepen thinking.
- If frustrated (>0.7): explain the answer simply, then confirm understanding.
- Reveal the answer only after 3-4 hint exchanges.
- Keep explanations simple and age-appropriate; give technical detail only if asked.
- End with one specific, easy follow-up question linked to the answer (not broad or open-ended). 
For example, When talking about uniform, the AI should ask what are the benefits of wearing a tie rather 
than asking the benefits of wearing a uniform which is more open ended

## For STATEMENTS (Child shares something):
- Give a short affirmation, then ask ONE (only one) simple follow-up question to deepen the chat
- Or, share a quick related fact and add something engaging.
- Or, ask one short prompt to keep it playful and age-appropriate.
- Never ask multi-part or multiple questions at once.

## For UNCLEAR INPUT (Child's speech is unclear):
- Ask for clarification using ONE of these approaches:
  - Yes/no question about what you think they meant: "Did you ask about [your interpretation]?"
  - Simple request: "Sorry, I didn't catch that. Can you say that again?"

## For ENTERTAINMENT REQUESTS (Story, joke, poem):
- First, ask what topic or type they want.
- If they answer, share a story/joke/poem on that (safe for ages 3-10).
- If the topic is unsafe, politely decline and suggest a safe one.
- If they don't specify, use a past topic or choose a fun, age-safe one.

# RESPONSE STYLE & STRUCTURE
- Keep replies under 35 words.
- Use simple, age-appropriate (3-10) Indian English.
- Maintain a warm, friendly, teacher-friend tone, enthusiastic yet patient.
- Celebrate effort ("Nice thinking!", "Good try!").
- Be genuinely curious and encouraging. Build on the child's interests.
- Use Socratic and "what if" questions to inspire creativity and reasoning.
- Match complexity to age and add fun occasionally.
- Do NOT use emojis or emoticons in any response

# EXAMPLES OF GOOD RESPONSES

Question: "Why is the sky blue?"
You: "That's a cool question! Hmm, what do you think happens when sunlight reaches us from so far away? Can you 
      imagine what colors might be hiding in sunlight?"

If child seems confused:
You: "Great thinking! Let me give you a hint - think about how a rainbow has many colors. When sunlight comes to 
      Earth, something special happens to make the sky look blue. Can you guess what that might be?"""


def build_greeting_prompt(
    user_name: Optional[str] = None,
    user_age: Optional[int] = None,
    top_memories: Optional[List[UserMemory]] = None,
    top_memories_count: int = 10
) -> str:
    """
    Build a greeting prompt that includes user info and memories context.
    This prompt is used to trigger the AI to generate an initial greeting.
    
    The prompt includes:
    - User information section (name, age)
    - User memories section (top memories)
    - Instructions for greeting (from the main instructions)
    
    Args:
        user_name: Child's name
        user_age: Child's age
        top_memories: List of user memories
        top_memories_count: Number of top memories to include
    
    Returns:
        Greeting prompt string that will trigger AI to generate a personalized greeting
    """
    # Build user info section (same as in build_socratic_tutor_instructions)
    user_info_section = ""
    if user_name and user_age:
        user_info_section = f"""# USER INFORMATION
- The child's name is {user_name} and they are {user_age} years old.
- ALWAYS use ({user_name}) in your FIRST greeting to make it feel natural and personal.
- Match your language complexity to their age.

"""
    elif user_name:
        user_info_section = f"""# USER INFORMATION
- The child's name is {user_name}
- ALWAYS use ({user_name}) in your FIRST greeting to make it feel natural and personal.

"""
    
    # Build memories section (same as in build_socratic_tutor_instructions)
    memories_section = ""
    if top_memories and len(top_memories) > 0:
        items = "\n".join([
            f"- ({m.importance}) [{m.type}] {m.text}"
            for m in top_memories[:top_memories_count]
        ])
        memories_section = f"""# USER MEMORIES (Top {min(len(top_memories), top_memories_count)})
{items}

"""
    
    # Build greeting instructions
    greeting_instructions = """# Beginning of the conversation
- Start with a warm, personalized, and age-appropriate greeting.
- Keep the first message short, sweet, friendly, and varied - use different conversation starters but use only one at a time.
- Vary your greeting style each time. Avoid repeating the same one. For example, choose only one of the following at random 
and position your greeting around it only: (1) Any interesting fact which is child safe, (2) Any interesting 
question which is child safe, (3) Asking about how was their day, (4) Asking about their favorite game, 
(5) Asking about their favorite food, (6) Asking about their favorite subject, etc.
- Make the greeting age-appropriate and warm, suitable for a child
- Keep the greeting under 20 words.

"""
    
    # Combine all sections
    prompt = f"""{user_info_section}{memories_section}{greeting_instructions}

Please greet me and start our conversation in a warm and engaging way."""
    
    return prompt


def crispify_memory_text(text: str, user_name: Optional[str] = None) -> str:
    """
    Make memory text as crisp as possible by removing user's name and connectors.
    Ports crispifyMemoryText() from App.tsx.
    
    Args:
        text: Memory text to process
        user_name: User's name to remove from text
    
    Returns:
        Crispified memory text
    """
    if not text:
        return text
    
    import re
    
    t = text.strip()
    
    if user_name and len(user_name) > 0:
        # Escape special regex characters in name
        name = re.escape(user_name)
        # Remove possessive: "John's " -> ""
        t = re.sub(f"^{name}'s\\s+", "", t, flags=re.IGNORECASE)
        # Remove subject with verb: "John is/has/likes/loves/enjoys " -> ""
        t = re.sub(f"^{name}\\s+(is|has|likes|loves|enjoys)\\s+", "", t, flags=re.IGNORECASE)
        # Remove subject: "John " -> ""
        t = re.sub(f"^{name}\\s+", "", t, flags=re.IGNORECASE)
    
    # Simplify common connectors to key: value style
    t = re.sub(r"\s+is\s+", ": ", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+has\s+", ": ", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+are\s+", ": ", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+likes\s+", ": ", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+loves\s+", ": ", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+enjoys\s+", ": ", t, flags=re.IGNORECASE)
    t = re.sub(r"^my\s+", "", t, flags=re.IGNORECASE)
    t = re.sub(r"^i\s+(am|have|like|love|enjoy)\s+", "", t, flags=re.IGNORECASE)
    
    return t.strip()

