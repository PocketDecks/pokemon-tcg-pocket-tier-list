# How-to guide: Reporting and triage

The repository takes three kinds of report through issue forms: an application
bug, a data or pipeline defect, and an improvement or policy change. Each form
asks only for what its kind needs, so a reporter never has to run the analysis
pipeline to file a UI bug.

## Filing a report

Open [the new issue chooser](https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list/issues/new/choose)
and pick the form that matches. A blank issue is available to maintainers only,
so a contributor files through one of the three forms.

- **Application bug** covers the site: a page, the deck finder, sign-in,
  layout. It asks for the page, what happened, what you expected, steps, and
  optionally the browser, frequency and evidence.
- **Data or pipeline defect** covers a published number that disagrees with the
  record behind it. It asks which artefact and row, the current and expected
  values, and optionally the population, window, data provenance, command and
  runtime.
- **Improvement or policy change** covers new behaviour or a change to a rule.
  It asks for the problem, the outcome you want, who it affects, and optionally
  alternatives, constraints and a measurable success criterion.

Each form applies its own labels on submission: `bug` for the first two,
`enhancement` for the third, plus `area: data` on the data form and
`status: needs-triage` on all three. No form sets an assignee, a project or an
issue type, and issue types are organisation-level, so the check cannot verify
one offline.

Write `unknown` for anything you do not know. A maintainer can then ask for the
missing value instead of working from a guess.

Never paste API keys, auth tokens, billing details, email addresses or private
datasets into an issue. Report security problems through the private route in
[SECURITY.md](../../SECURITY.md) instead; there is no public vulnerability form.

## What the forms check

The forms are YAML files in `.github/ISSUE_TEMPLATE`. They are data, so nothing
about them fails a build on its own. `scripts/verify-issue-forms.js` checks them
against GitHub's form schema and runs in CI under `yarn test:scripts`.

```bash
gh label list --repo PocketDecks/pokemon-tcg-pocket-tier-list --limit 100 --json name --jq '[.[].name]' > .github/labels.snapshot.json
node scripts/verify-issue-forms.js --labels .github/labels.snapshot.json
```

The check fails on a duplicate field id, a body with no field that accepts
input, an input type outside the schema, an attribute or validation that the
item type does not accept, a chooser key outside the schema, and a label the
recorded label list does not contain. Labels may be a list or a comma-delimited
string. Each problem prints on its own line with the file it came from.

`.github/labels.snapshot.json` records the repository's labels, so the check
needs no network in CI. Refresh it with the `gh label list` command above
whenever a label is added, renamed or removed. A stale snapshot still catches a
template that references a label it never had, but not one deleted from GitHub
afterwards.

## Triage

Severity and priority are separate axes. Severity describes the impact of the
defect; priority describes when maintainers will act on it. A `severity: low`
report can still be `priority: p1` when it blocks a release, and a
`severity: critical` report is not a commitment to fix it today.

Maintainers, not reporters, confirm:

- the root cause, which the report may only hypothesise
- whether the report duplicates an existing issue, and which issue is canonical
- the effort, the scope and the acceptance test
- the policy question, when the report asks for a rule change

A completed form is a starting point, not evidence. Reproduce the report before
labelling it confirmed, and ask for the missing field rather than inferring it.

A report that needs a decision rather than a fix gets `status: needs-decision`
with the decision named in the issue. One that needs more information gets
`status: needs-info` with exactly what is missing.

## Stale reports

Record the last verified commit and date on an issue before implementation
starts. Maintainers recheck a report against the current `main` before acting
on it, because the defect may already be fixed or the cited line may have
moved.
