/**
 * Hook for fetching and managing static mythological stories
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStaticStory,
  getStoryProgress,
  updateStoryProgress,
  getUserCharacters,
} from '../api/staticStories';

/**
 * Fetch a single static story by ID
 */
export function useStaticStory(storyId: string) {
  return useQuery({
    queryKey: ['static-story', storyId],
    queryFn: () => getStaticStory(storyId),
    enabled: !!storyId,
  });
}

/**
 * Fetch user's progress on a static story
 */
export function useStoryProgress(userId: string | undefined, storyId: string) {
  return useQuery({
    queryKey: ['story-progress', userId, storyId],
    queryFn: () => {
      if (!userId) throw new Error('User ID required');
      return getStoryProgress(userId, storyId);
    },
    enabled: !!userId && !!storyId,
  });
}

/**
 * Update user's reading progress on a story
 */
export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      storyId,
      currentSegment,
      status,
    }: {
      userId: string;
      storyId: string;
      currentSegment: number;
      status: 'not_started' | 'in_progress' | 'completed';
    }) => updateStoryProgress(userId, storyId, currentSegment, status),
    onSuccess: (data, variables) => {
      // Invalidate and refetch progress
      queryClient.invalidateQueries({
        queryKey: ['story-progress', variables.userId, variables.storyId],
      });

      // Invalidate characters if any were unlocked
      if (data.unlocked_characters && data.unlocked_characters.length > 0) {
        queryClient.invalidateQueries({
          queryKey: ['user-characters', variables.userId],
        });
      }
    },
  });
}

/**
 * Fetch user's unlocked characters
 */
export function useUserCharacters(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-characters', userId],
    queryFn: () => {
      if (!userId) throw new Error('User ID required');
      return getUserCharacters(userId);
    },
    enabled: !!userId,
  });
}
