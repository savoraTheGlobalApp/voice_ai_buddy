import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listStories, getStory, generateStory, updateStoryStatus } from '../api/stories';
import { StoryRequest } from '../types/stories';
import { useAuth } from '../contexts/AuthContext';

export function useStoriesList() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;

  return useQuery({
    queryKey: ['stories', uid],
    queryFn: () => listStories(uid!),
    enabled: !!uid,
  });
}

export function useStory(sessionId: string) {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;

  return useQuery({
    queryKey: ['story', uid, sessionId],
    queryFn: () => getStory(uid!, sessionId),
    enabled: !!uid && !!sessionId,
  });
}

export function useGenerateStory() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: StoryRequest) => generateStory(uid!, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', uid] });
    },
  });
}

export function useUpdateStoryStatus() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, status }: { sessionId: string; status: 'read' | 'favorite' | 'generated' }) =>
      updateStoryStatus(uid!, sessionId, status),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['stories', uid] });
      queryClient.invalidateQueries({ queryKey: ['story', uid, sessionId] });
    },
  });
}
