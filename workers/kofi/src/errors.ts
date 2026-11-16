export class UpstreamError extends Error {}

/** The short cause written to the log when a request fails. */
export const describeFailure = (error: unknown): string =>
  error instanceof UpstreamError ? error.message : error instanceof Error ? error.name : "unknown";
