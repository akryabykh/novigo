// React Query client + centralized cache keys (avoid key drift across screens).
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
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
