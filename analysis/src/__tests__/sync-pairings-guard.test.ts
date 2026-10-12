import { vi } from "vitest";
import { exitCodeFor } from "../../scripts/sync-pairings";

// The script loads the root .env on import; the guard needs none of it.
vi.mock("../load-env-side-effect", () => ({}));

describe("sync-pairings exit code", () => {
  it("fails the run when a set page was skipped", () => {
    const code = exitCodeFor({
      fetchedSets: 3,
      unknownSetCodes: false,
      unresolvedSlugs: 0,
      failures: 1,
    });

    expect(code).toBe(1);
  });

  it("passes a run with no failures", () => {
    const code = exitCodeFor({
      fetchedSets: 3,
      unknownSetCodes: false,
      unresolvedSlugs: 0,
      failures: 0,
    });

    expect(code).toBe(0);
  });
});
