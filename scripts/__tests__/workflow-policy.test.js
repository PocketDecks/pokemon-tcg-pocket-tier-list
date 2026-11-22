const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "../..");

const expressionValue = (term, context) => {
  if (/^'[^']*'$/.test(term)) return term.slice(1, -1);
  assert.ok(Object.hasOwn(context, term), `Unknown expression term: ${term}`);
  return context[term];
};

const evaluateChain = (expression, context) => {
  const body = String(expression).replace(/^\$\{\{\s*|\s*\}\}$/g, "").trim();
  for (const clause of body.split(/\s*\|\|\s*/)) {
    const [condition, result] = clause.split(/\s*&&\s*/);
    if (result === undefined) return expressionValue(condition, context);
    const match = condition.match(/^([\w.]+)\s*==\s*('[^']*'|[\w.]+)$/);
    assert.ok(match, `Unsupported condition: ${condition}`);
    if (
      expressionValue(match[1], context) === expressionValue(match[2], context)
    ) {
      return expressionValue(result, context);
    }
  }
  assert.fail(`No value for ${body}`);
};

const loadYaml = (...segments) =>
  yaml.load(fs.readFileSync(path.join(root, ...segments), "utf8"));

const runWorkflowCommand = ({ command, commandShims = {}, env = {} }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-policy-"));
  const bin = path.join(directory, "bin");
  const ghLog = path.join(directory, "gh.log");
  const workflowOutput = path.join(directory, "workflow-output");
  fs.mkdirSync(bin);
  try {
    for (const [name, script] of Object.entries(commandShims)) {
      fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${script}\n`, {
        mode: 0o755,
      });
    }
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", command], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        ...env,
        GH_LOG: ghLog,
        GITHUB_OUTPUT: workflowOutput,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      },
    });
    return {
      ...result,
      ghLog: fs.existsSync(ghLog) ? fs.readFileSync(ghLog, "utf8") : "",
      workflowOutput: fs.existsSync(workflowOutput)
        ? fs.readFileSync(workflowOutput, "utf8")
        : "",
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

const freshnessGitShim = `ref="$GITHUB_OUTPUT.ref"
if [ ! -f "$ref" ]; then
  printf '%s\\n' "$INITIAL_MAIN_SHA" > "$ref"
fi
case "$*" in
  "fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main")
    if [ "$FETCH_FAIL" = "true" ]; then exit 17; fi
    printf '%s\\n' "$FETCHED_MAIN_SHA" > "$ref"
    ;;
  "rev-parse refs/remotes/origin/main")
    cat "$ref"
    ;;
  *)
    printf 'unexpected git command: %s\\n' "$*" >&2
    exit 97
    ;;
esac`;

const runFreshnessCheck = (
  step,
  { githubSha, initialMainSha, fetchedMainSha, fetchFail = false }
) =>
  runWorkflowCommand({
    command: step.run,
    commandShims: { git: freshnessGitShim },
    env: {
      GITHUB_SHA: githubSha,
      INITIAL_MAIN_SHA: initialMainSha,
      FETCHED_MAIN_SHA: fetchedMainSha,
      FETCH_FAIL: fetchFail ? "true" : "false",
    },
  });

const runPairingsPullRequestStep = (step, openPr, outcomes = {}) =>
  runWorkflowCommand({
    command: step.run,
    commandShims: {
      git: `if [ "$1" = status ]; then printf '%s\\n' ' M analysis/src/data/limitless-decks.json'; fi`,
      gh: `printf '%s\\n' "$*" >> "$GH_LOG"\nif [ "$1" = pr ] && [ "$2" = list ]; then printf '%s\\n' "$MOCK_PRS"; fi`,
    },
    env: {
      BRANCH: "automated/pairings-2026-11-22",
      TYPECHECK: outcomes.typecheck ?? "success",
      TESTS: outcomes.tests ?? "success",
      MOCK_PRS: JSON.stringify(openPr ? [openPr] : []),
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "PocketDecks/pokemon-tcg-pocket-tier-list",
      GITHUB_RUN_ID: "1",
    },
  });

test("shared setup action reads .nvmrc and caches the install lockfiles", () => {
  const actionPath = path.join(root, ".github", "actions", "setup", "action.yml");
  assert.ok(fs.existsSync(actionPath));
  const action = loadYaml(".github", "actions", "setup", "action.yml");
  assert.strictEqual(action.runs.using, "composite");
  const nodeSetup = action.runs.steps.find((step) =>
    step.uses?.startsWith("actions/setup-node@")
  );
  assert.ok(nodeSetup);
  assert.strictEqual(nodeSetup.with["node-version-file"], ".nvmrc");
  assert.strictEqual(nodeSetup.with.cache, "yarn");
  const cachePath = nodeSetup.with["cache-dependency-path"];
  for (const [workspace, lockfile] of [
    ["root", "yarn.lock"],
    ["analysis", "analysis/yarn.lock"],
    ["kofi", "workers/kofi/yarn.lock"],
  ]) {
    assert.strictEqual(
      evaluateChain(cachePath, { "inputs.workspace": workspace }),
      lockfile,
      `${workspace} cache lockfile`
    );
  }
  const install = action.runs.steps.find(
    (step) => step.name === "Install dependencies"
  );
  assert.ok(install);
  assert.strictEqual(install.env.WORKSPACE, "${{ inputs.workspace }}");
  const runInstall = (workspace) =>
    runWorkflowCommand({
      command: install.run,
      commandShims: {
        yarn: 'printf "%s\\n" "$*" >> "$GH_LOG"',
      },
      env: { WORKSPACE: workspace },
    });
  for (const [workspace, command] of [
    ["root", "install --frozen-lockfile"],
    ["analysis", "--cwd analysis install --frozen-lockfile"],
    ["kofi", "--cwd workers/kofi install --frozen-lockfile"],
  ]) {
    const result = runInstall(workspace);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.ghLog.trim(), command);
  }
  const invalid = runInstall("other");
  assert.notStrictEqual(invalid.status, 0);
  assert.strictEqual(invalid.ghLog, "");
});

test("every job uses shared setup after checkout", () => {
  const expected = {
    "ci.yml": {
      frontend: ["root"],
      analysis: ["analysis"],
      kofi: ["kofi"],
    },
    "preview.yml": { preview: ["root", "analysis"] },
    "deploy.yml": { deploy: ["root", "analysis"] },
    "sync-pairings.yml": { sync: ["analysis"] },
  };
  for (const [file, jobs] of Object.entries(expected)) {
    const workflow = loadYaml(".github", "workflows", file);
    for (const [jobId, workspaces] of Object.entries(jobs)) {
      const steps = workflow.jobs[jobId]?.steps ?? [];
      const checkoutIndex = steps.findIndex((step) =>
        step.uses?.startsWith("actions/checkout@")
      );
      const setupIndexes = steps
        .map((step, index) =>
          step.uses === "./.github/actions/setup" ? index : -1
        )
        .filter((index) => index >= 0);
      assert.ok(checkoutIndex >= 0, `${file}/${jobId} checkout`);
      assert.deepStrictEqual(
        setupIndexes.map((index) => steps[index].with?.workspace),
        workspaces,
        `${file}/${jobId} setup`
      );
      assert.ok(
        setupIndexes.every((index) => index > checkoutIndex),
        `${file}/${jobId} setup after checkout`
      );
      if (file === "deploy.yml") {
        for (const index of setupIndexes) {
          assert.strictEqual(
            steps[index].if,
            "steps.early_latest.outputs.is_latest == 'true'"
          );
        }
      }
    }
  }
});

test("workflow names and job IDs match the layout", () => {
  const workflows = [
    { file: "ci.yml", name: "CI", jobs: ["analysis", "frontend", "kofi"] },
    { file: "preview.yml", name: "Preview", jobs: ["preview"] },
    { file: "deploy.yml", name: "Deploy", jobs: ["deploy"] },
    { file: "sync-pairings.yml", name: "Sync pairings", jobs: ["sync"] },
  ];
  for (const { file, name, jobs } of workflows) {
    const workflow = loadYaml(".github", "workflows", file);
    assert.strictEqual(workflow.name, name, `${file} name`);
    assert.deepStrictEqual(Object.keys(workflow.jobs).sort(), jobs);
  }
});

test("CI runs the analysis checks with read-only permissions", () => {
  const workflow = loadYaml(".github", "workflows", "ci.yml");
  const analysis = workflow.jobs.analysis;
  assert.ok(analysis, "ci.yml must contain the analysis job");
  assert.deepStrictEqual(workflow.permissions, { contents: "read" });
  const setup = analysis.steps.find(
    (step) => step.uses === "./.github/actions/setup"
  );
  assert.strictEqual(setup?.with?.workspace, "analysis");
  const runBodies = analysis.steps.map((step) => String(step.run ?? "")).join("\n");
  assert.match(runBodies, /yarn typecheck/);
  assert.match(runBodies, /yarn test/);
});

test("CI cancels only pull request runs", () => {
  assert.deepStrictEqual(loadYaml(".github", "workflows", "ci.yml").concurrency, {
    group: "ci-${{ github.ref }}",
    "cancel-in-progress": "${{ github.event_name == 'pull_request' }}",
  });
});

test("Preview cancels older runs for the same pull request", () => {
  assert.deepStrictEqual(
    loadYaml(".github", "workflows", "preview.yml").concurrency,
    {
      group: "preview-${{ github.event.pull_request.number }}",
      "cancel-in-progress": true,
    }
  );
});

test("Deploy keeps the live run queue", () => {
  assert.deepStrictEqual(
    loadYaml(".github", "workflows", "deploy.yml").concurrency,
    {
      group: "deploy-live",
      "cancel-in-progress": false,
      queue: "max",
    }
  );
});

test("live deploys check freshness after checkout and gate later steps", () => {
  const steps = loadYaml(".github", "workflows", "deploy.yml")
    .jobs.deploy.steps;
  const checkoutIndex = steps.findIndex((step) =>
    step.uses?.startsWith("actions/checkout@")
  );
  const earlyIndex = steps.findIndex((step) => step.id === "early_latest");
  const latestIndex = steps.findIndex((step) => step.id === "latest");
  const deployIndex = steps.findIndex((step) =>
    step.uses?.startsWith("FirebaseExtended/action-hosting-deploy@")
  );
  assert.strictEqual(earlyIndex, checkoutIndex + 1);
  assert.ok(earlyIndex < latestIndex);
  const earlyIf = "steps.early_latest.outputs.is_latest == 'true'";
  const deployIf =
    "${{ steps.early_latest.outputs.is_latest == 'true' && steps.latest.outputs.is_latest == 'true' }}";
  for (const step of steps.slice(earlyIndex + 1, deployIndex + 1)) {
    assert.strictEqual(step.if, step === steps[deployIndex] ? deployIf : earlyIf);
  }

  const runEarlyCheck = (githubSha, initialMainSha, fetchedMainSha) =>
    runFreshnessCheck(steps[earlyIndex], {
      githubSha,
      initialMainSha,
      fetchedMainSha,
    });
  const stale = runEarlyCheck("sha-a", "sha-a", "sha-b");
  assert.strictEqual(stale.status, 0, stale.stderr);
  assert.strictEqual(stale.workflowOutput.trim(), "is_latest=false");
  const current = runEarlyCheck("sha-b", "sha-a", "sha-b");
  assert.strictEqual(current.status, 0, current.stderr);
  assert.strictEqual(current.workflowOutput.trim(), "is_latest=true");
  assert.ok(deployIndex > latestIndex);
});

test("live deploys queue pending runs and skip commits that are no longer latest", () => {
  const steps = loadYaml(".github", "workflows", "deploy.yml")
    .jobs.deploy.steps;
  const latestIndex = steps.findIndex((step) => step.id === "latest");
  const deployIndex = steps.findIndex((step) =>
    step.uses?.startsWith("FirebaseExtended/action-hosting-deploy@")
  );
  assert.ok(latestIndex >= 0);
  assert.strictEqual(deployIndex, latestIndex + 1);
  assert.ok(steps[latestIndex].run.includes("GITHUB_SHA"));
  assert.ok(steps[latestIndex].run.includes("refs/remotes/origin/main"));
  const runLatestCheck = (githubSha, initialMainSha, fetchedMainSha) =>
    runFreshnessCheck(steps[latestIndex], {
      githubSha,
      initialMainSha,
      fetchedMainSha,
    });
  const current = runLatestCheck("sha-b", "sha-a", "sha-b");
  assert.strictEqual(current.status, 0, current.stderr);
  assert.strictEqual(current.workflowOutput.trim(), "is_latest=true");
  const stale = runLatestCheck("sha-a", "sha-a", "sha-b");
  assert.strictEqual(stale.status, 0, stale.stderr);
  assert.strictEqual(stale.workflowOutput.trim(), "is_latest=false");
});

test("freshness checks fail closed when git fetch fails", () => {
  const steps = loadYaml(".github", "workflows", "deploy.yml")
    .jobs.deploy.steps;
  for (const id of ["early_latest", "latest"]) {
    const step = steps.find((entry) => entry.id === id);
    const result = runFreshnessCheck(step, {
      githubSha: "sha-a",
      initialMainSha: "sha-a",
      fetchedMainSha: "sha-b",
      fetchFail: true,
    });
    assert.doesNotMatch(result.workflowOutput, /is_latest=true/);
    assert.notStrictEqual(result.status, 0, `${id} must fail when git fetch fails`);
  }
});

const workflowDirectory = path.join(root, ".github", "workflows");

test("third-party actions use lowercase commit SHAs", () => {
  const offenders = fs
    .readdirSync(workflowDirectory)
    .filter((name) => name.endsWith(".yml"))
    .flatMap((name) => {
      const workflow = loadYaml(".github", "workflows", name);
      return Object.values(workflow.jobs ?? {}).flatMap((job) =>
        (job.steps ?? [])
          .filter((step) => {
            const uses = step.uses;
            if (typeof uses !== "string" || uses.startsWith("./")) return false;
            return uses.split("/")[0] !== "actions" && !/@[0-9a-f]{40}$/.test(uses);
          })
          .map((step) => step.uses)
      );
    });
  const actionOffenders = loadYaml(
    ".github",
    "actions",
    "setup",
    "action.yml"
  ).runs.steps
    .filter((step) => {
      const uses = step.uses;
      if (typeof uses !== "string" || uses.startsWith("./")) return false;
      return uses.split("/")[0] !== "actions" && !/@[0-9a-f]{40}$/.test(uses);
    })
    .map((step) => step.uses);
  assert.deepStrictEqual(
    [...offenders, ...actionOffenders],
    [],
    `Unpinned references: ${[...offenders, ...actionOffenders].join(", ")}`
  );
});

test("Firebase deploy actions use full commit SHAs and match across workflows", () => {
  const actionUse = (file, prefix) => {
    const workflow = loadYaml(".github", "workflows", file);
    return Object.values(workflow.jobs ?? {})
      .flatMap((job) => job.steps ?? [])
      .find((step) => step.uses?.startsWith(prefix))?.uses;
  };
  const mergeDeploy = actionUse(
    "deploy.yml",
    "FirebaseExtended/action-hosting-deploy@"
  );
  const pullRequestDeploy = actionUse(
    "preview.yml",
    "FirebaseExtended/action-hosting-deploy@"
  );
  assert.match(
    mergeDeploy ?? "",
    /^FirebaseExtended\/action-hosting-deploy@[0-9a-f]{40}$/
  );
  assert.strictEqual(pullRequestDeploy, mergeDeploy);
});

test("Dependabot has one weekly grouped GitHub Actions update", () => {
  const dependabot = loadYaml(".github", "dependabot.yml");
  const entries = dependabot.updates.filter(
    (entry) => entry["package-ecosystem"] === "github-actions"
  );
  assert.strictEqual(entries.length, 1);
  const [entry] = entries;
  assert.deepStrictEqual(entry.directories, ["/", "/.github/actions/setup"]);
  assert.strictEqual(entry["commit-message"]?.prefix, "build(deps)");
  assert.strictEqual(entry.schedule?.interval, "weekly");
  assert.strictEqual(entry["open-pull-requests-limit"], 1);
  const group = entry.groups?.["github-actions"];
  assert.ok(group);
  const includes = (dependency) => {
    const matches = (pattern) => pattern === "*" || pattern === dependency;
    return (
      group.patterns.some(matches) &&
      !(group["exclude-patterns"] ?? []).some(matches)
    );
  };
  assert.ok(includes("actions/checkout"));
  assert.ok(includes("google-github-actions/auth"));
});

test("root and analysis npm updates target main and allow card data", () => {
  const dependabot = loadYaml(".github", "dependabot.yml");
  const entry = dependabot.updates.find(
    (update) =>
      update["package-ecosystem"] === "npm" &&
      update.directories?.includes("/") &&
      update.directories?.includes("/analysis")
  );
  assert.ok(entry);
  assert.deepStrictEqual(entry.directories, ["/", "/analysis"]);
  assert.strictEqual(entry["target-branch"], "main");
  assert.deepStrictEqual(entry.allow, [
    { "dependency-name": "pokemon-tcg-pocket-cards" },
  ]);
});

test("non-pushing workflows disable checkout credentials", () => {
  const offenders = fs
    .readdirSync(workflowDirectory)
    .filter((name) => name.endsWith(".yml") && name !== "sync-pairings.yml")
    .flatMap((name) => {
      const workflow = loadYaml(".github", "workflows", name);
      return Object.values(workflow.jobs ?? {}).flatMap((job) =>
        (job.steps ?? [])
          .filter(
            (step) =>
              typeof step.uses === "string" &&
              step.uses.split("@")[0] === "actions/checkout" &&
              step.with?.["persist-credentials"] !== false
          )
          .map((step) => `${name}: ${step.uses}`)
      );
    });
  assert.deepStrictEqual(offenders, [], `Credentials persist in: ${offenders.join(", ")}`);
});

test("only same-repository human pull requests can deploy a preview", () => {
  const workflow = loadYaml(".github", "workflows", "preview.yml");
  const job = Object.values(workflow.jobs)[0];
  const deploy = job.steps.find((step) =>
    step.uses?.startsWith("FirebaseExtended/action-hosting-deploy@")
  );
  const evaluate = (condition, context) => {
    const expression = condition.replace(/^\$\{\{\s*|\s*\}\}$/g, "").trim();
    return expression.split(/\s*&&\s*/).every((term) => {
      const match = term.match(/^([a-zA-Z0-9_.]+)\s*(==|!=)\s*([a-zA-Z0-9_.]+|'[^']*')$/);
      assert.ok(match, `Unsupported condition term: ${term}`);
      const right = match[3].startsWith("'")
        ? match[3].slice(1, -1)
        : context[match[3]];
      return match[2] === "=="
        ? context[match[1]] === right
        : context[match[1]] !== right;
    });
  };
  const repository = "PocketDecks/pokemon-tcg-pocket-tier-list";
  const events = [
    { repo: repository, actor: "octocat", job: true, deploy: true },
    { repo: "octocat/pokemon-tcg-pocket-tier-list", actor: "octocat", job: false, deploy: false },
    { repo: repository, actor: "dependabot[bot]", job: true, deploy: false },
  ];
  for (const event of events) {
    const context = {
      "github.event.pull_request.head.repo.full_name": event.repo,
      "github.repository": repository,
      "github.actor": event.actor,
    };
    const jobAllowed = evaluate(job.if, context);
    assert.strictEqual(jobAllowed, event.job, `${event.actor} job condition`);
    assert.strictEqual(
      jobAllowed && evaluate(deploy.if, context),
      event.deploy,
      `${event.actor} deploy condition`
    );
  }
});

test("pairings syncs share one non-cancelling concurrency group", () => {
  assert.deepStrictEqual(
    loadYaml(".github", "workflows", "sync-pairings.yml").concurrency,
    {
      group: "sync-pairings",
      "cancel-in-progress": false,
      queue: "max",
    }
  );
});

test("pairings workflow tests its changes and preserves failed checks", () => {
  const steps = loadYaml(".github", "workflows", "sync-pairings.yml").jobs.sync.steps;
  const runBodies = steps.map((step) => String(step.run ?? "")).join("\n");
  assert.doesNotMatch(runBodies, /golden:generate|generate-deck-name-golden\.ts/);
  const typecheckIndex = steps.findIndex((step) => step.id === "typecheck");
  const testsIndex = steps.findIndex((step) => step.id === "tests");
  const pullRequestIndex = steps.findIndex((step) => step.run?.includes("gh pr create"));
  assert.ok(typecheckIndex >= 0 && typecheckIndex < pullRequestIndex);
  assert.ok(testsIndex >= 0 && testsIndex < pullRequestIndex);
  assert.strictEqual(steps[typecheckIndex].workingDirectory ?? steps[typecheckIndex]["working-directory"], "analysis");
  assert.strictEqual(steps[testsIndex].workingDirectory ?? steps[testsIndex]["working-directory"], "analysis");
  assert.strictEqual(steps[typecheckIndex]["continue-on-error"], true);
  assert.strictEqual(steps[testsIndex]["continue-on-error"], true);
  assert.ok(steps[typecheckIndex].run.includes("yarn typecheck"));
  assert.ok(steps[testsIndex].run.includes("yarn test"));
  const pullRequest = steps[pullRequestIndex];
  assert.ok(pullRequest.run.includes("--draft"));
  const stagedPaths = pullRequest.run
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("git add "));
  assert.deepStrictEqual(stagedPaths, ["git add analysis/src/data/limitless-decks.json"]);
  assert.strictEqual(pullRequest.env.TYPECHECK, "${{ steps.typecheck.outcome }}");
  assert.strictEqual(pullRequest.env.TESTS, "${{ steps.tests.outcome }}");
  assert.ok(pullRequest.run.includes('gh pr ready "$PR_NUMBER"'));
  assert.ok(pullRequest.run.includes("any(.labels[]; .name == \"automated\")"));
  assert.ok(pullRequest.run.includes("GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"));
  assert.ok(pullRequest.run.includes("Analysis $FAILED_CHECKS failed."));
  assert.ok(pullRequest.run.includes("Analysis typecheck and tests ran in this job before the PR opened."));
  const titles = [...pullRequest.run.matchAll(/--title "([^"]+)"/g)].map(
    (match) => match[1]
  );
  assert.strictEqual(titles.length, 2);
  assert.ok(titles.every((title) => title.startsWith("chore(data): Sync deck pairings (")));
  assert.ok(titles.every((title) => title.includes("$(date -u +%F)")));
  const failureIndex = steps.findIndex(
    (step) =>
      step.if?.includes("steps.typecheck.outcome") &&
      step.if?.includes("steps.tests.outcome")
  );
  assert.ok(failureIndex > pullRequestIndex);
  const failure = runWorkflowCommand({
    command: steps[failureIndex].run,
    env: { TYPECHECK: "failure", TESTS: "failure" },
  });
  assert.strictEqual(failure.status, 1, failure.stderr);
});

test("pairings reruns ready an automated draft and preserve a human draft", () => {
  const step = loadYaml(".github", "workflows", "sync-pairings.yml").jobs.sync.steps.find(
    (entry) => entry.run?.includes("gh pr create")
  );
  const automated = runPairingsPullRequestStep(step, {
    number: 42,
    isDraft: true,
    labels: [{ name: "automated" }],
  });
  assert.strictEqual(automated.status, 0, automated.stderr);
  assert.match(automated.ghLog, /pr ready 42/);
  assert.doesNotMatch(automated.ghLog, /pr create/);

  const humanDraft = runPairingsPullRequestStep(step, {
    number: 43,
    isDraft: true,
    labels: [{ name: "review-needed" }],
  });
  assert.strictEqual(humanDraft.status, 0, humanDraft.stderr);
  assert.doesNotMatch(humanDraft.ghLog, /pr ready/);
  assert.doesNotMatch(humanDraft.ghLog, /pr create/);
});

test("pairings failures draft new PRs and undo ready automated PRs", () => {
  const step = loadYaml(".github", "workflows", "sync-pairings.yml").jobs.sync.steps.find(
    (entry) => entry.run?.includes("gh pr create")
  );
  const failedNewPr = runPairingsPullRequestStep(step, null, {
    typecheck: "failure",
    tests: "success",
  });
  assert.strictEqual(failedNewPr.status, 0, failedNewPr.stderr);
  assert.match(failedNewPr.ghLog, /pr create --draft/);
  assert.match(failedNewPr.ghLog, /Analysis typecheck failed\./);

  const failedReadyPr = runPairingsPullRequestStep(step, {
    number: 44,
    isDraft: false,
    labels: [{ name: "automated" }],
  }, {
    typecheck: "success",
    tests: "failure",
  });
  assert.strictEqual(failedReadyPr.status, 0, failedReadyPr.stderr);
  assert.match(failedReadyPr.ghLog, /pr ready --undo 44/);
  assert.doesNotMatch(failedReadyPr.ghLog, /pr create/);
});
