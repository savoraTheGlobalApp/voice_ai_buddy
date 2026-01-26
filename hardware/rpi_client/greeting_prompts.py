"""
Dynamic Greeting Prompts Database

Provides age-appropriate, engaging greeting prompts for children.
Organized by age groups with 100+ prompts across multiple categories.

Age Groups:
- 3-5 years: Simple, playful, concrete concepts
- 6-8 years: Curious, exploratory, basic reasoning
- 9-11 years: Deeper thinking, abstract concepts, creativity
- 12-14 years: Critical thinking, complex topics, real-world connections

Categories:
- fact: Interesting facts to spark curiosity
- question: Open-ended questions to start conversation
- activity: Interactive prompts
- riddle: Age-appropriate riddles
- challenge: Thinking challenges
- would-you-rather: Choice-based questions
- imagination: Creative scenarios
- story-starter: Beginning of a story to continue
- fun-game: Quick verbal games
- brain-teaser: Puzzles and logic questions
"""
import random
from typing import List, Optional, Dict
from dataclasses import dataclass


@dataclass
class GreetingPrompt:
    """A greeting prompt with metadata."""
    text: str
    category: str
    min_age: int
    max_age: int


# ============================================================================
# AGE GROUP: 3-5 YEARS (Preschool/Kindergarten)
# ============================================================================

PROMPTS_3_5 = [
    # Facts (simple, concrete)
    GreetingPrompt("Hi {name}! Did you know butterflies can taste with their feet? Isn't that silly?", "fact", 3, 5),
    GreetingPrompt("Hello {name}! Elephants can't jump. Can you jump? Show me!", "fact", 3, 5),
    GreetingPrompt("Hey {name}! A baby spider is called a spiderling. That's a cute name, right?", "fact", 3, 5),
    GreetingPrompt("Hi {name}! Clouds are made of tiny water drops floating in the sky!", "fact", 3, 5),
    GreetingPrompt("Hello {name}! Bees make honey from flower nectar. Yummy!", "fact", 3, 5),
    GreetingPrompt("Hey {name}! Penguins can't fly, but they're amazing swimmers!", "fact", 3, 5),
    GreetingPrompt("Hi {name}! A rainbow has seven beautiful colors!", "fact", 3, 5),

    # Questions
    GreetingPrompt("Hi {name}! What's your favorite color today?", "question", 3, 5),
    GreetingPrompt("Hello {name}! Did you play with any toys today?", "question", 3, 5),
    GreetingPrompt("Hey {name}! What animal makes you smile?", "question", 3, 5),
    GreetingPrompt("Hi {name}! What's your favorite fruit to eat?", "question", 3, 5),
    GreetingPrompt("Hello {name}! What makes you really happy?", "question", 3, 5),
    GreetingPrompt("Hey {name}! What did you have for breakfast today?", "question", 3, 5),

    # Activities
    GreetingPrompt("Hi {name}! Can you make the sound of your favorite animal?", "activity", 3, 5),
    GreetingPrompt("Hello {name}! Let's count to five together! Ready?", "activity", 3, 5),
    GreetingPrompt("Hey {name}! Can you name three things that are red?", "activity", 3, 5),
    GreetingPrompt("Hi {name}! Show me how big a elephant is with your arms!", "activity", 3, 5),

    # Imagination
    GreetingPrompt("Hi {name}! If you could be any animal, what would you be?", "imagination", 3, 5),
    GreetingPrompt("Hello {name}! Let's imagine we're in a big garden full of flowers!", "imagination", 3, 5),
    GreetingPrompt("Hey {name}! What's the biggest thing you've ever seen?", "imagination", 3, 5),
    GreetingPrompt("Hi {name}! If you had magic powers, what would you do?", "imagination", 3, 5),

    # Simple Riddles
    GreetingPrompt("Hi {name}! I have four legs but I can't walk. What am I? A table!", "riddle", 3, 5),
    GreetingPrompt("Hello {name}! I'm yellow and I light up the day. What am I? The sun!", "riddle", 3, 5),
    GreetingPrompt("Hey {name}! I fall from the sky but I'm not rain. I'm white and cold. What am I? Snow!", "riddle", 3, 5),

    # Would You Rather
    GreetingPrompt("Hi {name}! Would you rather play inside or outside today?", "would-you-rather", 3, 5),
    GreetingPrompt("Hello {name}! Would you rather be a bird or a fish?", "would-you-rather", 3, 5),
    GreetingPrompt("Hey {name}! Would you rather eat ice cream or cake?", "would-you-rather", 3, 5),
]

