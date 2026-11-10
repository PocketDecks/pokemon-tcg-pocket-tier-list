import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { beginRefresh, checkpointRefresh, classifyRefresh, recoverRefresh, REFRESH_OUTPUT_FILES, stageRefresh } from "../../scripts/refresh-outputs";

const roots: string[] = [];
const externalPaths: string[] = [];
const outside = (root: string, name: string): string => {
  const target = path.join(path.dirname(root), `${path.basename(root)}-${name}`);
  externalPaths.push(target);
  return target;
};
const linkType = process.platform === "win32" ? "junction" : "dir";
const writeProof = (temporary: string, content: string): void => {
  fs.writeFileSync(`${temporary}.owner`, JSON.stringify({
    version: 1,
    sha256: createHash("sha256").update(content).digest("hex"),
  }));
};
const startPausedWriter = async (destination: string) => {
  const writerUrl = pathToFileURL(path.resolve(process.cwd(), "../scripts/atomic-write.mjs")).href;
  const script = `import fs from "node:fs"; const { writeFileAtomic } = await import(process.argv[1]); const rename = fs.renameSync; fs.renameSync = (from, to) => { process.stdout.write(from + "\\n"); const byte = Buffer.alloc(1); fs.readSync(0, byte, 0, 1); return rename(from, to); }; writeFileAtomic(process.argv[2], "generated", { refreshRecovery: true });`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script, writerUrl, destination], { stdio: ["pipe", "pipe", "inherit"] });
  const temporary = await new Promise<string>((resolve, reject) => {
    let output = "";
    child.once("error", reject);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const newline = output.indexOf("\n");
      if (newline >= 0) resolve(output.slice(0, newline));
    });
  });
  return { child, temporary };
};
const fixture = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-outputs-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  fs.mkdirSync(path.join(root, "analysis/src/data"), { recursive: true });
  fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "base");
  fs.writeFileSync(path.join(root, ".gitignore"), "analysis/data/\nanalysis/out/premium-previous/\nanalysis/out/premium/\n.claude/\n.codex/\n");
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

  it("excludes premium outputs from git staging", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, ".gitignore"), "analysis/data/\nanalysis/out/premium-previous/\n");
    execFileSync("git", ["add", ".gitignore"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture ignore rules"], { cwd: root, stdio: "ignore" });
    const premium = path.join(root, "analysis/out/premium/best-decks-all.json");
    fs.mkdirSync(path.dirname(premium), { recursive: true });
    fs.writeFileSync(premium, "old premium");
    beginRefresh(root);
    fs.writeFileSync(premium, "new premium");
    checkpointRefresh(root);
    expect(stageRefresh(root)).not.toContain("analysis/out/premium/best-decks-all.json");
    expect(execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: root, encoding: "utf8" })).toBe("");
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

  it("checks for dirty files even when no recovery journal exists", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "human edit");
    expect(() => recoverRefresh(root)).toThrow(/worktree changes/i);
    expect(fs.readFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "utf8")).toBe("human edit");
  });

  it("refuses to replace an existing refresh journal", () => {
    const root = fixture();
    beginRefresh(root);
    const journal = fs.readFileSync(path.join(root, ".git/refresh-outputs.json"), "utf8");
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "generated");
    expect(() => beginRefresh(root)).toThrow(/journal already exists/i);
    expect(fs.readFileSync(path.join(root, ".git/refresh-outputs.json"), "utf8")).toBe(journal);
  });

  it("preserves a human-created sidecar with the writer's filename shape", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const temporary = `${target}.1234.12345678-1234-4234-9234-123456789abc.tmp`;
    fs.writeFileSync(temporary, "human data");
    expect(() => recoverRefresh(root)).toThrow(/unproven atomic temporary/i);
    expect(fs.readFileSync(target, "utf8")).toBe("base");
    expect(fs.readFileSync(temporary, "utf8")).toBe("human data");
  });

  it("refuses a live temporary from the root atomic writer", async () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const { child, temporary } = await startPausedWriter(target);
    try {
      expect(fs.existsSync(`${temporary}.owner`)).toBe(true);
      expect(() => recoverRefresh(root)).toThrow(/writer is still active/i);
      expect(fs.existsSync(temporary)).toBe(true);
      expect(fs.existsSync(`${temporary}.owner`)).toBe(true);
    } finally {
      child.stdin.write("x");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
    checkpointRefresh(root);
    recoverRefresh(root);
    expect(fs.readFileSync(target, "utf8")).toBe("base");
  });

  it("recovers a genuine abandoned root-writer temporary", async () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const { child, temporary } = await startPausedWriter(target);
    child.kill();
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    expect(fs.existsSync(`${temporary}.owner`)).toBe(true);
    recoverRefresh(root);
    expect(fs.readFileSync(target, "utf8")).toBe("base");
    expect(fs.existsSync(temporary)).toBe(false);
    expect(fs.existsSync(`${temporary}.owner`)).toBe(false);
  });

  it("recovers a new hub-tree target from the root writer", async () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "public/data/hubs/new.json");
    const { child, temporary } = await startPausedWriter(target);
    child.kill();
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    recoverRefresh(root);
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(temporary)).toBe(false);
    expect(fs.existsSync(`${temporary}.owner`)).toBe(false);
  });

  it("preserves a temporary with a tampered writer proof", async () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const { child, temporary } = await startPausedWriter(target);
    child.kill();
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    const owner = `${temporary}.owner`;
    const proof = JSON.parse(fs.readFileSync(owner, "utf8"));
    proof.sha256 = "0".repeat(64);
    fs.writeFileSync(owner, JSON.stringify(proof));
    expect(() => recoverRefresh(root)).toThrow(/invalid atomic temporary proof/i);
    expect(fs.existsSync(temporary)).toBe(true);
    expect(fs.existsSync(owner)).toBe(true);
  });

  it("does not treat an arbitrary PID-like temporary file as owned", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const temporary = `${target}.1234.not-a-uuid.tmp`;
    fs.writeFileSync(temporary, "human");
    expect(() => recoverRefresh(root)).toThrow(/unrelated worktree changes/i);
    expect(fs.readFileSync(temporary, "utf8")).toBe("human");
  });

  it("keeps firebase.json in the fixed output allowlist", () => {
    expect(REFRESH_OUTPUT_FILES).toContain("firebase.json");
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "firebase.json"), "generated");
    checkpointRefresh(root);
    expect(stageRefresh(root)).toEqual(["firebase.json"]);
  });

  it("rejects a changed output that was not checkpointed before staging", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "firebase.json"), "generated");
    expect(() => stageRefresh(root)).toThrow(/unrecorded file changes/i);
  });

  it("rejects a changed output that was not checkpointed before classification", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "generated");
    expect(() => classifyRefresh(root)).toThrow(/uncheckpointed file changes/i);
  });

  it("rejects paths that escape the worktree", () => {
    const root = fixture();
    const link = path.join(root, "analysis/src/data");
    fs.rmSync(link, { recursive: true, force: true });
    const external = outside(root, "escape");
    fs.mkdirSync(external, { recursive: true });
    fs.symlinkSync(external, link, linkType);
    expect(() => beginRefresh(root)).toThrow(/symlink|junction|escapes worktree/i);
  });

  it("repairs a recognised interrupted atomic write from its verified backup", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    fs.renameSync(target, `${target}.bak`);
    fs.writeFileSync(`${target}.tmp`, "partial");
    writeProof(`${target}.tmp`, "partial");
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
    expect(fs.existsSync(path.join(root, ".git/refresh-outputs.json"))).toBe(false);
    expect(() => beginRefresh(root)).not.toThrow();
  });

  it("completes recovery after a restored file already matches its baseline", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "generated");
    fs.writeFileSync(path.join(root, "public/data/data-version.json"), "new version");
    checkpointRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "base");
    expect(() => recoverRefresh(root)).not.toThrow();
    expect(fs.readFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "utf8")).toBe("base");
    expect(fs.readFileSync(path.join(root, "public/data/data-version.json"), "utf8")).toBe("old version");
    expect(fs.existsSync(path.join(root, ".git/refresh-outputs.json"))).toBe(false);
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

  it("ignores untracked tool directories but still stops on other untracked files", () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(root, ".claude/settings.json"), "{}");
    fs.mkdirSync(path.join(root, ".codex"), { recursive: true });
    fs.writeFileSync(path.join(root, ".codex/config.toml"), "");
    expect(() => recoverRefresh(root)).not.toThrow();
    fs.writeFileSync(path.join(root, "notes.txt"), "human");
    expect(() => recoverRefresh(root)).toThrow(/worktree changes/i);
  });

  it("reports the full source path of a renamed tracked output", () => {
    const root = fixture();
    execFileSync("git", ["mv", "public/data/hubs/old.json", "public/data/hubs/renamed.json"], { cwd: root });
    let error = "";
    try { recoverRefresh(root); } catch (caught) { error = String(caught); }
    expect(error).toContain("public/data/hubs/old.json");
    expect(error).not.toMatch(/(?:^|[, ])lic\/data\//);
  });

  it("removes an orphan owner proof left before its temporary was created", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const temporary = `${target}.999999.12345678-1234-4234-9234-123456789abc.tmp`;
    const owner = `${temporary}.owner`;
    fs.writeFileSync(owner, JSON.stringify({
      version: 1,
      pid: 999999,
      target,
      temporary: path.basename(temporary),
      sha256: "0".repeat(64),
    }));
    recoverRefresh(root);
    expect(fs.existsSync(owner)).toBe(false);
    expect(fs.readFileSync(target, "utf8")).toBe("base");
  });

  it("refuses an unproven sidecar beside a missing target", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const temporary = `${target}.tmp`;
    fs.rmSync(target);
    fs.writeFileSync(temporary, "partial");
    writeProof(temporary, "partial");
    expect(() => recoverRefresh(root)).toThrow(/unproven target/);
    expect(fs.existsSync(temporary)).toBe(true);
  });

  it("refuses a non-empty created marker for a new output", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "public/data/best-decks.json");
    const temporary = `${target}.tmp`;
    const marker = `${target}.created`;
    fs.writeFileSync(temporary, "partial");
    writeProof(temporary, "partial");
    fs.writeFileSync(marker, "not a writer marker");
    expect(() => recoverRefresh(root)).toThrow(/unproven created marker/);
    expect(fs.existsSync(temporary)).toBe(true);
    expect(fs.existsSync(marker)).toBe(true);
  });

  it("refuses a backup whose bytes do not match the baseline", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    fs.renameSync(target, `${target}.bak`);
    fs.writeFileSync(`${target}.bak`, "someone else's bytes");
    fs.writeFileSync(`${target}.tmp`, "partial");
    expect(() => recoverRefresh(root)).toThrow(/unowned backup/);
    expect(fs.existsSync(`${target}.bak`)).toBe(true);
  });

  it("refuses a journal whose head no longer matches HEAD", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "README.md"), "second commit");
    execFileSync("git", ["add", "README.md"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "second"], { cwd: root, stdio: "ignore" });
    beginRefresh(root);
    const journalPath = path.join(root, ".git/refresh-outputs.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    journal.head = "0".repeat(40);
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    expect(() => recoverRefresh(root)).toThrow(/HEAD changed/);
  });

  it("records the staging plan in the journal even when git add fails", () => {
    const root = fixture();
    beginRefresh(root);
    fs.writeFileSync(path.join(root, "analysis/src/data/limitless-decks.json"), "generated");
    checkpointRefresh(root);
    fs.writeFileSync(path.join(root, ".git/index.lock"), "");
    expect(() => stageRefresh(root)).toThrow();
    const journal = JSON.parse(fs.readFileSync(path.join(root, ".git/refresh-outputs.json"), "utf8"));
    expect(journal.staged).toEqual(["analysis/src/data/limitless-decks.json"]);
  });

  it("refuses a sidecar whose target no longer matches its baseline", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    fs.writeFileSync(target, "changed by someone");
    fs.writeFileSync(`${target}.tmp`, "partial");
    writeProof(`${target}.tmp`, "partial");
    expect(() => recoverRefresh(root)).toThrow(/unproven target/);
    expect(fs.existsSync(`${target}.tmp`)).toBe(true);
  });

  it("refuses a completed write whose target bytes differ from the checkpoint", () => {
    const root = fixture();
    beginRefresh(root);
    checkpointRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    fs.writeFileSync(`${target}.created`, "");
    fs.writeFileSync(target, "tampered");
    expect(() => recoverRefresh(root)).toThrow(/unverified completed write/);
    expect(fs.existsSync(`${target}.created`)).toBe(true);
  });

  it("refuses a staged list that does not match the journal", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    fs.writeFileSync(target, "generated");
    checkpointRefresh(root);
    stageRefresh(root);
    fs.writeFileSync(path.join(root, "public/data/data-version.json"), "extra");
    execFileSync("git", ["add", "public/data/data-version.json"], { cwd: root });
    expect(() => recoverRefresh(root)).toThrow(/staged paths do not match/);
  });

  it("refuses staged bytes that differ from the checkpoint", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    fs.writeFileSync(target, "generated");
    checkpointRefresh(root);
    stageRefresh(root);
    fs.writeFileSync(target, "tampered");
    execFileSync("git", ["add", "analysis/src/data/limitless-decks.json"], { cwd: root });
    expect(() => recoverRefresh(root)).toThrow(/staged bytes differ from checkpoint/);
  });

  it("refuses a tampered OG backup directory", () => {
    const root = fixture();
    beginRefresh(root);
    const deck = path.join(root, "public/og/deck");
    fs.renameSync(deck, `${deck}.previous`);
    fs.writeFileSync(path.join(`${deck}.previous`, "image.png"), "tampered");
    expect(() => recoverRefresh(root)).toThrow(/unverified OG backup/);
  });

  it("refuses an owner proof whose target does not match its temporary", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const temporary = `${target}.999999.12345678-1234-4234-9234-123456789abc.tmp`;
    fs.writeFileSync(temporary, "generated");
    fs.writeFileSync(`${temporary}.owner`, JSON.stringify({
      version: 1,
      pid: 999999,
      target: path.join(root, "somewhere", "else.json"),
      temporary: path.basename(temporary),
      sha256: createHash("sha256").update("generated").digest("hex"),
    }));
    expect(() => recoverRefresh(root)).toThrow(/invalid atomic temporary proof/);
    expect(fs.existsSync(temporary)).toBe(true);
  });

  it("refuses HEAD movement when the worktree is still dirty", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "README.md"), "second commit");
    execFileSync("git", ["add", "README.md"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "second"], { cwd: root, stdio: "ignore" });
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    fs.writeFileSync(target, "generated");
    checkpointRefresh(root);
    execFileSync("git", ["add", "analysis/src/data/limitless-decks.json"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "generated"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "notes.txt"), "human");
    expect(() => recoverRefresh(root)).toThrow(/HEAD changed/);
  });

  it("rejects a stray file with an unexpected name in a generated tree", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "public/data/hubs/notes.txt"), "human");
    expect(() => beginRefresh(root)).toThrow(/unexpected file in public\/data\/hubs/);
  });

  it("rejects a generator-shaped file with an unknown suffix", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "public/data/hubs/x.json.txt"), "human");
    expect(() => beginRefresh(root)).toThrow(/unexpected file in public\/data\/hubs/);
  });

  it("refuses a bare temporary with no owner proof", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, "partial");
    expect(() => recoverRefresh(root)).toThrow(/unproven sidecar state/);
    expect(fs.existsSync(temporary)).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe("base");
  });

  it("recovers a bare temporary whose owner proof matches its bytes", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, "partial");
    writeProof(temporary, "partial");
    recoverRefresh(root);
    expect(fs.readFileSync(target, "utf8")).toBe("base");
    expect(fs.existsSync(temporary)).toBe(false);
    expect(fs.existsSync(`${temporary}.owner`)).toBe(false);
  });

  it("cleans a stale journal temporary at the start of a run", () => {
    const root = fixture();
    const journal = path.join(root, ".git/refresh-outputs.json");
    const stale = `${journal}.1234.stale.tmp`;
    fs.writeFileSync(stale, "{");
    beginRefresh(root);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(journal)).toBe(true);
  });

  it("refuses an OG backup when the live tree differs from both states", () => {
    const root = fixture();
    beginRefresh(root);
    const deck = path.join(root, "public/og/deck");
    fs.renameSync(deck, `${deck}.previous`);
    fs.mkdirSync(deck, { recursive: true });
    fs.writeFileSync(path.join(deck, "image.png"), "unexpected");
    expect(() => recoverRefresh(root)).toThrow(/OG target differs from its checkpoint/);
  });

  it("rejects a writer sidecar inside a generated tree as an unexpected file", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "public/data/hubs/old.json");
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, "partial");
    writeProof(temporary, "partial");
    expect(() => recoverRefresh(root)).toThrow(/unexpected file in public\/data\/hubs: old\.json\.tmp/);
    expect(fs.readFileSync(target, "utf8")).toBe("old hub");
    expect(fs.existsSync(temporary)).toBe(true);
  });

  it("does not treat a legitimate OG atomic temporary as an unexpected tree file", () => {
    const root = fixture();
    beginRefresh(root);
    const deck = path.join(root, "public/og/deck");
    const temporary = path.join(deck, `image.png.${process.pid}.${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(temporary, "partial");
    writeProof(temporary, "partial");
    expect(() => recoverRefresh(root)).not.toThrow(/unexpected file in public\/og\/deck/);
  });

  it("refuses a completed write whose created marker is not empty", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    fs.writeFileSync(`${target}.created`, "not a writer marker");
    expect(() => recoverRefresh(root)).toThrow(/unproven created marker/);
    expect(fs.readFileSync(target, "utf8")).toBe("base");
  });

  it("refuses a completed write whose writer proof does not match the target", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    fs.writeFileSync(`${target}.created`, "");
    fs.writeFileSync(`${target}.tmp.owner`, JSON.stringify({
      version: 1,
      sha256: createHash("sha256").update("other content").digest("hex"),
    }));
    expect(() => recoverRefresh(root)).toThrow(/unproven writer proof/);
    expect(fs.existsSync(target)).toBe(true);
  });

  it("cleans a leftover writer proof that matches the completed target", () => {
    const root = fixture();
    beginRefresh(root);
    const target = path.join(root, "analysis/src/data/limitless-decks.json");
    const content = fs.readFileSync(target, "utf8");
    fs.writeFileSync(`${target}.tmp.owner`, JSON.stringify({
      version: 1,
      sha256: createHash("sha256").update(content).digest("hex"),
    }));
    recoverRefresh(root);
    expect(fs.existsSync(`${target}.created`)).toBe(false);
    expect(fs.existsSync(`${target}.tmp.owner`)).toBe(false);
    expect(fs.readFileSync(target, "utf8")).toBe("base");
  });
});
