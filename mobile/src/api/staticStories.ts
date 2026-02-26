import { apiClient } from './client';
import { StaticStory, StoryProgress, CharacterCard, BlockBasedContent, ExperimentInfo } from '../types/stories';

interface UpdateProgressResponse {
  status: string;
  unlocked_characters?: string[];
}

interface UserCharactersResponse {
  characters: CharacterCard[];
  total_unlocked: number;
}

interface StoryListItem {
  story_id: string;
  title: {
    en: string;
    hi: string;
  };
  category: string;
  values: string[];
  characters: string[];
  metadata: {
    reading_time: number;
    recommended_age: [number, number];
    difficulty_level: string;
  };
  segment_count: number;
  cover_image_url?: string;
  created_at?: string;
}

interface ListStoriesResponse {
  stories: StoryListItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Fetch list of all available static stories
 */
export async function listStaticStories(
  category?: string,
  limit: number = 100,
  offset: number = 0
): Promise<ListStoriesResponse> {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());

  const queryString = params.toString();
  const url = `/api/static-stories${queryString ? `?${queryString}` : ''}`;

  return apiClient<ListStoriesResponse>(url);
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

// ============================================
// Block-Based Content API
// ============================================

interface ExperimentListResponse {
  experiments: Array<{
    id: string;
    name: string;
    description: string;
    variants: Array<{ id: string; weight: number }>;
    active: boolean;
  }>;
}

/**
 * Fetch a story as block-based content
 *
 * Backend automatically determines which experiments apply based on story configuration.
 * experimentId is optional - only needed for testing/overriding default behavior.
 */
export async function getBlockContent(
  storyId: string,
  userId?: string,
  experimentId?: string,      // Optional - backend decides if not provided
  variantOverride?: string
): Promise<BlockBasedContent> {
  const params = new URLSearchParams();
  if (userId) params.append('user_id', userId);
  if (experimentId) params.append('experiment_id', experimentId);  // Only sent if provided
  if (variantOverride) params.append('variant_override', variantOverride);

  const queryString = params.toString();
  const url = `/api/content/${storyId}/blocks${queryString ? `?${queryString}` : ''}`;

  return apiClient<BlockBasedContent>(url);
}

/**
 * Fetch all active experiments
 */
export async function getExperiments(): Promise<ExperimentListResponse> {
  return apiClient<ExperimentListResponse>('/api/experiments');
}

/**
 * Get user's experiment assignment
 */
export async function getUserExperimentAssignment(
  uid: string,
  experimentId: string
): Promise<ExperimentInfo> {
  return apiClient<ExperimentInfo>(
    `/api/users/${uid}/experiment-assignment/${experimentId}`
  );
}