# ============================================================================
# AGE GROUP: 6-8 YEARS (Early Elementary)
# ============================================================================

PROMPTS_6_8 = [
    # Facts
    GreetingPrompt("Hi {name}! Your heart beats about 100,000 times every day!", "fact", 6, 8),
    GreetingPrompt("Hello {name}! Lightning is five times hotter than the sun's surface!", "fact", 6, 8),
    GreetingPrompt("Hey {name}! Octopuses have three hearts and blue blood. Cool, right?", "fact", 6, 8),
    GreetingPrompt("Hi {name}! A sneeze travels at about 160 kilometers per hour!", "fact", 6, 8),
    GreetingPrompt("Hello {name}! Honey never spoils. 3000-year-old honey was still good!", "fact", 6, 8),
    GreetingPrompt("Hey {name}! Sharks have been around longer than trees!", "fact", 6, 8),
    GreetingPrompt("Hi {name}! Bananas are berries, but strawberries aren't!", "fact", 6, 8),
    GreetingPrompt("Hello {name}! A day on Venus is longer than a year on Venus!", "fact", 6, 8),

    # Questions
    GreetingPrompt("Hi {name}! If you could invent anything, what would it be?", "question", 6, 8),
    GreetingPrompt("Hello {name}! What's the most interesting thing you learned this week?", "question", 6, 8),
    GreetingPrompt("Hey {name}! If animals could talk, which one would you chat with?", "question", 6, 8),
    GreetingPrompt("Hi {name}! What superpower would help you the most?", "question", 6, 8),
    GreetingPrompt("Hello {name}! What's your favorite subject in school and why?", "question", 6, 8),
    GreetingPrompt("Hey {name}! If you could visit any planet, which would you choose?", "question", 6, 8),
    GreetingPrompt("Hi {name}! What makes a good friend in your opinion?", "question", 6, 8),

    # Challenges
    GreetingPrompt("Hi {name}! Can you name five animals that live in water?", "challenge", 6, 8),
    GreetingPrompt("Hello {name}! Quick challenge - how many countries can you name?", "challenge", 6, 8),
    GreetingPrompt("Hey {name}! Can you think of words that rhyme with 'play'?", "challenge", 6, 8),
    GreetingPrompt("Hi {name}! Challenge time - name three things that are round!", "challenge", 6, 8),

    # Riddles
    GreetingPrompt("Hi {name}! What has hands but can't clap? A clock!", "riddle", 6, 8),
    GreetingPrompt("Hello {name}! What goes up but never comes down? Your age!", "riddle", 6, 8),
    GreetingPrompt("Hey {name}! I have keys but no locks. I have space but no room. What am I? A keyboard!", "riddle", 6, 8),
    GreetingPrompt("Hi {name}! What gets wet while drying? A towel!", "riddle", 6, 8),
    GreetingPrompt("Hello {name}! The more you take, the more you leave behind. What am I? Footsteps!", "riddle", 6, 8),

    # Would You Rather
    GreetingPrompt("Hi {name}! Would you rather fly like a bird or swim like a dolphin?", "would-you-rather", 6, 8),
    GreetingPrompt("Hello {name}! Would you rather be super fast or super strong?", "would-you-rather", 6, 8),
    GreetingPrompt("Hey {name}! Would you rather explore space or the deep ocean?", "would-you-rather", 6, 8),
    GreetingPrompt("Hi {name}! Would you rather have a pet dinosaur or a pet dragon?", "would-you-rather", 6, 8),

    # Imagination
    GreetingPrompt("Hi {name}! If you had a robot helper, what would you ask it to do?", "imagination", 6, 8),
    GreetingPrompt("Hello {name}! What would you do if you were invisible for a day?", "imagination", 6, 8),
    GreetingPrompt("Hey {name}! Imagine you discovered a new planet. What would you name it?", "imagination", 6, 8),

    # Brain Teasers
    GreetingPrompt("Hi {name}! Why do you think the ocean is salty but rivers aren't?", "brain-teaser", 6, 8),
    GreetingPrompt("Hello {name}! What do you think makes rainbows appear after rain?", "brain-teaser", 6, 8),
    GreetingPrompt("Hey {name}! Why do you think birds fly in a V formation?", "brain-teaser", 6, 8),
]

