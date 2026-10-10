const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { validateTemplates, readLabels, TEMPLATE_DIR } = require("../verify-issue-forms");

const created = [];

const makeTemplates = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-forms-"));
  created.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
};

test.afterEach(() => {
  while (created.length > 0) fs.rmSync(created.pop(), { recursive: true, force: true });
});

const MINIMAL_FORM = [
  "name: Application bug",
  "description: Something broke",
  "labels:",
  "  - bug",
  "body:",
  "  - type: markdown",
  "    attributes:",
  "      value: |",
  "        Read this first",
  "  - type: textarea",
  "    id: actual",
  "    attributes:",
  "      label: What happened?",
  "    validations:",
  "      required: true",
  "",
].join("\n");

const MINIMAL_CONFIG = "blank_issues_enabled: true\n";

const withFiles = (overrides) =>
  makeTemplates({ "config.yml": MINIMAL_CONFIG, "1-bug.yml": MINIMAL_FORM, ...overrides });

const issuesFor = (dir, labels = null) => validateTemplates(dir, labels).issues;

test("accepts a well-formed form and chooser", () => {
  const { issues, forms, labelsChecked } = validateTemplates(withFiles({}), ["bug"]);
  assert.deepStrictEqual(issues, []);
  assert.strictEqual(forms, 1);
  assert.strictEqual(labelsChecked, true);
});

test("reports a missing template directory", () => {
  const missing = path.join(os.tmpdir(), "issue-forms-absent-dir");
  assert.deepStrictEqual(validateTemplates(missing).issues, [`${missing} does not exist`]);
});

test("reports a missing chooser file", () => {
  const dir = makeTemplates({ "1-bug.yml": MINIMAL_FORM });
  assert.deepStrictEqual(issuesFor(dir), [`config.yml is missing from ${dir}`]);
});

test("reports a directory holding only the chooser", () => {
  const dir = makeTemplates({ "config.yml": MINIMAL_CONFIG });
  assert.deepStrictEqual(issuesFor(dir), [`${dir} holds no forms`]);
});

