import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import util from "node:util";
import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";

import {
  CANONICAL_REPO,
  REFRESH_SUBJECT,
  buildPrBody,
  classifyDownloadFailure,
  commandSpecFor,
  createRecordingRunner,
  defaultRunner,
  findCanonicalRemote,
  humanCommits,
  isMissingRemoteBranch,
  isSilentDay,
  needsPersonForRefusal,
  readPublishingValues,
  runJob,
  storeLockRetry,
} from "../../scripts/refresh-job";
import type { CommandResult, CommandSpec, DownloadDecision, Runner } from "../../scripts/refresh-job";
import { duplicateDeckMessage, interruptedProcessedMessage, interruptedWriteMessage } from "../utils/deck-store";
import {
  changingMessage,
  claimHeldMessage,
  claimMismatchMessage,
  cleanupFailureMessage,
  displacedMessage,
  heldMessage,
  mainThreadMessage,
  ownClaimHeldMessage,
} from "../utils/store-lock";

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

const interruptedOutput = `Error: ${interruptedWriteMessage(["analysis/data/decks/c1.ndjson.tmp"])}`;

const manyProgressLines = (): string =>
  Array.from({ length: 20_000 }, (_, index) => `progress batch ${index} written`).join("\n");

class LimitlessError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LimitlessError";
  }
}

const realErrorTier = (): string =>
  Array.from({ length: 4 }, () =>
    util.format(new LimitlessError("fetch failed", { cause: new Error("ECONNRESET") }))
  ).join("\n");

