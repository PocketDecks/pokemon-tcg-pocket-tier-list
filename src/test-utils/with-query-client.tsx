import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

export const withQueryClient = (
  children: ReactNode,
  client: QueryClient = createTestQueryClient()
) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
