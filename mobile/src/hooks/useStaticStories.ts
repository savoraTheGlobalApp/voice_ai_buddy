/**
 * Hook for fetching and managing static mythological stories
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listStaticStories,
  getStaticStory,
  getStoryProgress,
  updateStoryProgress,
  getUserCharacters,
  getBlockContent,
  getExperiments,
  getUserExperimentAssignment,
} from '../api/staticStories';

/**
 * Fetch list of all available static stories
 */
export function useStaticStories(category?: string, limit: number = 100, offset: number = 0) {
  return useQuery({
    queryKey: ['static-stories', category, limit, offset],
    queryFn: () => listStaticStories(category, limit, offset),
    staleTime: 10 * 60 * 1000,  // 10 min — matches server-side cache TTL
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch a single static story by ID
 */
export function useStaticStory(storyId: string) {
  return useQuery({
    queryKey: ['static-story', storyId],
    queryFn: () => getStaticStory(storyId),
    enabled: !!storyId,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
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

// ============================================
// Block-Based Content Hooks
// ============================================

interface UseBlockContentOptions {
  storyId: string;
  userId?: string;
  experimentId?: string;      // Optional - backend decides if not provided
  variantOverride?: string;
}

/**
 * Fetch story as block-based content
 *
 * Backend automatically determines which experiments apply based on story configuration.
 * You typically don't need to pass experimentId - only for testing/overriding.
 */
export function useBlockContent({
  storyId,
  userId,
  experimentId,
  variantOverride,
}: UseBlockContentOptions) {
  return useQuery({
    queryKey: ['block-content', storyId, userId, experimentId, variantOverride],
    queryFn: () => getBlockContent(storyId, userId, experimentId, variantOverride),
    enabled: !!storyId,
    staleTime: 30 * 60 * 1000,  // 30 min — story content never changes mid-session
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch all active experiments
 */
export function useExperiments() {
  return useQuery({
    queryKey: ['experiments'],
    queryFn: getExperiments,
  });
}

/**
 * Get user's experiment assignment
 */
export function useExperimentAssignment(
  userId: string | undefined,
  experimentId: string
) {
  return useQuery({
    queryKey: ['experiment-assignment', userId, experimentId],
    queryFn: () => {
      if (!userId) throw new Error('User ID required');
      return getUserExperimentAssignment(userId, experimentId);
    },
    enabled: !!userId && !!experimentId,
  });
}
