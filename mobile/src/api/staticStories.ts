import { apiClient } from './client';
import { StaticStory, StoryProgress, CharacterCard } from '../types/stories';

interface UpdateProgressResponse {
  status: string;
  unlocked_characters?: string[];
}

interface UserCharactersResponse {
  characters: CharacterCard[];
  total_unlocked: number;
}

/**
 * Fetch a single static story by ID
 */
export async function getStaticStory(storyId: string): Promise<StaticStory> {
  return apiClient<StaticStory>(`/api/static-stories/${storyId}`);
}

/**
 * Fetch user's progress on a static story
 */
export async function getStoryProgress(
  uid: string,
  storyId: string
): Promise<StoryProgress> {
  return apiClient<StoryProgress>(
    `/api/users/${uid}/static-stories/${storyId}/progress`
  );
}

/**
 * Update user's reading progress on a story
 */
export async function updateStoryProgress(
  uid: string,
  storyId: string,
  currentSegment: number,
  status: 'not_started' | 'in_progress' | 'completed'
): Promise<UpdateProgressResponse> {
  return apiClient<UpdateProgressResponse>(
    `/api/users/${uid}/static-stories/${storyId}/progress`,
    {
      method: 'POST',
      body: JSON.stringify({
        current_segment: currentSegment,
        status,
      }),
    }
  );
}

/**
 * Fetch user's unlocked characters
 */
export async function getUserCharacters(
  uid: string
): Promise<UserCharactersResponse> {
  return apiClient<UserCharactersResponse>(`/api/users/${uid}/characters`);
}
