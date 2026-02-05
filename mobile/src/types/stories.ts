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