const messageCases = [
  { name: "held lock", message: heldMessage("/data/store", "4242\n"), expected: "needs-person" as DownloadDecision },
  { name: "displaced lock", message: displacedMessage("/data/store", "4242\n", "/data/store.reclaim"), expected: "fail" as DownloadDecision },
  { name: "claim held without retry", message: claimHeldMessage("/data/claim", 4242, false), expected: "needs-person" as DownloadDecision },
  { name: "claim held with retry", message: claimHeldMessage("/data/claim", 4242, true), expected: "retry" as DownloadDecision },
  { name: "claim without pid", message: claimHeldMessage("/data/claim", undefined, false), expected: "retry" as DownloadDecision },
  { name: "own claim held", message: ownClaimHeldMessage("/data/claim", 4242), expected: "fail" as DownloadDecision },
  { name: "claim mismatch", message: claimMismatchMessage("/data/claim"), expected: "fail" as DownloadDecision },
  { name: "worker thread", message: mainThreadMessage, expected: "fail" as DownloadDecision },
  { name: "changing lock", message: changingMessage("/data/store"), expected: "retry" as DownloadDecision },
  { name: "cleanup failure", message: cleanupFailureMessage("write failed", ["remove failed"]), expected: "fail" as DownloadDecision },
  { name: "interrupted write", message: interruptedOutput, expected: "needs-person" as DownloadDecision },
  { name: "duplicate deck", message: duplicateDeckMessage("123", "c1"), expected: "needs-person" as DownloadDecision },
  { name: "interrupted processed", message: interruptedProcessedMessage("processed-tournaments.json", ".tmp"), expected: "needs-person" as DownloadDecision },
];

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

  it.each(messageCases)("classifies the real message for $name as $expected", ({ message, expected }) => {
    expect(classifyDownloadFailure(message)).toBe(expected);
  });

  it("classifies the dual-marker claim as retry and the interrupted write as needs-person", () => {
    const dual = claimHeldMessage("/data/claim", 4242, true);
    expect(classifyDownloadFailure(dual)).toBe("retry");
    expect(classifyDownloadFailure(interruptedOutput)).toBe("needs-person");
  });

  it("matches only the missing remote ref refusal", () => {
    expect(isMissingRemoteBranch("error: couldn't find remote ref refs/heads/x")).toBe(true);
    expect(isMissingRemoteBranch("fatal: Repository not found")).toBe(false);
    expect(isMissingRemoteBranch("fatal: no such ref was fetched")).toBe(false);
    expect(needsPersonForRefusal("remove the lock file")).toBe(true);
    expect(storeLockRetry("so retry the run")).toBe(true);
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
    const h = harness((c) => (commandText(c).startsWith("fetch pocket automated/") ? ok("", { status: 0 }) : undefined));
    await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(h.calls.some((c) => commandText(c) === "checkout automated/pipeline-update-2026-11-23")).toBe(true);
  });

  it("checks out a local dated branch when the remote ref is absent", async () => {
    const branch = "automated/pipeline-update-2026-11-23";
    const h = harness((c) => {
      const text = commandText(c);
      if (text.startsWith("fetch pocket automated/")) {
        return ok("", { status: 1, stderr: `error: couldn't find remote ref refs/heads/${branch}\n` });
      }
      if (text.startsWith("rev-parse --verify --quiet refs/heads/")) return ok(`${branch}\n`);
      return undefined;
    });
    await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(h.calls.some((c) => commandText(c) === `checkout ${branch}`)).toBe(true);
    expect(h.calls.some((c) => commandText(c).startsWith("checkout -b"))).toBe(false);
  });

  it("stops for a person on a human commit", async () => {
    const h = harness((c) => (commandText(c).startsWith("log --format") ? ok("aaa\x1fJane Doe\x1fjane@example.com\x1fAdd a feature\n") : undefined));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 2");
  });

  it("edits an existing pull request instead of creating another", async () => {
    const h = harness((c) => {
      if (commandText(c).startsWith("pr view") && c.args.includes("number,state")) return ok('{"number":42,"state":"OPEN"}\n');
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

  it("reports ENOBUFS when a killed download has a spawn error", async () => {
    let downloads = 0;
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return ok("", { status: null, signal: "SIGTERM", error: "spawnSync yarn ENOBUFS" });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(downloads).toBe(1);
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 6");
    expect(outcome.firstErrorLines.join(" ")).toContain("ENOBUFS");
  });

  it("waits and retries once on a retry-shortly lock refusal", async () => {
    let downloads = 0;
    const sleeps: number[] = [];
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return downloads === 1 ? ok(`${changingMessage("/data/store")}\n`, { status: 1 }) : ok();
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23", sleep: async (ms) => { sleeps.push(ms); } });
    expect(downloads).toBe(2);
    expect(sleeps).toEqual([10000]);
    expect(outcome.status).toBe("silent");
  });

  it("backs up the raw store and stops for a person on an interrupted write", async () => {
    let downloads = 0;
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return ok(`${interruptedOutput}\n`, { status: 1 });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(downloads).toBe(1);
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 6");
    expect(fs.existsSync(path.join(h.root, "analysis", "data-backup", "2026-11-23"))).toBe(true);
  });

  it("stops with a backup when the thrown-error rerun refuses with a duplicate deck", async () => {
    let downloads = 0;
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return downloads === 1
        ? ok("thrown write error\n", { status: 1 })
        : ok(`${duplicateDeckMessage("123", "c1")}\n`, { status: 1 });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(downloads).toBe(2);
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 6");
    expect(fs.existsSync(path.join(h.root, "analysis", "data-backup", "2026-11-23"))).toBe(true);
  });

  it("stops with a backup when a lock retry then needs a person", async () => {
    let downloads = 0;
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return downloads === 1
        ? ok(`${claimHeldMessage("/data/claim", 4242, true)}\n`, { status: 1 })
        : ok(`${heldMessage("/data/store", "4242\n")}\n`, { status: 1 });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23", sleep: async () => {} });
    expect(downloads).toBe(2);
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 6");
    expect(fs.existsSync(path.join(h.root, "analysis", "data-backup", "2026-11-23"))).toBe(true);
  });

  it("stops for a discard when the thrown-error rerun is killed", async () => {
    let downloads = 0;
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return downloads === 1
        ? ok("thrown write error\n", { status: 1 })
        : ok("", { status: null, signal: "SIGKILL" });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(downloads).toBe(2);
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 6");
    expect(outcome.firstErrorLines.join(" ")).toContain("yarn refresh:outputs discard");
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
        ? ok(`${claimHeldMessage("/data/claim", 4242, true)}\n`, { status: 1 })
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

  it("refuses at step 1 when the index already holds entries", async () => {
    const h = harness((c) => (commandText(c).startsWith("diff --cached --name-only") ? ok("README.md\n") : undefined));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 1");
    expect(outcome.firstErrorLines.join(" ")).toContain("index already holds entries");
    expect(h.calls.some((c) => commandText(c).startsWith("refresh:outputs begin"))).toBe(false);
  });

  it("refuses a commit when the index holds unrelated entries at stage time", async () => {
    let staged = false;
    const h = harness((c) => {
      if (commandText(c).startsWith("refresh:outputs stage")) {
        staged = true;
        return ok("public/data/best-decks.json\n");
      }
      if (staged && commandText(c).startsWith("diff --cached --name-only")) return ok("README.md\n");
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

  it("fails a repository-not-found refusal instead of treating it as a missing branch", async () => {
    const h = harness((c) => (commandText(c).startsWith("fetch pocket automated/") ? ok("", { status: 1, stderr: "fatal: Repository not found\n" }) : undefined));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("failed");
    expect(outcome.step).toBe("step 2");
    expect(outcome.firstErrorLines.join(" ")).toContain("Repository not found");
  });

  it("keeps the duplicate-deck message from a long step 6 output", async () => {
    const message = duplicateDeckMessage("123", "c1");
    let downloads = 0;
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return downloads === 1
        ? ok("thrown write error\n", { status: 1 })
        : ok(`${manyProgressLines()}\n${message}\n`, { status: 1 });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 6");
    expect(outcome.firstErrorLines.join(" ")).toContain(message);
    expect(JSON.stringify(outcome).length).toBeLessThan(4000);
  });

  it("keeps the refusal ahead of real stack frames in the error report", async () => {
    const message = duplicateDeckMessage("123", "c1");
    let downloads = 0;
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      downloads += 1;
      return downloads === 1
        ? ok("thrown write error\n", { status: 1 })
        : ok(`${realErrorTier()}\n${message}\n`, { status: 1 });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.firstErrorLines[0]).toBe(message);
    expect(outcome.firstErrorLines.some((line) => line.includes("LimitlessError"))).toBe(true);
    expect(JSON.stringify(outcome).length).toBeLessThan(4000);
  });

  it("keeps the discard instruction and refusal ahead of real stack frames", async () => {
    const message = duplicateDeckMessage("123", "c1");
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      return ok(`${realErrorTier()}\n${message}\n`, { status: null, signal: "SIGTERM" });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.firstErrorLines[0]).toBe("yarn refresh:outputs discard");
    expect(outcome.firstErrorLines[1]).toBe(message);
    expect(JSON.stringify(outcome).length).toBeLessThan(4000);
  });

  it("keeps a real lock retry message ahead of eight error-tier lines", async () => {
    const message = claimHeldMessage("/data/claim", undefined, false);
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      return ok(`${realErrorTier()}\n${message}\n`, { status: null, signal: "SIGTERM" });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.firstErrorLines).toContain(message);
    expect(JSON.stringify(outcome).length).toBeLessThan(4000);
  });

  it("keeps the last of seven other error lines", async () => {
    const last = "Error: frame 6 final";
    const frames = Array.from({ length: 7 }, (_, index) => `Error: frame ${index}${index === 6 ? " final" : ""}`);
    const h = harness((c) => (commandText(c).startsWith("sync-pairings")
      ? ok("", { status: 1, stderr: `${frames.join("\n")}\n` })
      : undefined));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("failed");
    expect(outcome.step).toBe("step 3");
    expect(outcome.firstErrorLines).toContain(last);
    expect(JSON.stringify(outcome).length).toBeLessThan(4000);
  });

  it("bounds a long stderr from a simple step", async () => {
    const h = harness((c) => (commandText(c).startsWith("sync-pairings")
      ? ok("", { status: 1, stderr: `${manyProgressLines()}\nfatal: unable to access remote ${"x".repeat(10_000)}\n` })
      : undefined));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("failed");
    expect(outcome.step).toBe("step 3");
    expect(outcome.firstErrorLines.join(" ")).toContain("unable to access remote");
    expect(JSON.stringify(outcome).length).toBeLessThan(4000);
  });

  it("keeps the discard instruction first in a long killed output", async () => {
    const h = harness((c) => {
      if (!commandText(c).startsWith("download")) return undefined;
      return ok(`${manyProgressLines()}\nspawnSync yarn ENOBUFS\n`, {
        status: null,
        signal: "SIGTERM",
        error: "spawnSync yarn ENOBUFS",
      });
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 6");
    expect(outcome.firstErrorLines[0]).toBe("yarn refresh:outputs discard");
    expect(JSON.stringify(outcome).length).toBeLessThan(4000);
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

  it("pins every git command to the C locale", async () => {
    const h = harness(() => undefined);
    await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    const gitCalls = h.calls.filter((c) => c.file === "git");
    expect(gitCalls.length).toBeGreaterThan(0);
    for (const call of gitCalls) expect(call.env).toEqual({ LC_ALL: "C", LANGUAGE: "" });
    expect(h.calls.some((c) => c.file !== "git" && c.env)).toBe(false);
  });

  it("stops for a person when the main update is rejected", async () => {
    const rejection = " ! [rejected] main       -> main  (non-fast-forward)\n";
    const h = harness((c) => (commandText(c).startsWith("fetch --show-forced-updates pocket refs/heads/main:refs/heads/main")
      ? ok("", { status: 1, stderr: rejection })
      : undefined));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 1");
    expect(outcome.firstErrorLines.join(" ")).toContain("main");
    expect(outcome.firstErrorLines.join(" ")).toContain("non-fast-forward");
  });

  it("fails another main fetch refusal", async () => {
    const h = harness((c) => (commandText(c).startsWith("fetch --show-forced-updates pocket refs/heads/main:refs/heads/main")
      ? ok("", { status: 1, stderr: "fatal: unable to access remote\n" })
      : undefined));
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("failed");
    expect(outcome.step).toBe("step 1");
    expect(outcome.firstErrorLines.join(" ")).toContain("unable to access remote");
  });

  it("updates main with one fetch and no forced branch move", async () => {
    const h = harness(() => undefined);
    await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    const texts = h.calls.map(commandText);
    expect(texts).toContain("fetch --show-forced-updates pocket refs/heads/main:refs/heads/main");
    expect(texts.some((text) => text.startsWith("branch -f main"))).toBe(false);
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
    expect(outcome.reviewUrl).toBe("https://github.com/pr/2");
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

  it("targets the canonical repository on every gh call", async () => {
    for (const existing of [true, false]) {
      const h = harness((c) => {
        const text = commandText(c);
        if (text.includes("headRefOid,url")) return ok(`${JSON.stringify({ headRefOid: "headsha", url: "https://github.com/pr/2" })}\n`);
        if (existing && text.startsWith("pr view") && text.includes("number,state")) return ok('{"number":42,"state":"OPEN"}\n');
        return publishingClassify(c);
      });
      const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
      expect(outcome.status).toBe("published");
      const ghCalls = h.calls.filter((c) => c.file === "gh");
      expect(ghCalls.length).toBeGreaterThan(0);
      for (const call of ghCalls) {
        expect(call.args).toContain("--repo");
        expect(call.args[call.args.indexOf("--repo") + 1]).toBe(CANONICAL_REPO);
      }
      expect(ghCalls.map((c) => c.args[1])).toContain(existing ? "edit" : "create");
    }
  });

  const autoCommit = `aaa1111\x1fAutomation\x1fbot@example.invalid\x1f${REFRESH_SUBJECT}\n`;

  it("stops for a person when a silent day hides an unpublished commit", async () => {
    const h = harness((c) => {
      const text = commandText(c);
      if (text.startsWith("log --format")) return ok(autoCommit);
      if (text.startsWith("pr view")) return ok('{"number":42,"state":"OPEN"}\n');
      return undefined;
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 9");
    const report = outcome.firstErrorLines.join(" ");
    expect(report).toContain("unpublished commits on automated/pipeline-update-2026-11-23");
    expect(report).toContain("aaa1111");
    expect(h.calls.some((c) => commandText(c).startsWith("refresh:outputs discard"))).toBe(false);
  });

  it("stops for a person when a pushed silent-day branch has no open pull request", async () => {
    const h = harness((c) => {
      const text = commandText(c);
      if (text.startsWith("log --format")) {
        if (text.includes("main..automated/") || text.includes("main..refs/remotes/pocket/automated/")) return ok(autoCommit);
        return ok("");
      }
      if (text.startsWith("pr view")) return ok("", { status: 1 });
      return undefined;
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 9");
    const report = outcome.firstErrorLines.join(" ");
    expect(report).toContain("no open pull request");
    expect(report).toContain("automated/pipeline-update-2026-11-23");
    expect(report).toContain("aaa1111");
    const check = h.calls.find((c) => c.file === "gh");
    expect(check?.args).toContain("--repo");
    expect(check?.args[check.args.indexOf("--repo") + 1]).toBe(CANONICAL_REPO);
  });

  it("stays silent when a pushed silent-day branch has an open pull request", async () => {
    const h = harness((c) => {
      const text = commandText(c);
      if (text.startsWith("log --format")) {
        if (text.includes("main..automated/") || text.includes("main..refs/remotes/pocket/automated/")) return ok(autoCommit);
        return ok("");
      }
      if (text.startsWith("pr view")) return ok('{"number":42,"state":"OPEN"}\n');
      return undefined;
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("silent");
    expect(h.calls.some((c) => commandText(c).startsWith("refresh:outputs discard"))).toBe(true);
    expect(h.calls.some((c) => c.file === "gh")).toBe(true);
  });

  it("keeps a plain silent day without any publication check", async () => {
    const h = harness(() => undefined);
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("silent");
    expect(h.calls.some((c) => c.file === "gh")).toBe(false);
  });

  const prJson = (number: number, state: string): string => `${JSON.stringify({ number, state })}\n`;

  const silentWithPrState = async (state: string): Promise<Awaited<ReturnType<typeof runJob>>> => {
    const h = harness((c) => {
      const text = commandText(c);
      if (text.startsWith("log --format")) {
        if (text.includes("main..automated/") || text.includes("main..refs/remotes/pocket/automated/")) return ok(autoCommit);
        return ok("");
      }
      if (text.startsWith("pr view")) return ok(prJson(42, state));
      return undefined;
    });
    return runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
  };

  it("treats an OPEN pull request as published on a silent day", async () => {
    const outcome = await silentWithPrState("OPEN");
    expect(outcome.status).toBe("silent");
  });

  it("stops for a person on a silent day when the pull request is CLOSED", async () => {
    const outcome = await silentWithPrState("CLOSED");
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 9");
    expect(outcome.firstErrorLines.join(" ")).toContain("no open pull request");
  });

  it("stops for a person on a silent day when the pull request is MERGED", async () => {
    const outcome = await silentWithPrState("MERGED");
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 9");
    expect(outcome.firstErrorLines.join(" ")).toContain("no open pull request");
  });

  it("stops for a person when a silent-day pull request view returns non-JSON", async () => {
    const h = harness((c) => {
      const text = commandText(c);
      if (text.startsWith("log --format")) {
        if (text.includes("main..automated/") || text.includes("main..refs/remotes/pocket/automated/")) return ok(autoCommit);
        return ok("");
      }
      if (text.startsWith("pr view")) return ok("not json\n");
      return undefined;
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 9");
    expect(outcome.firstErrorLines.join(" ")).toContain("no open pull request");
  });

  const remoteCommit = `bbb2222\x1fAutomation\x1fbot@example.invalid\x1f${REFRESH_SUBJECT}\n`;

  const silentWithRemoteCommit = async (pr?: CommandResult): Promise<Awaited<ReturnType<typeof runJob>>> => {
    const h = harness((c) => {
      const text = commandText(c);
      if (text.startsWith("log --format")) {
        if (text.includes("main..refs/remotes/pocket/automated/")) return ok(remoteCommit);
        return ok("");
      }
      if (text.startsWith("pr view") && pr) return pr;
      return undefined;
    });
    return runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
  };

  it("stops for a person when a remote automation commit has no pull request", async () => {
    const outcome = await silentWithRemoteCommit();
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 9");
    expect(outcome.firstErrorLines.join(" ")).toContain("no open pull request");
    expect(outcome.firstErrorLines.join(" ")).toContain("bbb2222");
  });

  it("stops for a person when a remote automation commit has a MERGED pull request", async () => {
    const outcome = await silentWithRemoteCommit(ok('{"number":194,"state":"MERGED"}\n'));
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 9");
    expect(outcome.firstErrorLines.join(" ")).toContain("no open pull request");
    expect(outcome.firstErrorLines.join(" ")).toContain("bbb2222");
  });

  it("stays silent when a remote automation commit has an OPEN pull request", async () => {
    const outcome = await silentWithRemoteCommit(ok('{"number":191,"state":"OPEN"}\n'));
    expect(outcome.status).toBe("silent");
  });

  const publishWithPrState = async (state: string): Promise<Harness> => {
    const h = harness((c) => {
      const text = commandText(c);
      if (text.includes("headRefOid,url")) return ok(`${JSON.stringify({ headRefOid: "headsha", url: "https://github.com/pr/2" })}\n`);
      if (text.startsWith("pr view") && text.includes("number,state")) return ok(prJson(42, state));
      return publishingClassify(c);
    });
    await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    return h;
  };

  it("edits an OPEN pull request on a publishing day", async () => {
    const h = await publishWithPrState("OPEN");
    expect(h.calls.some((c) => commandText(c).startsWith("pr edit 42"))).toBe(true);
    expect(h.calls.some((c) => commandText(c).startsWith("pr create"))).toBe(false);
  });

  it("creates a pull request when the only one is CLOSED", async () => {
    const h = await publishWithPrState("CLOSED");
    expect(h.calls.some((c) => commandText(c).startsWith("pr create"))).toBe(true);
    expect(h.calls.some((c) => commandText(c).startsWith("pr edit"))).toBe(false);
  });

  it("creates a pull request when the only one is MERGED", async () => {
    const h = await publishWithPrState("MERGED");
    expect(h.calls.some((c) => commandText(c).startsWith("pr create"))).toBe(true);
    expect(h.calls.some((c) => commandText(c).startsWith("pr edit"))).toBe(false);
  });

  it("logs main..branch and stops as needs-person when the remote dated branch is absent", async () => {
    const branch = "automated/pipeline-update-2026-11-23";
    const h = harness((c) => {
      const text = commandText(c);
      if (text.startsWith(`fetch pocket ${branch}`)) return ok("", { status: 1, stderr: `error: couldn't find remote ref refs/heads/${branch}\n` });
      if (text.startsWith("rev-parse --verify --quiet refs/heads/")) return ok(`${branch}\n`);
      if (text.startsWith("log --format")) {
        if (text.includes("refs/remotes/pocket/automated/")) return ok("", { status: 128, stderr: `fatal: bad revision 'refs/remotes/pocket/${branch}'\n` });
        return ok(autoCommit);
      }
      return undefined;
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 9");
    expect(outcome.firstErrorLines.join(" ")).toContain("aaa1111");
    const logs = h.calls.filter((c) => commandText(c).startsWith("log --format"));
    expect(logs.some((c) => commandText(c).includes("refs/remotes/pocket/"))).toBe(false);
    expect(logs.filter((c) => commandText(c).includes(`main..${branch}`)).length).toBeGreaterThanOrEqual(2);
  });

  const datedBranch = "automated/pipeline-update-2026-11-23";

  const badRange = (range: string): CommandResult => ({
    status: 128,
    stdout: "",
    stderr: `fatal: ambiguous argument '${range}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'\n`,
  });

  const expectLogFailure = async (
    decide: (command: CommandSpec) => CommandResult | undefined,
    range: string
  ): Promise<void> => {
    const h = harness(decide);
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("failed");
    expect(outcome.step).toBe("step 9");
    expect(outcome.command).toContain(range);
    expect(outcome.firstErrorLines.join(" ")).toContain("unknown revision or path not in the working tree");
  };

  it("stops as failed when the local silent-day log exits non-zero", async () => {
    const range = `main..${datedBranch}`;
    await expectLogFailure((c) => {
      const text = commandText(c);
      if (text.startsWith("rev-parse --verify --quiet refs/heads/")) return ok("", { status: 1 });
      if (text.startsWith("log --format") && text.includes(range)) return badRange(range);
      return undefined;
    }, range);
  });

  it("stops as failed when the remote silent-day log exits non-zero", async () => {
    const range = `main..refs/remotes/pocket/${datedBranch}`;
    let seen = 0;
    await expectLogFailure((c) => {
      const text = commandText(c);
      if (text.startsWith("log --format") && text.includes(range)) {
        seen += 1;
        return seen === 2 ? badRange(range) : ok("");
      }
      return undefined;
    }, range);
  });

  it("stops as failed when the unpublished log exits non-zero", async () => {
    const range = `refs/remotes/pocket/${datedBranch}..${datedBranch}`;
    await expectLogFailure((c) => {
      const text = commandText(c);
      if (text.startsWith("log --format") && text.includes(range)) return badRange(range);
      if (text.startsWith("log --format") && text.includes(`main..${datedBranch}`)) return ok(autoCommit);
      return undefined;
    }, range);
  });
});
