export interface StorySegment {
  segment_index: number;
  narrative: string;
  segment_type: 'opening' | 'middle' | 'climax' | 'resolution';
  discussion_question: string | null;
}

export interface Story {
  session_id: string;
  title: string;
  segments: StorySegment[];
  child_name?: string;
  child_age?: number;
  status?: 'generated' | 'read' | 'favorite';
  created_at?: string;
  request?: StoryRequest;
}

export interface StorySummary {
  session_id: string;
  title: string;
  child_name: string;
  topics: string[];
  status: string;
  created_at: string;
}

export interface StoryRequest {
  topics: string[];
  values: string[];
  length: 'short' | 'medium' | 'long';
  setting?: string;
}

export const SUGGESTED_TOPICS = [
  'dinosaurs', 'space', 'animals', 'superheroes',
  'princesses', 'robots', 'ocean', 'forest', 'magic', 'pirates'
];

export const SUGGESTED_VALUES = [
  'kindness', 'sharing', 'honesty', 'courage',
  'patience', 'friendship', 'gratitude', 'respect',
  'perseverance', 'empathy'
];

// Static Mythological Stories Types
export interface BilingualText {
  en: string;
  hi: string;
}

export interface StaticStorySegment {
  segmentIndex: number;
  narrative: BilingualText;
  segmentType: 'opening' | 'rising' | 'climax' | 'falling' | 'resolution';
  discussionQuestion?: BilingualText | null;
}

export interface StaticStory {
  story_id: string;
  title: BilingualText;
  category: 'mahabharata' | 'ramayana' | 'gita' | 'puranas' | 'vedas' | 'yoga';
  values: string[];
  characters: string[];
  segments: StaticStorySegment[];
  metadata: {
    reading_time: number;
    difficulty_level: string;
    source_text: string;
    recommended_age: [number, number];
    prerequisite_story_ids: string[];
  };
  order_index: number;
  created_at?: string;
}

export interface StoryProgress {
  story_id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  current_segment: number;
  quiz_score?: number;
  quiz_attempts?: number;
  is_favorite: boolean;
  last_read_at?: string;
  completed_at?: string;
}

// Katha Night - Bedtime-optimized story format
export interface KathaNightContent {
  opening_hook: BilingualText;
  story_body: BilingualText;
  reflection_moment: BilingualText;
  sleep_blessing: BilingualText;
}

export interface KathaNightCollection {
  name: string;
  night_number: number;
  total_nights: number;
}

export interface KathaNightStory {
  story_id: string;
  title: BilingualText;
  collection: KathaNightCollection;
  category: 'mahabharata' | 'ramayana' | 'gita' | 'puranas' | 'vedas' | 'yoga';
  values: string[];
  characters: string[];
  content: KathaNightContent;
  metadata: {
    reading_time_minutes: number;
    difficulty_level: string;
    source_text: string;
    recommended_age: [number, number];
    bedtime_suitable: boolean;
    primary_value: string;
    main_character: string;
  };
  created_at?: string;
}

// Union type for both story formats
export type SacredStory = StaticStory | KathaNightStory;

// Type guard to check if story is Katha Night format
export function isKathaNightStory(story: SacredStory): story is KathaNightStory {
  return 'content' in story && 'collection' in story;
}

export interface CharacterCard {
  character_id: string;
  character_name: BilingualText;
  character_description: BilingualText;
  character_avatar: string;
  key_trait: BilingualText;
  fun_fact: BilingualText;
  rarity: 'common' | 'rare' | 'legendary';
  stories_read: string[];
  unlocked_at?: string;
}

// ============================================
// Server-Driven Content Blocks
// ============================================

// Base block interface - all blocks extend this
export interface BaseContentBlock {
  id: string;
  type: string;
  order: number;
}

// Text block - simple narrative text
export interface TextBlock extends BaseContentBlock {
  type: 'text';
  content: BilingualText;
  style?: 'normal' | 'emphasized' | 'whisper' | 'dramatic';
}