# ============================================================================
# AGE GROUP: 9-11 YEARS (Upper Elementary)
# ============================================================================

PROMPTS_9_11 = [
    # Facts
    GreetingPrompt("Hi {name}! There are more chess games possible than atoms in the universe!", "fact", 9, 11),
    GreetingPrompt("Hello {name}! If you folded paper 42 times, it would reach the moon!", "fact", 9, 11),
    GreetingPrompt("Hey {name}! Your eye can distinguish about 10 million different colors!", "fact", 9, 11),
    GreetingPrompt("Hi {name}! There's a planet where it rains glass sideways!", "fact", 9, 11),
    GreetingPrompt("Hello {name}! Light could circle Earth 7.5 times in one second!", "fact", 9, 11),
    GreetingPrompt("Hey {name}! Your DNA, if uncoiled, would reach the sun 300 times!", "fact", 9, 11),
    GreetingPrompt("Hi {name}! There are more stars than grains of sand on all beaches!", "fact", 9, 11),

    # Questions
    GreetingPrompt("Hi {name}! If you could solve one world problem, which would you choose?", "question", 9, 11),
    GreetingPrompt("Hello {name}! What makes someone truly intelligent in your opinion?", "question", 9, 11),
    GreetingPrompt("Hey {name}! Would you time travel to the past or future? Why?", "question", 9, 11),
    GreetingPrompt("Hi {name}! What skill would you love to master and why?", "question", 9, 11),
    GreetingPrompt("Hello {name}! What invention changed the world the most?", "question", 9, 11),
    GreetingPrompt("Hey {name}! If you created a new holiday, what would it celebrate?", "question", 9, 11),

    # Challenges
    GreetingPrompt("Hi {name}! Can you name the seven continents in 10 seconds?", "challenge", 9, 11),
    GreetingPrompt("Hello {name}! Quick - name five scientists and what they discovered!", "challenge", 9, 11),
    GreetingPrompt("Hey {name}! Can you explain how a rainbow forms?", "challenge", 9, 11),
    GreetingPrompt("Hi {name}! Challenge - count backwards from 100 by 7s!", "challenge", 9, 11),

    # Riddles
    GreetingPrompt("Hi {name}! I speak without a mouth and hear without ears. What am I? An echo!", "riddle", 9, 11),
    GreetingPrompt("Hello {name}! What can travel around the world while staying in a corner? A stamp!", "riddle", 9, 11),
    GreetingPrompt("Hey {name}! The more of me there is, the less you see. What am I? Darkness!", "riddle", 9, 11),
    GreetingPrompt("Hi {name}! I have cities but no houses, forests but no trees, water but no fish. What am I? A map!", "riddle", 9, 11),

    # Would You Rather
    GreetingPrompt("Hi {name}! Would you rather know all languages or play all instruments?", "would-you-rather", 9, 11),
    GreetingPrompt("Hello {name}! Would you rather read minds or see the future?", "would-you-rather", 9, 11),
    GreetingPrompt("Hey {name}! Would you rather be famous or help people anonymously?", "would-you-rather", 9, 11),
    GreetingPrompt("Hi {name}! Would you rather explore ancient history or future technology?", "would-you-rather", 9, 11),

    # Brain Teasers
    GreetingPrompt("Hi {name}! Why do we see lightning before we hear thunder?", "brain-teaser", 9, 11),
    GreetingPrompt("Hello {name}! How do airplanes stay in the air?", "brain-teaser", 9, 11),
    GreetingPrompt("Hey {name}! Why does the moon appear to change shape?", "brain-teaser", 9, 11),
    GreetingPrompt("Hi {name}! What makes a ball bounce?", "brain-teaser", 9, 11),

    # Story Starters
    GreetingPrompt("Hi {name}! You find a door in your room that wasn't there before. What's inside?", "story-starter", 9, 11),
    GreetingPrompt("Hello {name}! You wake up with the ability to talk to animals. What happens next?", "story-starter", 9, 11),
    GreetingPrompt("Hey {name}! A mysterious package arrives with your name on it. What do you do?", "story-starter", 9, 11),
]

