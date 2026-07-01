// React Query client + centralized cache keys (avoid key drift across screens).
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Free-tier Supabase can stall the first request after idle (compute waking).
      // supabase.ts aborts a stalled fetch at 10s; retry a few times so the follow-up
      // lands in the now-awake DB instead of leaving the screen on skeletons.
      retry: 3,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 4_000),
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export const qk = {
  profile: (uid: string) => ['profile', uid] as const,
  /** active session + its goals + logs */
  workspace: (uid: string) => ['workspace', uid] as const,
  achievements: (uid: string) => ['achievements', uid] as const,
};
