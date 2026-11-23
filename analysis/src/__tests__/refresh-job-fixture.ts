import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CANONICAL_REPO } from "../../scripts/refresh-job";
import type { CommandResult, CommandSpec, Runner } from "../../scripts/refresh-job";

export const repoRoot = path.resolve(__dirname, "..", "..", "..");
export const realText = (relative: string): string => fs.readFileSync(path.join(repoRoot, relative), "utf8");
export const realJson = <T>(relative: string): T => JSON.parse(realText(relative)) as T;

const PARITY = "union: 3 deck names, 3 OG images, 0 missing, 0 orphan";

export const ok = (stdout = "", overrides: Partial<CommandResult> = {}): CommandResult => ({
  status: 0,
  stdout,
  stderr: "",
  ...overrides,
});

export const writeFixture = (root: string, relative: string, value: string): void => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
};

export const fixtureRoot = (): string => {
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

export const scratchRoot = (source: string): string => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-scratch-"));
  for (const relative of ["public", "analysis/data", "analysis/out"]) {
    fs.cpSync(path.join(source, relative), path.join(scratch, relative), { recursive: true });
  }
  fs.mkdirSync(path.join(scratch, "analysis"), { recursive: true });
  return scratch;
};

export const commandText = (command: CommandSpec): string => command.args.join(" ");

export interface Harness {
  root: string;
  scratch: string;
  calls: CommandSpec[];
  runner: Runner;
}

export const harness = (overrides: (command: CommandSpec, calls: CommandSpec[]) => CommandResult | undefined): Harness => {
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

export const publishingClassify = (command: CommandSpec): CommandResult | undefined =>
  commandText(command).startsWith("refresh:outputs classify")
    ? ok("analysis/src/data/limitless-decks.json\n")
    : undefined;
