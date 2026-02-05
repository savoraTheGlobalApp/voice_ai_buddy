import { apiClient } from './client';
import { Story, StorySummary, StoryRequest } from '../types/stories';

interface GenerateStoryResponse {
  session_id: string;
  title: string;
  segments: Story['segments'];
}

interface ListStoriesResponse {
  stories: StorySummary[];
}

export async function generateStory(
  uid: string,
  request: StoryRequest
): Promise<GenerateStoryResponse> {
  return apiClient<GenerateStoryResponse>(
    `/api/users/${uid}/stories/generate`,
    {
      method: 'POST',
      body: JSON.stringify(request),
    }
  );
}

export async function listStories(uid: string): Promise<StorySummary[]> {
  const response = await apiClient<ListStoriesResponse>(
    `/api/users/${uid}/stories`
  );
  return response.stories;
}

export async function getStory(uid: string, sessionId: string): Promise<Story> {
  return apiClient<Story>(`/api/users/${uid}/stories/${sessionId}`);
}

export async function updateStoryStatus(
  uid: string,
  sessionId: string,
  status: 'read' | 'favorite' | 'generated'
): Promise<void> {
  await apiClient(`/api/users/${uid}/stories/${sessionId}/status?status=${status}`, {
    method: 'PATCH',
  });
}
