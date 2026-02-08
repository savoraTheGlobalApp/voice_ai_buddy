import {
  StaticStory,
  KathaNightStory,
  isKathaNightStory,
  ContentBlock,
  BlockBasedContent,
  HookBlock,
  StoryBodyBlock,
  ReflectionBlock,
  BlessingBlock,
  DiscussionBlock,
  DividerBlock,
  BilingualText,
} from '../types/stories';

/**
 * Converts a StaticStory (segment-based) to BlockBasedContent
 */
export function staticStoryToBlocks(story: StaticStory): BlockBasedContent {
  const blocks: ContentBlock[] = [];
  let order = 0;

  story.segments.forEach((segment, index) => {
    // Add story body block for each segment
    const storyBlock: StoryBodyBlock = {
      id: `segment-${segment.segmentIndex}`,
      type: 'story_body',
      order: order++,
      content: segment.narrative,
      characterHighlights: story.characters,
    };
    blocks.push(storyBlock);

    // Add discussion question if present
    if (segment.discussionQuestion) {
      const discussionBlock: DiscussionBlock = {
        id: `discussion-${segment.segmentIndex}`,
        type: 'discussion',
        order: order++,
        question: segment.discussionQuestion,
      };
      blocks.push(discussionBlock);
    }

    // Add divider between segments (except after last)
    if (index < story.segments.length - 1) {
      const dividerBlock: DividerBlock = {
        id: `divider-${index}`,
        type: 'divider',
        order: order++,
        style: 'stars',
      };
      blocks.push(dividerBlock);
    }
  });

  return {
    contentId: story.story_id,
    title: story.title,
    category: story.category,
    blocks,
    display: {
      navigation: 'paginated',
      theme: 'adventure',
      showProgress: true,
    },
    metadata: {
      reading_time_minutes: story.metadata.reading_time,
      values: story.values,
      characters: story.characters,
      difficulty_level: story.metadata.difficulty_level,
    },
    created_at: story.created_at,
  };
}

/**
 * Converts a KathaNightStory (bedtime format) to BlockBasedContent
 */
export function kathaNightToBlocks(story: KathaNightStory): BlockBasedContent {
  const blocks: ContentBlock[] = [];
  let order = 0;

  // Opening hook block
  const hookBlock: HookBlock = {
    id: 'opening-hook',
    type: 'hook',
    order: order++,
    content: story.content.opening_hook,
    icon: '🌙',
  };
  blocks.push(hookBlock);

  // Divider
  blocks.push({
    id: 'divider-1',
    type: 'divider',
    order: order++,
    style: 'om',
  } as DividerBlock);

  // Main story body
  const storyBlock: StoryBodyBlock = {
    id: 'story-body',
    type: 'story_body',
    order: order++,
    content: story.content.story_body,
    characterHighlights: story.characters,
  };
  blocks.push(storyBlock);

  // Divider
  blocks.push({
    id: 'divider-2',
    type: 'divider',
    order: order++,
    style: 'stars',
  } as DividerBlock);

  // Reflection moment
  const reflectionBlock: ReflectionBlock = {
    id: 'reflection',
    type: 'reflection',
    order: order++,
    question: story.content.reflection_moment,
    pauseDuration: 10,
  };
  blocks.push(reflectionBlock);

  // Divider
  blocks.push({
    id: 'divider-3',
    type: 'divider',
    order: order++,
    style: 'om',
  } as DividerBlock);

  // Sleep blessing
  const blessingBlock: BlessingBlock = {
    id: 'sleep-blessing',
    type: 'blessing',
    order: order++,
    content: story.content.sleep_blessing,
    character: story.metadata.main_character,
    icon: '🙏',
  };
  blocks.push(blessingBlock);

  return {
    contentId: story.story_id,
    title: story.title,
    category: story.category,
    blocks,
    display: {
      navigation: 'scroll', // Bedtime stories work better as scroll
      theme: 'bedtime',
      showProgress: true,
    },
    metadata: {
      reading_time_minutes: story.metadata.reading_time_minutes,
      values: story.values,
      characters: story.characters,
      difficulty_level: story.metadata.difficulty_level,
    },
    created_at: story.created_at,
  };
}

