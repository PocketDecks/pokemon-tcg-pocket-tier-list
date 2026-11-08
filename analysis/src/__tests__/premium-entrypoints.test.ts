import { describe, expect, it } from "vitest";

import { publishPremium } from "../../scripts/publish-premium";
import { PREMIUM_ARTEFACT_NAMES, premiumVersion, sha256Hex } from "../utils/premium-artefacts";

const premiumPayloads = (): Record<string, string> =>
  Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `{"name":"${name}"}`]));

const fakeFilesDb = (writes: string[]) => ({
  collection: () => ({ get: async () => ({ docs: [] as never[] }) }),
  doc: (path: string) => ({
    set: async (data: unknown) => {
      writes.push(`${path} ${JSON.stringify(data).length}`);
    },
  }),
  recursiveDelete: async () => {},
});

describe("premium entry points", () => {
  it("a dry run plans the writes without touching the database", async () => {
    const lines: string[] = [];
    await publishPremium(
      { db: null, dryRun: true, files: premiumPayloads(), version: premiumVersion(premiumPayloads()) },
      (line) => lines.push(line)
    );
    expect(lines[0]).toMatch(/Dry run for project .+, version [0-9a-f]{16}/);
  });

  it("publishes the artefacts and the version document through the injected database", async () => {
    const writes: string[] = [];
    const db = fakeFilesDb(writes);
    await publishPremium(
      { db, dryRun: false, files: premiumPayloads(), version: premiumVersion(premiumPayloads()) },
      () => {}
    );
    expect(writes.length).toBe(PREMIUM_ARTEFACT_NAMES.length + 1);
    expect(writes[0]).toContain("/artefacts/");
  });

});
