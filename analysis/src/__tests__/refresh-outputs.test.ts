import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  TRACKED_OUTPUTS,
  beginRefresh,
  classifyRefresh,
  discardRefresh,
  scratchPath,
  stageRefresh,
} from "../../scripts/refresh-outputs";

const roots: string[] = [];

const git = (root: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const put = (root: string, name: string, content: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), content);
};
const read = (root: string, name: string): string => fs.readFileSync(path.join(root, name), "utf8");

const fixture = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-outputs-"));
  roots.push(root);
  git(root, "init", "-q");
  put(root, ".gitignore", "analysis/data/\nanalysis/out/\nnode_modules/\n");
  put(root, "analysis/src/data/limitless-decks.json", "base");
  put(root, "public/og/deck/old.png", "old image");
  put(root, "public/og/deck/kept.png", "kept image");
  put(root, "public/data/hubs/old.json", "old hub");
  put(root, "public/data/data-version.json", "old version");
  put(root, "src/app/last-updated.ts", "old timestamp");
  put(root, "notes.txt", "human");
  put(root, "analysis/data/decks/canary", "raw");
  put(root, "analysis/out/premium/best-decks-30d.json", "old premium");
  git(root, "add", ".");
  git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "base");
  return root;
};

const generate = (scratch: string): void => {
  put(scratch, "analysis/src/data/limitless-decks.json", "generated");
  put(scratch, "public/og/deck/new.png", "new image");
  fs.rmSync(path.join(scratch, "public/og/deck/old.png"));
  put(scratch, "public/data/hubs/new.json", "new hub");
  put(scratch, "src/app/last-updated.ts", "new timestamp");
  put(scratch, "analysis/out/premium/best-decks-30d.json", "new premium");
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      discardRefresh(root);
    } catch {
      // The fixture may not have a scratch worktree.
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("refresh scratch worktree", () => {
  it("generates in a scratch worktree that links the raw store", () => {
    const root = fixture();
    const scratch = beginRefresh(root);
    expect(scratch).toBe(scratchPath(root));
    expect(read(scratch, "analysis/src/data/limitless-decks.json")).toBe("base");
    expect(read(scratch, "analysis/data/decks/canary")).toBe("raw");
  });

  it("leaves the checkout untouched when generation stops partway", () => {
    const root = fixture();
    const scratch = beginRefresh(root);
    put(scratch, "analysis/src/data/limitless-decks.json", "half written");
    put(scratch, "public/og/deck/partial.png", "partial");
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(read(root, "analysis/src/data/limitless-decks.json")).toBe("base");
    discardRefresh(root);
    expect(fs.existsSync(scratch)).toBe(false);
    expect(git(root, "worktree", "list", "--porcelain")).not.toContain("refresh-scratch");
    expect(read(root, "analysis/data/decks/canary")).toBe("raw");
    expect(beginRefresh(root)).toBe(scratch);
  });

  it("moves outputs into place and stages exactly the output paths", () => {
    const root = fixture();
    const scratch = beginRefresh(root);
    generate(scratch);
    put(scratch, "notes.txt", "scratch-only edit");
    const staged = stageRefresh(root);
    expect(staged.sort()).toEqual([
      "analysis/src/data/limitless-decks.json",
      "public/data/hubs/new.json",
      "public/og/deck/new.png",
      "public/og/deck/old.png",
      "src/app/last-updated.ts",
    ]);
    expect(git(root, "diff", "--cached", "--name-only").split("\n").sort()).toEqual(staged);
    expect(read(root, "analysis/src/data/limitless-decks.json")).toBe("generated");
    expect(fs.existsSync(path.join(root, "public/og/deck/old.png"))).toBe(false);
    expect(read(root, "public/og/deck/kept.png")).toBe("kept image");
    expect(read(root, "notes.txt")).toBe("human");
    expect(read(root, "analysis/out/premium/best-decks-30d.json")).toBe("new premium");
    expect(fs.existsSync(scratch)).toBe(false);
  });

  it("refuses a second refresh while one holds the scratch worktree", () => {
    const root = fixture();
    beginRefresh(root);
    expect(() => beginRefresh(root)).toThrow(/running or was interrupted/);
  });

  it("lists the timestamp among the tracked outputs a rollback restores", () => {
    expect(TRACKED_OUTPUTS).toContain("src/app/last-updated.ts");
    expect(TRACKED_OUTPUTS).toContain("public/og/deck");
    expect(TRACKED_OUTPUTS.some((name) => name.startsWith("analysis/out/"))).toBe(false);
  });

  it("refuses to stage after the checkout HEAD moved since begin", () => {
    const root = fixture();
    const scratch = beginRefresh(root);
    generate(scratch);
    put(root, "public/data/data-version.json", "newer commit");
    git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qam", "newer");
    expect(() => stageRefresh(root)).toThrow(/HEAD moved since begin/);
    expect(read(root, "public/data/data-version.json")).toBe("newer commit");
    expect(read(root, "analysis/src/data/limitless-decks.json")).toBe("base");
  });

  it("refuses to start or stage over changed outputs", () => {
    const root = fixture();
    put(root, "public/data/data-version.json", "human edit");
    expect(() => beginRefresh(root)).toThrow(/already changed/);
    git(root, "checkout", "--", "public/data/data-version.json");
    const scratch = beginRefresh(root);
    put(scratch, "public/data/data-version.json", "generated");
    put(root, "public/data/data-version.json", "human edit");
    expect(() => stageRefresh(root)).toThrow(/already changed/);
    expect(read(root, "public/data/data-version.json")).toBe("human edit");
  });

  it("classifies a timestamp-only run as silent", () => {
    const root = fixture();
    const scratch = beginRefresh(root);
    put(scratch, "src/app/last-updated.ts", "new timestamp");
    expect(classifyRefresh(root)).toEqual([]);
  });

  it("classifies changed outputs and changed ignored premium files as activity", () => {
    const root = fixture();
    const scratch = beginRefresh(root);
    generate(scratch);
    expect(classifyRefresh(root).sort()).toEqual([
      "analysis/out/premium/best-decks-30d.json",
      "analysis/src/data/limitless-decks.json",
      "public/data/hubs/new.json",
      "public/og/deck/new.png",
      "public/og/deck/old.png",
    ]);
  });

  it("does not stage premium output", () => {
    const root = fixture();
    const scratch = beginRefresh(root);
    put(scratch, "analysis/out/premium/best-decks-30d.json", "new premium");
    expect(stageRefresh(root)).toEqual([]);
    expect(git(root, "diff", "--cached", "--name-only")).toBe("");
    expect(read(root, "analysis/out/premium/best-decks-30d.json")).toBe("new premium");
  });

  it("refuses to run from inside the scratch worktree", () => {
    const root = fixture();
    const scratch = beginRefresh(root);
    expect(() => classifyRefresh(scratch)).toThrow(/main checkout/);
  });

  it("needs a begun run to classify or stage", () => {
    const root = fixture();
    expect(() => classifyRefresh(root)).toThrow(/run begin first/);
    expect(() => stageRefresh(root)).toThrow(/run begin first/);
  });
});