/**
 * Converts any SacredStory to BlockBasedContent
 */
export function storyToBlocks(
  story: StaticStory | KathaNightStory
): BlockBasedContent {
  if (isKathaNightStory(story)) {
    return kathaNightToBlocks(story);
  }
  return staticStoryToBlocks(story);
}

/**
 * Creates a sample block-based content for testing
 */
export function createSampleBlockContent(): BlockBasedContent {
  return {
    contentId: 'sample-story-001',
    title: {
      en: "Arjuna's Doubt on the Battlefield",
      hi: 'युद्धभूमि पर अर्जुन का संशय',
    },
    category: 'mahabharata',
    blocks: [
      {
        id: 'hook-1',
        type: 'hook',
        order: 0,
        content: {
          en: 'The greatest battle was about to begin. But the mightiest warrior had frozen...',
          hi: 'महायुद्ध शुरू होने ही वाला था। परंतु महान योद्धा जम गया था...',
        },
        icon: '⚔️',
      } as HookBlock,
      {
        id: 'divider-1',
        type: 'divider',
        order: 1,
        style: 'om',
      } as DividerBlock,
      {
        id: 'story-1',
        type: 'story_body',
        order: 2,
        content: {
          en: 'Arjuna stood in his chariot between two great armies. On one side were the Kauravas, on the other the Pandavas. But as he looked across the battlefield, his heart sank. He saw his own teachers, uncles, and cousins standing ready to fight against him.',
          hi: 'अर्जुन अपने रथ में दो महान सेनाओं के बीच खड़ा था। एक तरफ कौरव थे, दूसरी तरफ पांडव। लेकिन जब उसने युद्धभूमि को देखा, उसका दिल डूब गया। उसने अपने गुरुओं, चाचाओं और चचेरे भाइयों को अपने खिलाफ लड़ने के लिए तैयार देखा।',
        },
        characterHighlights: ['arjuna'],
      } as StoryBodyBlock,
      {
        id: 'reflection-1',
        type: 'reflection',
        order: 3,
        question: {
          en: 'Have you ever had to choose between what feels right and what you were told to do?',
          hi: 'क्या आपको कभी वह चुनना पड़ा है जो सही लगता है और जो करने को कहा गया था?',
        },
        pauseDuration: 10,
      } as ReflectionBlock,
      {
        id: 'story-2',
        type: 'story_body',
        order: 4,
        content: {
          en: 'Krishna, who was driving Arjuna\'s chariot, spoke gently. "Arjuna, why do you hesitate? A warrior\'s duty is to fight for what is right. You are not killing bodies - the soul is eternal and cannot be destroyed."',
          hi: 'कृष्ण, जो अर्जुन का रथ चला रहे थे, धीरे से बोले। "अर्जुन, तुम क्यों हिचकिचाते हो? योद्धा का धर्म है न्याय के लिए लड़ना। तुम शरीरों को नहीं मार रहे - आत्मा शाश्वत है और नष्ट नहीं हो सकती।"',
        },
        characterHighlights: ['krishna', 'arjuna'],
      } as StoryBodyBlock,
      {
        id: 'divider-2',
        type: 'divider',
        order: 5,
        style: 'stars',
      } as DividerBlock,
      {
        id: 'blessing-1',
        type: 'blessing',
        order: 6,
        content: {
          en: 'Like Arjuna found courage in his heart, may brave and beautiful dreams visit you tonight. Sleep well, little warrior. 🙏',
          hi: 'जैसे अर्जुन ने अपने दिल में साहस पाया, वैसे ही आज रात तुम्हें बहादुर और सुंदर सपने आएं। अच्छी नींद सो, छोटे योद्धा। 🙏',
        },
        character: 'Krishna',
        icon: '🙏',
      } as BlessingBlock,
    ],
    display: {
      navigation: 'paginated',
      theme: 'bedtime',
      showProgress: true,
    },
    metadata: {
      reading_time_minutes: 5,
      values: ['courage', 'dharma'],
      characters: ['krishna', 'arjuna'],
      difficulty_level: 'beginner',
    },
  };
}
