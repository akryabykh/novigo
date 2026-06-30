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
  programs: (uid: string) => ['programs', uid] as const,
  program: (id: string) => ['program', id] as const,
  tasks: (programId: string) => ['tasks', programId] as const,
  /** aggregate of all programs+tasks+logs for a user (home + progress + gamification) */
  workspace: (uid: string) => ['workspace', uid] as const,
  achievements: (uid: string) => ['achievements', uid] as const,
};
