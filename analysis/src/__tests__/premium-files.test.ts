import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertVersionMatches,
  loadPremiumFiles,
  readCommittedVersion,
  readProjectId,
} from "../utils/premium-files";
import {
  PREMIUM_ARTEFACT_NAMES,
  premiumVersion,
  renderDataVersion,
} from "../utils/premium-artefacts";

const created: string[] = [];

const tmp = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "premium-files-"));
  created.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const writeAll = (dir: string): Record<string, string> => {
  const files = Object.fromEntries(PREMIUM_ARTEFACT_NAMES.map((name) => [name, `[${name.length}]`]));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, `${name}.json`), content);
  }
  return files;
};

describe("loadPremiumFiles", () => {
  it("returns every artefact keyed by name", () => {
    const dir = tmp();
    const written = writeAll(dir);

    expect(loadPremiumFiles(dir)).toEqual(written);
  });

  it("names the missing artefact", () => {
    const dir = tmp();
    writeAll(dir);
    fs.rmSync(path.join(dir, "matchup-data-all.json"));

    expect(() => loadPremiumFiles(dir)).toThrow(/matchup-data-all\.json/);
  });

  it("ignores files that are not premium artefacts", () => {
    const dir = tmp();
    const written = writeAll(dir);
    fs.writeFileSync(path.join(dir, "notes.txt"), "x");

    expect(loadPremiumFiles(dir)).toEqual(written);
  });
});

describe("readCommittedVersion", () => {
  it("reads the premium version from the data version file", () => {
    const dir = tmp();
    const file = path.join(dir, "data-version.json");
    fs.writeFileSync(file, renderDataVersion("0123456789abcdef"));

    expect(readCommittedVersion(file)).toBe("0123456789abcdef");
  });

  it("rejects a file without a sixteen character hex version", () => {
    const dir = tmp();
    const file = path.join(dir, "data-version.json");
    fs.writeFileSync(file, '{ "premium": "nope" }\n');

    expect(() => readCommittedVersion(file)).toThrow(/premium/);
  });
});

describe("assertVersionMatches", () => {
  it("passes when the committed version matches the files", () => {
    const dir = tmp();
    const files = writeAll(dir);

    expect(() => assertVersionMatches(files, premiumVersion(files))).not.toThrow();
  });

  it("refuses when the files have moved on from the committed version", () => {
    const dir = tmp();
    const files = writeAll(dir);

    expect(() => assertVersionMatches(files, "0000000000000000")).toThrow(
      /0000000000000000.*refresh/
    );
  });
});

describe("readProjectId", () => {
  it("reads the default project from the firebase configuration", () => {
    const dir = tmp();
    const file = path.join(dir, ".firebaserc");
    fs.writeFileSync(file, JSON.stringify({ projects: { default: "my-project" } }));

    expect(readProjectId(file)).toBe("my-project");
  });

  it("throws when there is no default project", () => {
    const dir = tmp();
    const file = path.join(dir, ".firebaserc");
    fs.writeFileSync(file, JSON.stringify({ projects: {} }));

    expect(() => readProjectId(file)).toThrow(/default/);
  });
});
