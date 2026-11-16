import { QueryClient } from "@tanstack/react-query";

export const queryClientOptions = {
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 60, // 1 hour
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
};

// One client for the whole app. Modules outside React (the premium data
// loaders) read and fill the cache through it, so what they remember is
// visible to React Query like everything else.
export const queryClient = new QueryClient(queryClientOptions);
