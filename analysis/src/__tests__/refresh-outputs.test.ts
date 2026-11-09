import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { beginRefresh, checkpointRefresh, classifyRefresh, recoverRefresh, stageRefresh } from "../../scripts/refresh-outputs";

const roots: string[] = [];
const externalPaths: string[] = [];
const outside = (root: string, name: string): string => {
  const target = path.join(path.dirname(root), `${path.basename(root)}-${name}`);
  externalPaths.push(target);
  return target;
};
const linkType = process.platform === "win32" ? "junction" : "dir";
const fixture = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-outputs-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  fs.mkdirSync(path.join(root, "analysis/src/data"), { recursive: true });
  fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "base");
  fs.writeFileSync(path.join(root, ".gitignore"), "analysis/data/\nanalysis/out/premium-previous/\nanalysis/out/premium/\n");
  fs.mkdirSync(path.join(root, "public/og/deck"), { recursive: true });
  fs.writeFileSync(path.join(root, "public/og/deck/image.png"), "old image");
  fs.mkdirSync(path.join(root, "public/data/hubs"), { recursive: true });
  fs.writeFileSync(path.join(root, "public/data/hubs/old.json"), "old hub");
  fs.mkdirSync(path.join(root, "public/data"), { recursive: true });
  fs.writeFileSync(path.join(root, "public/data/data-version.json"), "old version");
  fs.mkdirSync(path.join(root, "analysis/out/premium-previous/0123456789abcdef"), { recursive: true });
  fs.writeFileSync(path.join(root, "analysis/out/premium-previous/0123456789abcdef/canary"), "snapshot");
  fs.mkdirSync(path.join(root, "src/app"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/app/last-updated.ts"), "old timestamp");
  fs.mkdirSync(path.join(root, "analysis/data/decks"), { recursive: true });
  fs.writeFileSync(path.join(root, "analysis/data/decks/canary"), "raw");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "base"], { cwd: root });
  return root;
};

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  externalPaths.splice(0).forEach((target) => fs.rmSync(target, { recursive: true, force: true }));
});

