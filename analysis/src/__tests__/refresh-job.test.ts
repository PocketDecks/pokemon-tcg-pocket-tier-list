import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";

import {
  CANONICAL_REPO,
  MANUAL_REPAIR_MARKERS,
  REFRESH_SUBJECT,
  buildPrBody,
  commandSpecFor,
  createRecordingRunner,
  defaultRunner,
  findCanonicalRemote,
  humanCommits,
  isSilentDay,
  needsPersonForRefusal,
  readPublishingValues,
  runJob,
} from "../../scripts/refresh-job";
import type { CommandResult, CommandSpec, Runner } from "../../scripts/refresh-job";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const realText = (relative: string): string => fs.readFileSync(path.join(repoRoot, relative), "utf8");
const realJson = <T>(relative: string): T => JSON.parse(realText(relative)) as T;

const PARITY = "union: 3 deck names, 3 OG images, 0 missing, 0 orphan";
const WINDOWS = "10d: 1, 20d: 1, 30d: 1, all: 1";
const VERSION = realJson<{ premium: string }>("public/data/data-version.json").premium;

const ok = (stdout = "", overrides: Partial<CommandResult> = {}): CommandResult => ({
  status: 0,
  stdout,
  stderr: "",
  ...overrides,
});

const writeFixture = (root: string, relative: string, value: string): void => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
};

const fixtureRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-job-"));
  const listings = realJson<{ sets: Record<string, { decks: unknown[] }> }>("analysis/src/data/limitless-decks.json");
  const [setId] = Object.keys(listings.sets);
  const trimmedListings = {
    ...listings,
    sets: { [setId]: { decks: listings.sets[setId].decks.slice(0, 2) } },
  };
  writeFixture(root, "analysis/src/data/limitless-decks.json", JSON.stringify(trimmedListings));

  const processed = realJson<{ id: string; date: string }[]>("analysis/src/__fixtures__/decks.json")
    .slice(0, 1)
    .map(({ id, date }) => ({ id, date }));
  writeFixture(root, "analysis/data/processed-tournaments.json", JSON.stringify(processed));
  writeFixture(
    root,
    "analysis/data/decks/manifest.json",
    JSON.stringify({
      schema: 1,
      shards: {
        c1: { file: "c1.ndjson", count: processed.length, minDate: processed[0].date, maxDate: processed[0].date },
      },
    })
  );

  for (const file of ["best-decks-10d.json", "best-decks-20d.json", "best-decks.json"]) {
    const decks = realJson<unknown[]>(`public/data/${file}`).slice(0, 1);
    writeFixture(root, `public/data/${file}`, JSON.stringify(decks));
  }
  const premiumDecks = realJson<unknown[]>("public/data/best-decks-20d.json").slice(0, 1);
  for (const file of ["best-decks-30d.json", "best-decks-all.json"]) {
    writeFixture(root, `analysis/out/premium/${file}`, JSON.stringify(premiumDecks));
  }
  writeFixture(root, "public/data/data-version.json", realText("public/data/data-version.json"));
  writeFixture(root, ".nvmrc", realText(".nvmrc"));
  return root;
};

const scratchRoot = (source: string): string => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-scratch-"));
  for (const relative of ["public", "analysis/data", "analysis/out"]) {
    fs.cpSync(path.join(source, relative), path.join(scratch, relative), { recursive: true });
  }
  fs.mkdirSync(path.join(scratch, "analysis"), { recursive: true });
  return scratch;
};

const commandText = (command: CommandSpec): string => command.args.join(" ");

interface Harness {
  root: string;
  scratch: string;
  calls: CommandSpec[];
  runner: Runner;
}

const harness = (overrides: (command: CommandSpec, calls: CommandSpec[]) => CommandResult | undefined): Harness => {
  const root = fixtureRoot();
  const scratch = scratchRoot(root);
  const calls: CommandSpec[] = [];
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
    if (text.startsWith("validate:refresh")) return ok(`${PARITY}\n`);
    if (text.startsWith("refresh:outputs classify")) return ok("\n");
    if (text.startsWith("refresh:outputs stage")) return ok("public/data/best-decks.json\n");
    if (text.startsWith("rev-parse --verify --quiet refs/heads/")) return ok("", { status: 1 });
    if (text.startsWith("pr view")) return ok("", { status: 1 });
    if (text.startsWith("pr create")) return ok("https://github.com/pr/1\n");
    if (text.startsWith("rev-parse HEAD")) return ok("headsha\n");
    return ok();
  };
  return { root, scratch, calls, runner };
};

