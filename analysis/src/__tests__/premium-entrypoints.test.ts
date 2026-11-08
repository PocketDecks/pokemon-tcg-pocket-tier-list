import { describe, expect, it } from "vitest";

import { publishPremium } from "../../scripts/publish-premium";
import { PREMIUM_ARTEFACT_NAMES, premiumVersion, sha256Hex } from "../utils/premium-artefacts";

const premiumPayloads = (): Record<string, string> =>
  Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `{"name":"${name}"}`]));

interface Write {
  path: string;
  data: unknown;
}

const fakeFilesDb = (writes: Write[], deletes: unknown[] = []) => ({
  collection: () => ({
    get: async () => ({
      docs: Array.from({ length: 6 }, (_, index) => ({
        id: `old-${index}`,
        get: () => 1,
      })),
    }),
  }),
  doc: (path: string) => ({
    ref: { path, documentReference: true },
    set: async (data: unknown) => {
      writes.push({ path, data });
    },
  }),
  recursiveDelete: async (ref: unknown) => {
    deletes.push(ref);
  },
});

describe("premium entry points", () => {
  it("a dry run plans the writes without touching the database", async () => {
    const lines: string[] = [];
    const db = {
      collection: () => {
        throw new Error("dry run accessed collection");
      },
      doc: () => {
        throw new Error("dry run accessed document");
      },
      recursiveDelete: async () => {
        throw new Error("dry run accessed recursive delete");
      },
    };
    await publishPremium(
      { db, dryRun: true, files: premiumPayloads(), version: premiumVersion(premiumPayloads()) },
      (line) => lines.push(line)
    );
    expect(lines[0]).toMatch(/Dry run for project .+, version [0-9a-f]{16}/);
  });

  it("publishes the artefacts and the version document through the injected database", async () => {
    const writes: Write[] = [];
    const deletes: unknown[] = [];
    const files = premiumPayloads();
    const version = premiumVersion(files);
    const db = fakeFilesDb(writes, deletes);
    await publishPremium(
      { db, dryRun: false, files, version },
      () => {}
    );
    expect(writes.length).toBe(PREMIUM_ARTEFACT_NAMES.length + 1);
    const artefactWrites = writes.filter((write) => write.path.includes("/artefacts/"));
    expect(artefactWrites).toHaveLength(PREMIUM_ARTEFACT_NAMES.length);
    expect(artefactWrites.map((write) => write.path.split("/").pop()).sort()).toEqual(
      [...PREMIUM_ARTEFACT_NAMES].sort()
    );
    for (const write of artefactWrites) {
      const name = write.path.split("/").pop() as string;
      expect(write.data).toEqual({ payload: files[name], sha256: sha256Hex(files[name]) });
    }
    expect(writes.filter((write) => write.path === `premiumData/${version}`)).toEqual([
      {
        path: `premiumData/${version}`,
        data: expect.objectContaining({
          artefacts: Object.fromEntries(
            PREMIUM_ARTEFACT_NAMES.map((name) => [name, sha256Hex(files[name])])
          ),
        }),
      },
    ]);
    expect(deletes).toEqual([
      { path: "premiumData/old-5", documentReference: true },
      { path: "premiumData/old-4", documentReference: true },
    ]);
  });

});