// Hook block - attention-grabbing opener
export interface HookBlock extends BaseContentBlock {
  type: 'hook';
  content: BilingualText;
  icon?: string;
}

// Story block - main narrative content
export interface StoryBodyBlock extends BaseContentBlock {
  type: 'story_body';
  content: BilingualText;
  characterHighlights?: string[]; // Characters mentioned in this section
}

// Reflection block - pause for thought
export interface ReflectionBlock extends BaseContentBlock {
  type: 'reflection';
  question: BilingualText;
  prompt?: BilingualText; // Optional prompt like "Think about..."
  pauseDuration?: number; // Suggested pause in seconds
}

// Blessing block - closing/sleep blessing
export interface BlessingBlock extends BaseContentBlock {
  type: 'blessing';
  content: BilingualText;
  character?: string; // Character giving the blessing
  icon?: string;
}

// Discussion block - interactive question
export interface DiscussionBlock extends BaseContentBlock {
  type: 'discussion';
  question: BilingualText;
  hints?: BilingualText[];
}

// Quiz block - comprehension check
export interface QuizBlock extends BaseContentBlock {
  type: 'quiz';
  question: BilingualText;
  options: BilingualText[];
  correctIndex: number;
  explanation: BilingualText;
}

// Divider block - visual separator
export interface DividerBlock extends BaseContentBlock {
  type: 'divider';
  style?: 'line' | 'dots' | 'stars' | 'om';
}

// Character intro block - introduce a character
export interface CharacterIntroBlock extends BaseContentBlock {
  type: 'character_intro';
  characterId: string;
  name: BilingualText;
  description: BilingualText;
  avatar?: string;
  trait: BilingualText;
}

// Audio block - for future audio content
export interface AudioBlock extends BaseContentBlock {
  type: 'audio';
  audioUrl: string;
  duration: number;
  transcript?: BilingualText;
  autoPlay?: boolean;
}

// Image block - for illustrations
export interface ImageBlock extends BaseContentBlock {
  type: 'image';
  imageUrl: string;
  altText: BilingualText;
  caption?: BilingualText;
}

// Value highlight block - emphasize a moral/value
export interface ValueHighlightBlock extends BaseContentBlock {
  type: 'value_highlight';
  value: string;
  explanation: BilingualText;
  icon?: string;
}

// Union type of all content blocks
export type ContentBlock =
  | TextBlock
  | HookBlock
  | StoryBodyBlock
  | ReflectionBlock
  | BlessingBlock
  | DiscussionBlock
  | QuizBlock
  | DividerBlock
  | CharacterIntroBlock
  | AudioBlock
  | ImageBlock
  | ValueHighlightBlock;

// Display configuration for content
export interface ContentDisplayConfig {
  navigation: 'scroll' | 'paginated' | 'timed';
  theme: 'default' | 'bedtime' | 'adventure' | 'calm';
  showProgress?: boolean;
  autoAdvance?: boolean;
  autoAdvanceDelay?: number; // seconds
}

// Experiment metadata
export interface ExperimentInfo {
  experimentId: string;
  variantId: string;
  experimentName?: string;
}

// Complete server-driven content response
export interface BlockBasedContent {
  contentId: string;
  title: BilingualText;
  category: string;
  blocks: ContentBlock[];
  display: ContentDisplayConfig;
  metadata: {
    reading_time_minutes: number;
    values: string[];
    characters: string[];
    difficulty_level: string;
  };
  experiment?: ExperimentInfo;
  created_at?: string;
}

// Type guard helpers for block types
export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text';
}

export function isHookBlock(block: ContentBlock): block is HookBlock {
  return block.type === 'hook';
}

export function isStoryBodyBlock(block: ContentBlock): block is StoryBodyBlock {
  return block.type === 'story_body';
}

export function isReflectionBlock(block: ContentBlock): block is ReflectionBlock {
  return block.type === 'reflection';
}

export function isBlessingBlock(block: ContentBlock): block is BlessingBlock {
  return block.type === 'blessing';
}

export function isQuizBlock(block: ContentBlock): block is QuizBlock {
  return block.type === 'quiz';
}