test("flags YAML that does not parse, naming the file", () => {
  const dir = withFiles({ "2-broken.yml": "name: [unclosed\n" });
  const [issue] = issuesFor(dir);
  assert.match(issue, /^2-broken\.yml: does not parse as YAML \(/);
});

test("flags a non-mapping top level", () => {
  const dir = withFiles({ "2-list.yml": "- type: input\n" });
  assert.deepStrictEqual(issuesFor(dir), ["2-list.yml: top level is not a mapping"]);
});

test("flags an unknown top-level key", () => {
  const dir = withFiles({ "2-extra.yml": `${MINIMAL_FORM}owner: someone\n` });
  assert.deepStrictEqual(issuesFor(dir), ["2-extra.yml: has an unknown top-level key owner"]);
});

test("flags a missing name, description and body", () => {
  const dir = withFiles({ "2-bare.yml": "title: nothing\ntype: Task\n" });
  assert.deepStrictEqual(issuesFor(dir), [
    "2-bare.yml: needs name",
    "2-bare.yml: needs description",
    "2-bare.yml: needs body",
  ]);
});

test("flags a name of three characters or fewer", () => {
  const dir = withFiles({ "2-short.yml": MINIMAL_FORM.replace("Application bug", "Bug") });
  assert.deepStrictEqual(issuesFor(dir), ["2-short.yml: name must be longer than 3 characters"]);
});

test("flags an empty body", () => {
  const dir = withFiles({ "2-empty.yml": "name: Empty form\ndescription: nothing\nbody: []\n" });
  assert.deepStrictEqual(issuesFor(dir), ["2-empty.yml: needs a non-empty body"]);
});

test("flags a repeated id", () => {
  const dir = withFiles({
    "2-dupe.yml": [
      "name: Repeated id",
      "description: x",
      "body:",
      "  - type: input",
      "    id: actual",
      "    attributes:",
      "      label: First",
      "  - type: input",
      "    id: actual",
      "    attributes:",
      "      label: Second",
      "",
    ].join("\n"),
  });
  assert.deepStrictEqual(issuesFor(dir), ["2-dupe.yml: repeats the id actual"]);
});

test("flags an invalid item type", () => {
  const dir = withFiles({
    "2-type.yml": "name: Bad type\ndescription: x\nbody:\n  - type: rating\n    id: score\n    attributes:\n      label: Score\n",
  });
  assert.deepStrictEqual(issuesFor(dir), ['2-type.yml: body[0] has an invalid type "rating"']);
});

test("flags an item key outside the schema", () => {
  const dir = withFiles({
    "2-key.yml": "name: Extra key\ndescription: x\nbody:\n  - type: input\n    id: page\n    attributes:\n      label: Page\n    required: true\n",
  });
  assert.deepStrictEqual(issuesFor(dir), ["2-key.yml: body[0] has an unknown key required"]);
});

test("flags a missing id on a non-markdown item", () => {
  const dir = withFiles({
    "2-noid.yml": "name: No id\ndescription: x\nbody:\n  - type: input\n    attributes:\n      label: Page\n",
  });
  assert.deepStrictEqual(issuesFor(dir), ["2-noid.yml: body[0] (input) needs an id"]);
});

test("flags an id with characters outside the schema pattern", () => {
  const dir = withFiles({
    "2-badid.yml": "name: Bad id\ndescription: x\nbody:\n  - type: input\n    id: page name\n    attributes:\n      label: Page\n",
  });
  assert.deepStrictEqual(issuesFor(dir), [
    "2-badid.yml: body[0] has an id with characters outside a-z, A-Z, 0-9, - and _",
  ]);
});

test("flags a markdown item without a value", () => {
  const dir = withFiles({
    "2-md.yml": "name: Markdown\ndescription: x\nbody:\n  - type: markdown\n    attributes:\n      label: Note\n",
  });
  assert.deepStrictEqual(issuesFor(dir), ["2-md.yml: body[0] (markdown) needs attributes.value"]);
});

test("flags an attribute outside the schema for the item type", () => {
  const dir = withFiles({
    "2-attr.yml": "name: Bad attribute\ndescription: x\nbody:\n  - type: input\n    id: page\n    attributes:\n      label: Page\n      options:\n        - one\n",
  });
  assert.deepStrictEqual(issuesFor(dir), [
    "2-attr.yml: body[0] (input) has an unknown attribute options",
  ]);
});

test("flags a non-string string attribute", () => {
  const dir = withFiles({
    "2-attr.yml": "name: Bad attribute\ndescription: x\nbody:\n  - type: input\n    id: page\n    attributes:\n      label: Page\n      placeholder: 42\n",
  });
  assert.deepStrictEqual(issuesFor(dir), [
    "2-attr.yml: body[0] (input) needs placeholder to be a string",
  ]);
});

test("flags a dropdown without options", () => {
  const dir = withFiles({
    "2-dd.yml": "name: Dropdown\ndescription: x\nbody:\n  - type: dropdown\n    id: kind\n    attributes:\n      label: Kind\n      options: []\n",
  });
  assert.deepStrictEqual(issuesFor(dir), ["2-dd.yml: body[0] (dropdown) needs a non-empty options list"]);
});

test("flags a dropdown with a repeated option", () => {
  const dir = withFiles({
    "2-dd.yml": "name: Dropdown\ndescription: x\nbody:\n  - type: dropdown\n    id: kind\n    attributes:\n      label: Kind\n      options:\n        - one\n        - one\n",
  });
  assert.deepStrictEqual(issuesFor(dir), ["2-dd.yml: body[0] (dropdown) repeats an option"]);
});

test("flags a dropdown default outside its options", () => {
  const dir = withFiles({
    "2-dd.yml": "name: Dropdown\ndescription: x\nbody:\n  - type: dropdown\n    id: kind\n    attributes:\n      label: Kind\n      options:\n        - one\n      default: 4\n",
  });
  assert.deepStrictEqual(issuesFor(dir), ["2-dd.yml: body[0] (dropdown) has a default outside its options"]);
});

test("flags a checkbox option without a label", () => {
  const dir = withFiles({
    "2-cb.yml": "name: Checkboxes\ndescription: x\nbody:\n  - type: checkboxes\n    id: ack\n    attributes:\n      label: Ack\n      options:\n        - required: true\n",
  });
  assert.deepStrictEqual(issuesFor(dir), ["2-cb.yml: body[0] (checkboxes) option[0] needs a label"]);
});

test("flags a checkbox option key outside the schema", () => {
  const dir = withFiles({
    "2-cb.yml": "name: Checkboxes\ndescription: x\nbody:\n  - type: checkboxes\n    id: ack\n    attributes:\n      label: Ack\n      options:\n        - label: I agree\n          checked: true\n",
  });
  assert.deepStrictEqual(issuesFor(dir), [
    "2-cb.yml: body[0] (checkboxes) option[0] has an unknown key checked",
  ]);
});

test("flags a validation outside the schema for the item type", () => {
  const dir = withFiles({
    "2-val.yml": "name: Validation\ndescription: x\nbody:\n  - type: dropdown\n    id: kind\n    attributes:\n      label: Kind\n      options:\n        - one\n    validations:\n      min_length: 5\n",
  });
  assert.deepStrictEqual(issuesFor(dir), [
    "2-val.yml: body[0] (dropdown) has an unknown validation min_length",
  ]);
});

test("flags a non-boolean required and a non-integer min_length", () => {
  const dir = withFiles({
    "2-val.yml": "name: Validation\ndescription: x\nbody:\n  - type: input\n    id: page\n    attributes:\n      label: Page\n    validations:\n      required: yes please\n      min_length: 2.5\n",
  });
  assert.deepStrictEqual(issuesFor(dir), [
    "2-val.yml: body[0] (input) needs a boolean required",
    "2-val.yml: body[0] has a non-integer min_length",
  ]);
});

test("flags a label the repository does not have", () => {
  const dir = withFiles({});
  assert.deepStrictEqual(issuesFor(dir, ["enhancement"]), [
    "1-bug.yml: references the missing label bug",
  ]);
});

test("skips label checks when no label list is supplied", () => {
  const dir = withFiles({});
  assert.deepStrictEqual(issuesFor(dir), []);
});

test("flags a chooser without a boolean blank_issues_enabled", () => {
  const dir = withFiles({ "config.yml": "contact_links: []\n" });
  assert.deepStrictEqual(issuesFor(dir), ["config.yml: needs a boolean blank_issues_enabled"]);
});

test("flags an unknown chooser key and a relative contact link", () => {
  const dir = withFiles({
    "config.yml": "blank_issues_enabled: true\nblank_issue_enabled: false\ncontact_links:\n  - name: Docs\n    url: /docs\n    about: Read this\n",
  });
  assert.deepStrictEqual(issuesFor(dir), [
    "config.yml: has an unknown key blank_issue_enabled",
    "config.yml: contact link url must be absolute, got /docs",
  ]);
});

test("flags a contact link missing a field", () => {
  const dir = withFiles({
    "config.yml": "blank_issues_enabled: true\ncontact_links:\n  - name: Docs\n    url: https://example.com/\n",
  });
  assert.deepStrictEqual(issuesFor(dir), ["config.yml: a contact link is missing about"]);
});

test("readLabels accepts both name arrays and label objects", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-forms-labels-"));
  created.push(dir);
  const names = path.join(dir, "names.json");
  const objects = path.join(dir, "objects.json");
  fs.writeFileSync(names, JSON.stringify(["bug", "enhancement"]));
  fs.writeFileSync(objects, JSON.stringify([{ name: "bug" }, { name: "enhancement" }]));
  assert.deepStrictEqual(readLabels(names), ["bug", "enhancement"]);
  assert.deepStrictEqual(readLabels(objects), ["bug", "enhancement"]);
});

test("the repository's own templates pass the structural checks", () => {
  const { issues, forms } = validateTemplates(TEMPLATE_DIR);
  assert.deepStrictEqual(issues, []);
  assert.strictEqual(forms, 3);
});

test("the repository's own templates resolve against the recorded label list", () => {
  const labels = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", ".github", "labels.snapshot.json"), "utf8")
  );
  const { issues } = validateTemplates(TEMPLATE_DIR, labels);
  assert.deepStrictEqual(issues, []);
});