const publishingClassify = (command: CommandSpec): CommandResult | undefined =>
  commandText(command).startsWith("refresh:outputs classify")
    ? ok("analysis/src/data/limitless-decks.json\n")
    : undefined;

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
    expect(buildPrBody({ tournaments: 2, decks: 7, windows: WINDOWS, imageParity: PARITY, premiumVersion: "v1" })).toContain("Premium data version `v1`");
  });

  it("classifies store refusals by their wording", () => {
    for (const marker of MANUAL_REPAIR_MARKERS) {
      expect(needsPersonForRefusal(`refused: ${marker}`)).toBe(true);
    }
    expect(needsPersonForRefusal("another run is starting, so retry shortly")).toBe(false);
    expect(needsPersonForRefusal("thrown error")).toBe(false);
  });

  it("spawns Yarn through the executable and arguments from commandSpecFor", () => {
    const previous = process.env.npm_execpath;
    process.env.npm_execpath = "/tools/yarn.js";
    try {
      const expected = commandSpecFor(process.execPath, "/tools/yarn.js", ["refresh:outputs", "begin"], "/work");
      vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "", stderr: "", signal: null } as unknown as ReturnType<typeof spawnSync>);
      defaultRunner({ file: "yarn", args: ["refresh:outputs", "begin"], cwd: "/work" });
      expect(spawnSync).toHaveBeenCalledWith(expected.file, expected.args, expect.objectContaining({ cwd: "/work" }));
    } finally {
      if (previous === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = previous;
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
    const h = harness((c) => (commandText(c).startsWith("log --format") ? ok("aaa\x1fJane Doe\x1fjane@example.com\x1fAdd a feature\n") : undefined));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 2");
  });

  it("edits an existing pull request instead of creating another", async () => {
    const h = harness((c) => {
      if (commandText(c).startsWith("pr view") && c.args.includes("--jq")) return ok("42\n");
      return publishingClassify(c);
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

  it("reads publishing values from trimmed real files at their real paths", () => {
    const root = fixtureRoot();
    const scratch = scratchRoot(root);
    expect(readPublishingValues(scratch, `${PARITY}\n`)).toEqual({
      tournaments: 1,
      decks: 1,
      windows: WINDOWS,
      imageParity: PARITY,
      premiumVersion: VERSION,
    });
    expect(() => readPublishingValues(scratch, "no parity here\n")).toThrow(/no image parity line/);
  });

  it("takes the PR body values from the generated scratch outputs", async () => {
    type ScratchValues = { processed: number; decks: number; window: number; version: string; parity: string };
    const base: ScratchValues = {
      processed: 2,
      decks: 3,
      window: 4,
      version: "scratch-version",
      parity: "union: 7 deck names, 7 OG images, 0 missing, 0 orphan",
    };
    const scratchBody = async (values: ScratchValues): Promise<string> => {
      let body = "";
      const h = harness((c) => {
        if (commandText(c).startsWith("pr create")) body = c.args.join(" ");
        if (commandText(c).startsWith("validate:refresh")) return ok(`${values.parity}\n`);
        return publishingClassify(c);
      });
      writeFixture(h.scratch, "analysis/data/processed-tournaments.json", JSON.stringify(
        Array.from({ length: values.processed }, (_, index) => ({ id: `s${index}`, date: "2026-11-23" }))
      ));
      writeFixture(h.scratch, "analysis/data/decks/manifest.json", JSON.stringify({
        schema: 1,
        shards: { s1: { file: "s1.ndjson", count: values.decks, minDate: "2026-11-23", maxDate: "2026-11-23" } },
      }));
      const decks = Array.from({ length: values.window }, (_, index) => ({ id: index }));
      for (const file of ["best-decks-10d.json", "best-decks-20d.json", "best-decks.json"]) {
        writeFixture(h.scratch, `public/data/${file}`, JSON.stringify(decks));
      }
      for (const file of ["best-decks-30d.json", "best-decks-all.json"]) {
        writeFixture(h.scratch, `analysis/out/premium/${file}`, JSON.stringify(decks));
      }
      writeFixture(h.scratch, "public/data/data-version.json", JSON.stringify({ premium: values.version }));
      await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
      return body;
    };

    const initial = await scratchBody(base);
    expect(initial).toContain("Tournament data: 2 tournaments processed, 3 decks");
    expect(initial).toContain("Ranked archetypes: 10d: 4, 20d: 4, 30d: 4, all: 4");
    expect(initial).toContain(base.parity);
    expect(initial).toContain(base.version);
    expect(initial).not.toContain("Tournament data: 1 tournaments processed, 1 decks");
    expect(initial).not.toContain(`Tournament data: 1 tournaments processed, 1 decks`);

    const changes: [Partial<ScratchValues>, string][] = [
      [{ processed: 5 }, "Tournament data: 5 tournaments processed"],
      [{ decks: 6 }, "6 decks"],
      [{ window: 8 }, "10d: 8, 20d: 8, 30d: 8, all: 8"],
      [{ version: "next-version" }, "next-version"],
      [{ parity: "union: 9 deck names, 9 OG images, 0 missing, 0 orphan" }, "union: 9"],
    ];
    for (const [change, expected] of changes) {
      const body = await scratchBody({ ...base, ...change });
      expect(body).toContain(expected);
    }
  });

  it("fails the run when validate:refresh prints no parity line", async () => {
    const h = harness((c) => {
      if (commandText(c).startsWith("validate:refresh")) return ok("no parity here\n");
      return publishingClassify(c);
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("failed");
    expect(outcome.step).toBe("step 9");
    expect(outcome.firstErrorLines.join(" ")).toContain("no image parity line");
  });

  it("retries a lock claim that asks for a retry and names its claim file", async () => {
    let downloads = 0;
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return downloads === 1
        ? ok("or remove that claim file if the process is gone; another run is starting, so retry shortly\n", { status: 1 })
        : ok();
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23", sleep: async () => {} });
    expect(downloads).toBe(2);
    expect(outcome.status).toBe("silent");
  });

  it("commits only the paths printed by the stage step", async () => {
    const h = harness((c) => (commandText(c).startsWith("refresh:outputs stage") ? ok("public/data/best-decks.json\n") : publishingClassify(c)));
    await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    const commit = h.calls.find((c) => commandText(c).startsWith("commit -m"));
    expect(commit?.args).toEqual(["commit", "-m", REFRESH_SUBJECT, "--", "public/data/best-decks.json"]);
  });

  it("refuses a commit when the index holds unrelated entries", async () => {
    const h = harness((c) => {
      if (commandText(c).startsWith("refresh:outputs stage")) return ok("public/data/best-decks.json\n");
      if (commandText(c).startsWith("diff --cached --name-only")) return ok("README.md\n");
      return publishingClassify(c);
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 11");
    expect(h.calls.some((c) => commandText(c).startsWith("commit -m"))).toBe(false);
  });

  it("surfaces a fetch failure that is not a missing dated branch", async () => {
    const h = harness((c) => (commandText(c).startsWith("fetch pocket automated/") ? ok("", { status: 1, stderr: "fatal: unable to access remote\n" }) : undefined));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("failed");
    expect(outcome.step).toBe("step 2");
    expect(outcome.firstErrorLines.join(" ")).toContain("unable to access remote");
  });

  it("completes a dry run without generated publishing files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-dry-"));
    writeFixture(root, ".nvmrc", realText(".nvmrc"));
    const recorder = createRecordingRunner(root);
    const outcome = await runJob({ root, runner: recorder.runner, publishingValues: recorder.publishingValues });
    expect(outcome.status).toBe("published");
    expect(outcome.step).toBe("step 13");
    expect(recorder.commands().some((c) => commandText(c).startsWith("publish:premium"))).toBe(true);
  });

  it("stops for a person when Node does not match .nvmrc", async () => {
    const h = harness(() => undefined);
    writeFixture(h.root, ".nvmrc", "0.0.0\n");
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("prerequisite");
    expect(outcome.firstErrorLines.join(" ")).toContain("does not match .nvmrc");
  });

  it("stops for a person when .nvmrc cannot be read", async () => {
    const h = harness(() => undefined);
    fs.rmSync(path.join(h.root, ".nvmrc"));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("prerequisite");
    expect(outcome.firstErrorLines.join(" ")).toContain("cannot read");
  });

  it("reaches step 13 on a full publishing day with real file shapes", async () => {
    const h = harness((c) => {
      if (commandText(c).startsWith("pr create")) return ok("https://github.com/pr/2\n");
      if (commandText(c).includes("headRefOid,url")) return ok(`${JSON.stringify({ headRefOid: "headsha", url: "https://github.com/pr/2" })}\n`);
      return publishingClassify(c);
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("published");
    expect(outcome.step).toBe("step 13");
  });

  it("records the whole plan through runJob for --dry-run", async () => {
    const root = fixtureRoot();
    const recorder = createRecordingRunner(root, "headsha");
    const outcome = await runJob({ root, runner: recorder.runner, date: "2026-11-23" });
    const texts = recorder.commands().map(commandText);
    expect(outcome.status).toBe("published");
    expect(texts).toContain("remote -v");
    expect(texts).toContain("refresh:outputs begin");
    expect(texts).toContain("validate:refresh");
    expect(texts).toContain("publish:premium --dry-run");
    expect(texts).toContain("refresh:outputs stage");
    expect(texts.some((text) => text.startsWith("pr create"))).toBe(true);
    expect(recorder.commands().every((command) => command.file !== "yarn.cmd")).toBe(true);
  });

  it("spawns Yarn through the validated command spec", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../scripts/refresh-job.ts"), "utf8");
    expect(source).toContain("commandSpecFor(process.execPath");
    expect(source).not.toContain('spawnSync("yarn.cmd"');
    expect(commandSpecFor(process.execPath, "/usr/local/bin/yarn.js", ["test"])).toEqual({
      file: process.execPath,
      args: ["/usr/local/bin/yarn.js", "--silent", "test"],
      cwd: undefined,
    });
  });

  it("refuses a non-yarn exec path before spawning", () => {
    const previous = process.env.npm_execpath;
    process.env.npm_execpath = "/usr/local/bin/npm-cli.js";
    try {
      expect(() => defaultRunner({ file: "yarn", args: ["test"] })).toThrow(/npm_execpath/);
    } finally {
      if (previous === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = previous;
    }
  });
});
