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

  it("fails the run when the scrape fetched no set pages", () => {
    const code = exitCodeFor({
      fetchedSets: 0,
      unknownSetCodes: false,
      unresolvedSlugs: 0,
      failures: 0,
    });

    expect(code).toBe(1);
  });

  it("fails the run when the card database holds an unknown set code", () => {
    const code = exitCodeFor({
      fetchedSets: 3,
      unknownSetCodes: true,
      unresolvedSlugs: 0,
      failures: 0,
    });

    expect(code).toBe(1);
  });

  it("fails the run when a slug was left unresolved", () => {
    const code = exitCodeFor({
      fetchedSets: 3,
      unknownSetCodes: false,
      unresolvedSlugs: 2,
      failures: 0,
    });

    expect(code).toBe(1);
  });
});
