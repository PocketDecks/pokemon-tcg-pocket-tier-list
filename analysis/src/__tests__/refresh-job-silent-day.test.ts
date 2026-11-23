import { describe, expect, it } from "vitest";

import { CANONICAL_REPO, REFRESH_SUBJECT, runJob } from "../../scripts/refresh-job";
import type { CommandResult, CommandSpec } from "../../scripts/refresh-job";
import { commandText, harness, ok } from "./refresh-job-fixture";

describe("refresh job silent-day decisions with a fake runner", () => {
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

  it("names a commit shared by the local and remote logs once", async () => {
    const shared = `ccc3333\x1fAutomation\x1fbot@example.invalid\x1f${REFRESH_SUBJECT}\n`;
    const h = harness((c) => {
      const text = commandText(c);
      if (text.startsWith("log --format")) {
        if (text.includes("refs/remotes/pocket/") && !text.includes("main..refs/remotes/")) return ok("");
        return ok(shared);
      }
      return undefined;
    });
    const outcome = await runJob({ root: h.root, runner: h.runner, date: "2026-11-23" });
    expect(outcome.status).toBe("needs-person");
    expect(outcome.step).toBe("step 9");
    const report = outcome.firstErrorLines.join(" ");
    expect(report).toContain("no open pull request");
    expect(report.split("ccc3333").length - 1).toBe(1);
  });
});
