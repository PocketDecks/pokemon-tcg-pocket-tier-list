import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_REPO,
  MANUAL_REPAIR_MARKERS,
  REFRESH_SUBJECT,
  buildPrBody,
  findCanonicalRemote,
  humanCommits,
  isSilentDay,
  runJob,
} from "../../scripts/refresh-job";
import type { CommandResult, CommandSpec, Runner } from "../../scripts/refresh-job";

const ok = (stdout = "", overrides: Partial<CommandResult> = {}): CommandResult => ({
  status: 0,
  stdout,
  stderr: "",
  ...overrides,
});

const fixtureRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-job-"));
  fs.mkdirSync(path.join(root, "analysis", "src", "data"), { recursive: true });
  fs.mkdirSync(path.join(root, "public", "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "analysis", "src", "data", "limitless-decks.json"), JSON.stringify([{ id: 1 }, { id: 2 }]));
  fs.writeFileSync(path.join(root, "public", "data", "best-decks.json"), JSON.stringify([{ id: "a" }]));
  fs.writeFileSync(path.join(root, "public", "data", "data-version.json"), JSON.stringify({ premium: "version-1" }));
  fs.mkdirSync(path.join(root, "public", "og", "deck"), { recursive: true });
  fs.writeFileSync(path.join(root, "public", "og", "deck", "a.png"), "png");
  return root;
};

const scratchRoot = (): string => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-scratch-"));
  fs.mkdirSync(path.join(scratch, "analysis"), { recursive: true });
  return scratch;
};

const commandText = (command: CommandSpec): string => command.args.join(" ");

interface Harness {
  root: string;
  scratch: string;
  calls: CommandSpec[];
  runner: Runner;
  sleeps: number[];
}

const harness = (overrides: (command: CommandSpec, calls: CommandSpec[]) => CommandResult | undefined): Harness => {
  const root = fixtureRoot();
  const scratch = scratchRoot();
  const calls: CommandSpec[] = [];
  const sleeps: number[] = [];
  const runner: Runner = (command) => {
    calls.push(command);
    const text = commandText(command);
    const override = overrides(command, calls);
    if (override) return override;
    if (text.startsWith("remote -v")) {
      return ok(`pocket\thttps://github.com/${CANONICAL_REPO}.git (fetch)\n`);
    }
    if (text.startsWith("rev-parse --abbrev-ref")) return ok("feature/x\n");
    if (text.startsWith("config user.email")) return ok("bot@example.invalid\n");
    if (text.startsWith("refresh:outputs begin")) return ok(`${scratch}\n`);
    if (text.startsWith("refresh:outputs classify")) return ok("\n");
    if (text.startsWith("pr view")) return ok("", { status: 1 });
    if (text.startsWith("pr create")) return ok("https://github.com/pr/1\n");
    if (text.startsWith("rev-parse HEAD")) return ok("headsha\n");
    return overrides(command, calls) ?? ok();
  };
  return { root, scratch, calls, runner, sleeps };
};

