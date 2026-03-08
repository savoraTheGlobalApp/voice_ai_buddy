import { apiClient } from './client';
import { BlockBasedContent } from '../types/stories';

export interface CustomStoryRequest {
  category: string;
  length: 'short' | 'medium' | 'long';
  // habits
  habit?: string;
  challenge?: string;
  helper?: string;
  // emotions
  emotions?: string[];
  trigger?: string;
  resolution?: string;
  // moral_values
  value?: string;
  dilemma?: string;
  setting?: string;
  // mahabharata / ramayana
  characters?: string[];
  theme?: string;
  language_style?: 'simple' | 'classical';
}

export interface CustomStoryContent extends BlockBasedContent {
  audio_status: 'pending' | 'ready' | 'failed';
}

export interface CustomStorySummary {
  story_id: string;
  title: { en: string; hi: string };
  category: string;
  audio_status: 'pending' | 'ready' | 'failed';
  values: string[];
  metadata: {
    blocks_count?: number;
    length?: string;
    reading_time_minutes?: number;
  };
  created_at?: string;
}

export async function generateCustomStory(
  uid: string,
  request: CustomStoryRequest,
): Promise<CustomStoryContent> {
  return apiClient<CustomStoryContent>(`/api/users/${uid}/custom-stories/generate`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getCustomStory(
  uid: string,
  storyId: string,
): Promise<CustomStoryContent> {
  return apiClient<CustomStoryContent>(`/api/users/${uid}/custom-stories/${storyId}`);
}

export async function listCustomStories(uid: string): Promise<{ stories: CustomStorySummary[]; total: number }> {
  return apiClient(`/api/users/${uid}/custom-stories`);
}

export async function deleteCustomStory(uid: string, storyId: string): Promise<void> {
  await apiClient(`/api/users/${uid}/custom-stories/${storyId}`, { method: 'DELETE' });
}

export async function retryCustomStoryAudio(
  uid: string,
  storyId: string,
): Promise<{ status: string; story_id: string; blocks: number }> {
  return apiClient(`/api/users/${uid}/custom-stories/${storyId}/retry-audio`, {
    method: 'POST',
  });
}