# ============================================================================
# AGE GROUP: 12-14 YEARS (Early Secondary)
# ============================================================================

PROMPTS_12_14 = [
    # Facts
    GreetingPrompt("Hi {name}! The oldest living tree is 5,000 years old - older than the pyramids!", "fact", 12, 14),
    GreetingPrompt("Hello {name}! We've only discovered 1.2 million of Earth's 8.7 million species!", "fact", 12, 14),
    GreetingPrompt("Hey {name}! Your brain uses 20 percent of your body's energy!", "fact", 12, 14),
    GreetingPrompt("Hi {name}! Quantum computers can solve in seconds what takes others thousands of years!", "fact", 12, 14),
    GreetingPrompt("Hello {name}! Trees communicate underground through a fungus network!", "fact", 12, 14),

    # Questions
    GreetingPrompt("Hi {name}! What belief did you change your mind about and why?", "question", 12, 14),
    GreetingPrompt("Hello {name}! If you could advise your younger self, what would you say?", "question", 12, 14),
    GreetingPrompt("Hey {name}! What's something you're passionate about that surprises people?", "question", 12, 14),
    GreetingPrompt("Hi {name}! How has social media changed how we communicate?", "question", 12, 14),
    GreetingPrompt("Hello {name}! What does success mean to you personally?", "question", 12, 14),
    GreetingPrompt("Hey {name}! What skill should schools teach but don't?", "question", 12, 14),

    # Brain Teasers
    GreetingPrompt("Hi {name}! Will AI mostly help or harm humanity? Why?", "brain-teaser", 12, 14),
    GreetingPrompt("Hello {name}! What's more important - creativity or logic?", "brain-teaser", 12, 14),
    GreetingPrompt("Hey {name}! How do you balance following rules with thinking independently?", "brain-teaser", 12, 14),
    GreetingPrompt("Hi {name}! What role should technology play in friendships?", "brain-teaser", 12, 14),

    # Challenges
    GreetingPrompt("Hi {name}! Can you explain Einstein's theory of relativity simply?", "challenge", 12, 14),
    GreetingPrompt("Hello {name}! Quick challenge - debate both sides of school uniforms!", "challenge", 12, 14),
    GreetingPrompt("Hey {name}! Can you name three biases that affect human thinking?", "challenge", 12, 14),

    # Would You Rather
    GreetingPrompt("Hi {name}! Would you rather change the past or see the future?", "would-you-rather", 12, 14),
    GreetingPrompt("Hello {name}! Would you rather be highly intelligent or highly creative?", "would-you-rather", 12, 14),
    GreetingPrompt("Hey {name}! Would you rather eliminate poverty or cure all diseases?", "would-you-rather", 12, 14),

    # Story Starters
    GreetingPrompt("Hi {name}! You discover your phone can send messages to the past. What do you do?", "story-starter", 12, 14),
    GreetingPrompt("Hello {name}! Scientists prove parallel universes exist. How does this change things?", "story-starter", 12, 14),
    GreetingPrompt("Hey {name}! You're elected leader for a day. What's your first decision?", "story-starter", 12, 14),

    # Fun Games
    GreetingPrompt("Hi {name}! Let's play 20 questions. Think of something and I'll guess!", "fun-game", 12, 14),
    GreetingPrompt("Hello {name}! Word association game - I say a word, you respond instantly!", "fun-game", 12, 14),
]