describe("refresh job decisions with a fake runner", () => {
  it("finds the canonical remote by its GitHub URL", () => {
    expect(findCanonicalRemote(`upstream\thttps://github.com/other/repo.git (fetch)\npocket\thttps://github.com/${CANONICAL_REPO}.git (fetch)\n`)).toBe("pocket");
  });

  it("reads human commits with field separators", () => {
    const log = [
      `aaa\x1fJane Doe\x1fjane@example.com\x1fAdd a feature`,
      `bbb\x1fAutomation\x1fbot@example.invalid\x1f${REFRESH_SUBJECT}`,
    ].join("\n");
    expect(humanCommits(log, "bot@example.invalid")).toEqual([log.split("\n")[0]]);
  });

  it("treats empty classify output as silent", () => {
    expect(isSilentDay(" \n")).toBe(true);
    expect(isSilentDay("analysis/src/data/limitless-decks.json\n")).toBe(false);
  });

  it("builds a PR body from fixed fields", () => {
    expect(buildPrBody({ pairingRows: 2, rankedArchetypes: 1, imageParity: "1 images for 1 archetypes", testResults: "passed", premiumVersion: "v1" })).toContain("Premium data version `v1`");
  });

  it("keeps manual repair markers sourced from the store files", () => {
    const storeLock = fs.readFileSync(path.resolve(__dirname, "../utils/store-lock.ts"), "utf8");
    const deckStore = fs.readFileSync(path.resolve(__dirname, "../utils/deck-store.ts"), "utf8");
    for (const marker of MANUAL_REPAIR_MARKERS) {
      expect(storeLock + deckStore).toContain(marker);
    }
  });

  it("ends silent with a discard and no publish on a no-data day", async () => {
    const h = harness(() => undefined);
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("silent");
    expect(h.calls.some((c) => commandText(c).startsWith("publish:premium"))).toBe(false);
    expect(h.calls.some((c) => commandText(c).startsWith("refresh:outputs discard"))).toBe(true);
  });

  it("runs generation from the scratch worktree after begin", async () => {
    const h = harness(() => undefined);
    await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    const golden = h.calls.find((c) => commandText(c).startsWith("golden:generate"));
    expect(golden?.cwd).toBe(path.join(h.scratch, "analysis"));
    const classify = h.calls.find((c) => commandText(c).startsWith("refresh:outputs classify"));
    expect(classify?.cwd).toBe(path.join(h.root, "analysis"));
  });

  it("reuses and checks out an existing dated branch", async () => {
    const h = harness((c) => (commandText(c).startsWith("fetch origin automated/") ? ok("", { status: 0 }) : undefined));
    await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(h.calls.some((c) => commandText(c) === "checkout automated/pipeline-update-2026-11-23")).toBe(true);
  });

  it("stops for a person on a human commit", async () => {
    const h = harness((c) => (commandText(c).includes("main..automated/") ? ok("aaa\x1fJane Doe\x1fjane@example.com\x1fAdd a feature\n") : undefined));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 2");
  });

  it("edits an existing pull request instead of creating another", async () => {
    const h = harness((c) => {
      if (commandText(c).startsWith("pr view")) return ok("42\n");
      if (commandText(c).startsWith("refresh:outputs classify")) return ok("analysis/src/data/limitless-decks.json\n");
      return undefined;
    });
    await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(h.calls.some((c) => commandText(c).startsWith("pr edit 42"))).toBe(true);
    expect(h.calls.some((c) => commandText(c).startsWith("pr create"))).toBe(false);
  });

  it("does not rerun a killed download", async () => {
    let downloads = 0;
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return ok("", { status: null, signal: "SIGKILL" });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(downloads).toBe(1);
    expect(outcome.status).toBe("needs-person");
  });

  it("waits and retries once on a retry-shortly lock refusal", async () => {
    let downloads = 0;
    const sleeps: number[] = [];
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return downloads === 1 ? ok("Store lock claim is busy, so retry the run\n", { status: 1 }) : ok();
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23", sleep: async (ms) => { sleeps.push(ms); } });
    expect(downloads).toBe(2);
    expect(sleeps).toEqual([10000]);
    expect(outcome.status).toBe("silent");
  });

  it("takes the PR body values from the generated files", async () => {
    const bodies: string[] = [];
    const h = harness((c) => {
      if (commandText(c).startsWith("pr create")) bodies.push(c.args.join(" "));
      if (commandText(c).startsWith("refresh:outputs classify")) return ok("analysis/src/data/limitless-decks.json\n");
      return undefined;
    });
    await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(bodies.join(" ")).toContain("Tournament rows: 2");
    expect(bodies.join(" ")).toContain("version-1");
  });

  it("spawns Yarn through process.execPath and never yarn.cmd", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../scripts/refresh-job.ts"), "utf8");
    expect(source).toContain("process.execPath");
    expect(source).toContain("process.env.npm_execpath");
    expect(source).not.toContain('spawnSync("yarn.cmd"');
  });
});
