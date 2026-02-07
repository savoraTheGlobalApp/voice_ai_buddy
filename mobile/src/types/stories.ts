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