# ============================================================================
# UNIVERSAL PROMPTS (Work for all ages 3-14)
# ============================================================================

PROMPTS_UNIVERSAL = [
    GreetingPrompt("Hi {name}! How's your day going so far?", "question", 3, 14),
    GreetingPrompt("Hello {name}! Ready for some fun learning today?", "question", 3, 14),
    GreetingPrompt("Hey {name}! Great to see you! What's on your mind?", "question", 3, 14),
    GreetingPrompt("Hi {name}! Tell me something cool that happened recently!", "question", 3, 14),
    GreetingPrompt("Hello {name}! What would you like to explore today?", "question", 3, 14),
    GreetingPrompt("Hey {name}! I have interesting things to share. What are you curious about?", "question", 3, 14),
    GreetingPrompt("Hi {name}! What adventure should we go on today?", "question", 3, 14),
]


class GreetingSelector:
    """
    Selects age-appropriate greeting prompts with category variety.

    Features:
    - Random category selection (ensures variety across types)
    - Age filtering
    - Tracks recently used prompts
    - Statistics tracking
    """

    def __init__(self, max_recent: int = 15):
        """
        Initialize greeting selector.

        Args:
            max_recent: Number of recent prompts to track (prevents repetition)
        """
        self.max_recent = max_recent
        self.recent_prompts: List[str] = []
        self.category_usage: Dict[str, int] = {}

        # Combine all prompts
        self.all_prompts = (
            PROMPTS_3_5 +
            PROMPTS_6_8 +
            PROMPTS_9_11 +
            PROMPTS_12_14 +
            PROMPTS_UNIVERSAL
        )

        # Get all unique categories
        self.categories = list(set(p.category for p in self.all_prompts))

    def get_greeting(
        self,
        user_name: Optional[str] = None,
        user_age: Optional[int] = None,
        prefer_category: Optional[str] = None
    ) -> str:
        """
        Get a random age-appropriate greeting with guaranteed no repetition.

        Strategy (IMPROVED to prevent repetition):
        1. Filter prompts by age
        2. Remove recently used prompts (BEFORE category selection)
        3. Group available prompts by category
        4. Pick a random category from available
        5. Select random prompt from that category
        6. Personalize with name

        This ensures prompts don't repeat for at least max_recent turns.

        Args:
            user_name: Child's name
            user_age: Child's age
            prefer_category: Optional category preference

        Returns:
            Formatted greeting string
        """
        # Default values
        if not user_name:
            user_name = "friend"
        if not user_age:
            user_age = 7

        # Step 1: Filter by age first
        age_suitable_prompts = [
            p for p in self.all_prompts
            if p.min_age <= user_age <= p.max_age
        ]

        # Fallback: if no age-suitable prompts, use universal
        if not age_suitable_prompts:
            age_suitable_prompts = PROMPTS_UNIVERSAL

        # Step 2: Remove recently used prompts (PRIORITY - prevents repetition)
        available_prompts = [
            p for p in age_suitable_prompts
            if p.text not in self.recent_prompts
        ]

        # If we've exhausted all prompts, reset recent tracking
        if not available_prompts:
            # Clear oldest half of recent prompts to make room
            if len(self.recent_prompts) > self.max_recent // 2:
                self.recent_prompts = self.recent_prompts[self.max_recent // 2:]
            available_prompts = [
                p for p in age_suitable_prompts
                if p.text not in self.recent_prompts
            ]
            # If still none, just use all age-suitable
            if not available_prompts:
                available_prompts = age_suitable_prompts

        # Step 3: Group available prompts by category
        prompts_by_category = {}
        for prompt in available_prompts:
            if prompt.category not in prompts_by_category:
                prompts_by_category[prompt.category] = []
            prompts_by_category[prompt.category].append(prompt)

        # Step 4: Select category (prefer specified, otherwise random)
        if prefer_category and prefer_category in prompts_by_category:
            selected_category = prefer_category
        else:
            # Pick random category from available prompts
            selected_category = random.choice(list(prompts_by_category.keys()))

        # Track category usage
        self.category_usage[selected_category] = self.category_usage.get(selected_category, 0) + 1

        # Step 5: Select random prompt from that category
        category_prompts = prompts_by_category[selected_category]
        selected_prompt = random.choice(category_prompts)

        # Step 6: Track recent usage (add to end of list)
        self.recent_prompts.append(selected_prompt.text)
        if len(self.recent_prompts) > self.max_recent:
            self.recent_prompts.pop(0)  # Remove oldest

        # Step 7: Format with name
        greeting_text = selected_prompt.text.format(name=user_name)

        return greeting_text

    def get_greeting_by_category(
        self,
        category: str,
        user_name: Optional[str] = None,
        user_age: Optional[int] = None
    ) -> str:
        """
        Get a greeting from a specific category.

        Args:
            category: Category name
            user_name: Child's name
            user_age: Child's age

        Returns:
            Formatted greeting string
        """
        return self.get_greeting(user_name, user_age, prefer_category=category)

    def get_stats(self) -> dict:
        """Get statistics about the prompt database."""
        total_prompts = len(self.all_prompts)

        by_age = {
            "3-5": len([p for p in self.all_prompts if p.min_age <= 5]),
            "6-8": len([p for p in self.all_prompts if 6 <= p.min_age <= 8]),
            "9-11": len([p for p in self.all_prompts if 9 <= p.min_age <= 11]),
            "12-14": len([p for p in self.all_prompts if 12 <= p.min_age]),
        }

        by_category = {}
        for prompt in self.all_prompts:
            by_category[prompt.category] = by_category.get(prompt.category, 0) + 1

        return {
            "total_prompts": total_prompts,
            "total_categories": len(self.categories),
            "categories": self.categories,
            "by_age_group": by_age,
            "by_category": by_category,
            "category_usage": self.category_usage,
            "recent_usage": len(self.recent_prompts),
        }


# Convenience function for quick usage
def get_random_greeting(user_name: Optional[str] = None, user_age: Optional[int] = None) -> str:
    """
    Quick function to get a random age-appropriate greeting.

    Args:
        user_name: Child's name
        user_age: Child's age

    Returns:
        Formatted greeting string

    Usage:
        greeting = get_random_greeting("Aarav", 8)
        print(greeting)
    """
    selector = GreetingSelector()
    return selector.get_greeting(user_name, user_age)


# Example usage and testing
if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)

    print("=== Dynamic Greeting Prompts System ===\n")

    selector = GreetingSelector()

    # Print stats
    stats = selector.get_stats()
    print(f"Database Statistics:")
    print(f"  Total prompts: {stats['total_prompts']}")
    print(f"  Categories: {stats['total_categories']}")
    print(f"  Available categories: {', '.join(stats['categories'])}")
    print(f"  By age group: {stats['by_age_group']}")
    print(f"  By category: {stats['by_category']}\n")

    # Test greetings for different ages
    test_cases = [
        ("Aarav", 4),
        ("Priya", 7),
        ("Rohan", 10),
        ("Ananya", 13),
    ]

    for name, age in test_cases:
        print(f"--- {name} (age {age}) ---")
        for i in range(5):
            greeting = selector.get_greeting(name, age)
            print(f"  {i+1}. {greeting}")
        print()

    # Show category usage
    print("Category Usage Distribution:")
    for category, count in sorted(selector.category_usage.items(), key=lambda x: x[1], reverse=True):
        print(f"  {category}: {count} times")
