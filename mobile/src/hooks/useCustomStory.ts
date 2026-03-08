import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  generateCustomStory,
  getCustomStory,
  listCustomStories,
  deleteCustomStory,
  CustomStoryRequest,
  CustomStoryContent,
} from '../api/customStories';

/**
 * Mutation: generate a new custom story.
 * Returns BlockBasedContent + audio_status immediately; audio fills in async.
 */
export function useGenerateCustomStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ uid, request }: { uid: string; request: CustomStoryRequest }) =>
      generateCustomStory(uid, request),
    onSuccess: (data, variables) => {
      // Seed the single-story cache so block-viewer doesn't need to re-fetch
      queryClient.setQueryData(['custom-story', variables.uid, data.contentId], data);
      // Invalidate list so My Stories row refreshes
      queryClient.invalidateQueries({ queryKey: ['custom-stories', variables.uid] });
    },
  });
}

/**
 * Query: list custom stories for a user.
 */
export function useCustomStories(uid: string | undefined) {
  return useQuery({
    queryKey: ['custom-stories', uid],
    queryFn: () => {
      if (!uid) throw new Error('uid required');
      return listCustomStories(uid);
    },
    enabled: !!uid,
    staleTime: 60 * 1000,
  });
}

/**
 * Query: fetch a single custom story.
 * Automatically polls every 5s while audio_status === 'pending'.
 */
export function useCustomStory(uid: string | undefined, storyId: string | undefined) {
  return useQuery({
    queryKey: ['custom-story', uid, storyId],
    queryFn: () => {
      if (!uid || !storyId) throw new Error('uid and storyId required');
      return getCustomStory(uid, storyId);
    },
    enabled: !!uid && !!storyId,
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data as CustomStoryContent | undefined;
      if (!data || data.audio_status === 'pending') return 5000;
      return false;
    },
    refetchOnWindowFocus: false,
  });
}

/**
 * Mutation: delete a custom story.
 */
export function useDeleteCustomStory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ uid, storyId }: { uid: string; storyId: string }) =>
      deleteCustomStory(uid, storyId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['custom-stories', variables.uid] });
      queryClient.removeQueries({ queryKey: ['custom-story', variables.uid, variables.storyId] });
    },
  });
}