describe("refresh output journal", () => {
  it("recovers checkpointed generated changes while preserving raw stores", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "generated");
    checkpointRefresh(root);
    expect(classifyRefresh(root)).toContain("analysis/src/data/limitless-decks.json");
    recoverRefresh(root);
    expect(fs.readFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "utf8")).toBe("base");
    expect(fs.readFileSync(path.join(root, "analysis/data/decks/canary"), "utf8")).toBe("raw");
    expect(fs.readFileSync(path.join(root, "analysis/out/premium-previous/0123456789abcdef/canary"), "utf8")).toBe("snapshot");
  });

  it("leaves a human edit untouched when its hash differs from the checkpoint", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "generated");
    checkpointRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "human");
    expect(() => recoverRefresh(root)).toThrow(/unrecorded file changes/);
    expect(fs.readFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "utf8")).toBe("human");
  });

  it.skipIf(process.platform === "win32")("rejects a symlink in the generated tree at baseline", () => {
    const root = fixture();
    const external = outside(root, "baseline-link.json");
    fs.writeFileSync(external, "outside canary");
    const target = path.join(root, "public/data/hubs/old.json");
    fs.rmSync(target);
    fs.symlinkSync(external, target, "file");
    expect(() => beginRefresh(root)).toThrow(/symlink|junction/i);
    expect(fs.readFileSync(external, "utf8")).toBe("outside canary");
  });

  it("rejects a junction ancestor at baseline", () => {
    const root = fixture();
    const external = outside(root, "baseline-junction");
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, "old.json"), "outside canary");
    const hubs = path.join(root, "public/data/hubs");
    fs.rmSync(hubs, { recursive: true, force: true });
    fs.symlinkSync(external, hubs, linkType);
    expect(() => beginRefresh(root)).toThrow(/symlink|junction/i);
    expect(fs.readFileSync(path.join(external, "old.json"), "utf8")).toBe("outside canary");
  });

  it.skipIf(process.platform === "win32")("rejects an output replaced by a symlink after its checkpoint", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "public/data/hubs/old.json");
    fs.writeFileSync(target, "generated hub");
    checkpointRefresh(root);
    const external = outside(root, "replacement-link.json");
    fs.writeFileSync(external, "generated hub");
    fs.rmSync(target);
    fs.symlinkSync(external, target, "file");
    expect(() => recoverRefresh(root)).toThrow(/symlink|junction/i);
    expect(fs.readFileSync(external, "utf8")).toBe("generated hub");
  });

  it("rejects an output tree replaced by a junction after its checkpoint", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "public/data/data-version.json"), "generated version");
    checkpointRefresh(root);
    const external = outside(root, "replacement-junction");
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, "data-version.json"), "generated version");
    fs.mkdirSync(path.join(external, "hubs"));
    fs.writeFileSync(path.join(external, "hubs/old.json"), "old hub");
    fs.rmSync(path.join(root, "public/data"), { recursive: true, force: true });
    fs.symlinkSync(external, path.join(root, "public/data"), linkType);
    let recoveryError = "";
    try { recoverRefresh(root); } catch (error) { recoveryError = String(error); }
    expect(fs.readFileSync(path.join(external, "data-version.json"), "utf8")).toBe("generated version");
    expect(recoveryError).toMatch(/symlink|junction|unrecorded file changes/i);
  });

  it("classifies changed ignored premium outputs as activity", () => {
    const root = fixture();
    const premium = path.join(root, "analysis/out/premium/best-decks-all.json");
    fs.mkdirSync(path.dirname(premium), { recursive: true });
    fs.writeFileSync(premium, "old premium");
    beginRefresh(root);
    fs.writeFileSync(premium, "new premium");
    checkpointRefresh(root);
    expect(classifyRefresh(root)).toContain("analysis/out/premium/best-decks-all.json");
    recoverRefresh(root);
    expect(fs.readFileSync(premium, "utf8")).toBe("old premium");
  });

  it("classifies a timestamp-only run as silent and restores the old timestamp", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "src/app/last-updated.ts"), "new timestamp");
    checkpointRefresh(root);
    expect(classifyRefresh(root)).toEqual([]);
    recoverRefresh(root);
    expect(fs.readFileSync(path.join(root, "src/app/last-updated.ts"), "utf8")).toBe("old timestamp");
  });

  it("restores deleted generated files and removes new generated files", () => {
    const root = fixture();
    beginRefresh(root);
    const hubs = path.join(root, "public/data/hubs");
    fs.rmSync(path.join(hubs, "old.json"));
    fs.writeFileSync(path.join(hubs, "new.json"), "new hub");
    checkpointRefresh(root);
    recoverRefresh(root);
    expect(fs.readFileSync(path.join(hubs, "old.json"), "utf8")).toBe("old hub");
    expect(fs.existsSync(path.join(hubs, "new.json"))).toBe(false);
  });

  it("refuses unknown files without changing them", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "notes.txt"), "human");
    expect(() => recoverRefresh(root)).toThrow(/unrelated worktree changes/);
    expect(fs.readFileSync(path.join(root, "notes.txt"), "utf8")).toBe("human");
  });

  it("repairs a recognised interrupted atomic write from its verified backup", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    fs.renameSync(target, `${target}.bak`);
    fs.writeFileSync(`${target}.tmp`, "partial");
    fs.writeFileSync(`${target}.created`, "");
    recoverRefresh(root);
    expect(fs.readFileSync(target, "utf8")).toBe("base");
    expect(fs.existsSync(`${target}.tmp`)).toBe(false);
    expect(fs.existsSync(`${target}.bak`)).toBe(false);
  });

  it("restores an OG backup after the live directory has moved aside", () => {
    const root = fixture();
    beginRefresh(root);
    fs.renameSync(path.join(root, "public/og/deck"), path.join(root, "public/og/deck.previous"));
    recoverRefresh(root);
    expect(fs.readFileSync(path.join(root, "public/og/deck/image.png"), "utf8")).toBe("old image");
    expect(fs.existsSync(path.join(root, "public/og/deck.previous"))).toBe(false);
  });

  it("removes a verified old OG backup after the new tree reached its checkpoint", () => {
    const root = fixture();
    beginRefresh(root);
    const deck = path.join(root, "public/og/deck");
    fs.renameSync(deck, `${deck}.previous`);
    fs.mkdirSync(deck, { recursive: true });
    fs.writeFileSync(path.join(deck, "image.png"), "new image");
    checkpointRefresh(root);
    recoverRefresh(root);
    expect(fs.readFileSync(path.join(deck, "image.png"), "utf8")).toBe("old image");
    expect(fs.existsSync(`${deck}.previous`)).toBe(false);
  });

  it("stages only changed allowlisted generated files", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "generated");
    checkpointRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/data/decks/canary"), "changed raw");
    expect(stageRefresh(root)).toEqual(["analysis/src/data/limitless-decks.json"]);
    expect(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: root, encoding: "utf8" }).trim()).toBe("analysis/src/data/limitless-decks.json");
  });

  it("clears the journal on the next run after the checkpointed output commit", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "generated");
    checkpointRefresh(root);
    stageRefresh(root);
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "generated"], { cwd: root });
    expect(() => recoverRefresh(root)).not.toThrow();
  });

  it("unstages only journaled outputs after an interrupted pre-commit stage", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "generated");
    checkpointRefresh(root);
    stageRefresh(root);
    recoverRefresh(root);
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })).toBe("");
    expect(fs.readFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "utf8")).toBe("base");
  });
});
