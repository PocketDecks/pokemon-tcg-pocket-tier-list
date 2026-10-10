const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const TEMPLATE_DIR = path.join(__dirname, "..", ".github", "ISSUE_TEMPLATE");
const CONFIG_FILE = "config.yml";
const FORM_KEYS = ["name", "description", "title", "labels", "assignees", "projects", "type", "body"];
const ITEM_KEYS = ["type", "id", "attributes", "validations"];
const ATTRIBUTE_KEYS = {
  markdown: ["value"],
  textarea: ["label", "description", "placeholder", "value", "render"],
  input: ["label", "description", "placeholder", "value"],
  dropdown: ["label", "description", "multiple", "options", "default"],
  checkboxes: ["label", "description", "options"],
  upload: ["label", "description"],
};
const VALIDATION_KEYS = {
  markdown: [],
  textarea: ["required", "min_length"],
  input: ["required", "min_length"],
  dropdown: ["required"],
  checkboxes: ["required"],
  upload: ["required", "accept"],
};
const CHECKBOX_KEYS = ["label", "required"];
const STRING_ATTRIBUTES = ["label", "description", "placeholder", "value", "render"];

const unknownKeys = (value, allowed) => Object.keys(value).filter((key) => !allowed.includes(key));
const isMapping = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const declaredLabels = (labels) => {
  if (Array.isArray(labels)) return labels;
  if (typeof labels !== "string") return [];
  return labels.split(",").map((label) => label.trim()).filter((label) => label.length > 0);
};

const checkOptions = (item, file, where, push) => {
  const options = item.attributes.options;
  if (!Array.isArray(options) || options.length === 0) {
    push(`${file}: ${where} needs a non-empty options list`);
    return;
  }
  if (item.type === "dropdown") {
    if (options.some((option) => typeof option !== "string")) {
      push(`${file}: ${where} needs every option to be a string`);
      return;
    }
    if (new Set(options).size !== options.length) push(`${file}: ${where} repeats an option`);
    const fallback = item.attributes.default;
    if (
      fallback !== undefined &&
      !(Number.isInteger(fallback) && fallback >= 0 && fallback < options.length)
    ) {
      push(`${file}: ${where} has a default outside its options`);
    }
    return;
  }
  options.forEach((option, index) => {
    if (!isMapping(option) || typeof option.label !== "string") {
      push(`${file}: ${where} option[${index}] needs a label`);
      return;
    }
    for (const key of unknownKeys(option, CHECKBOX_KEYS)) {
      push(`${file}: ${where} option[${index}] has an unknown key ${key}`);
    }
  });
};

const checkBodyItem = (item, index, file, push) => {
  const where = `body[${index}]`;
  if (!isMapping(item)) {
    push(`${file}: ${where} is not a mapping`);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(ATTRIBUTE_KEYS, item.type)) {
    push(`${file}: ${where} has an invalid type ${JSON.stringify(item.type)}`);
    return;
  }
  for (const key of unknownKeys(item, ITEM_KEYS)) {
    push(`${file}: ${where} has an unknown key ${key}`);
  }
  if (item.type !== "markdown") {
    if (typeof item.id !== "string" || item.id.length === 0) {
      push(`${file}: ${where} (${item.type}) needs an id`);
    } else if (!/^[a-zA-Z0-9_-]+$/.test(item.id)) {
      push(`${file}: ${where} has an id with characters outside a-z, A-Z, 0-9, - and _`);
    }
  }
  if (!isMapping(item.attributes)) {
    push(`${file}: ${where} (${item.type}) needs an attributes mapping`);
    return;
  }
  if (item.type === "markdown") {
    if (typeof item.attributes.value !== "string") {
      push(`${file}: ${where} (markdown) needs attributes.value`);
    }
    return;
  }
  if (typeof item.attributes.label !== "string") {
    push(`${file}: ${where} (${item.type}) needs attributes.label`);
  }
  for (const key of unknownKeys(item.attributes, ATTRIBUTE_KEYS[item.type])) {
    push(`${file}: ${where} (${item.type}) has an unknown attribute ${key}`);
  }
  for (const key of STRING_ATTRIBUTES) {
    if (item.attributes[key] !== undefined && typeof item.attributes[key] !== "string") {
      push(`${file}: ${where} (${item.type}) needs ${key} to be a string`);
    }
  }
  if (item.type === "dropdown" || item.type === "checkboxes") {
    checkOptions(item, file, `${where} (${item.type})`, push);
  }
  if (item.validations === undefined) return;
  if (!isMapping(item.validations)) {
    push(`${file}: ${where} (${item.type}) needs a validations mapping`);
    return;
  }
  for (const key of unknownKeys(item.validations, VALIDATION_KEYS[item.type])) {
    push(`${file}: ${where} (${item.type}) has an unknown validation ${key}`);
  }
  if (item.validations.required !== undefined && typeof item.validations.required !== "boolean") {
    push(`${file}: ${where} (${item.type}) needs a boolean required`);
  }
  if (item.validations.min_length !== undefined && !Number.isInteger(item.validations.min_length)) {
    push(`${file}: ${where} has a non-integer min_length`);
  }
};

const checkForm = (text, file, labels, push) => {
  let doc;
  try {
    doc = yaml.load(text);
  } catch (error) {
    push(`${file}: does not parse as YAML (${error.message})`);
    return;
  }
  if (!isMapping(doc)) {
    push(`${file}: top level is not a mapping`);
    return;
  }
  for (const key of unknownKeys(doc, FORM_KEYS)) push(`${file}: has an unknown top-level key ${key}`);
  for (const key of ["name", "description", "body"]) {
    if (doc[key] === undefined) push(`${file}: needs ${key}`);
  }
  if (typeof doc.name === "string" && doc.name.length <= 3) {
    push(`${file}: name must be longer than 3 characters`);
  }
  if (doc.body === undefined) return;
  if (!Array.isArray(doc.body) || doc.body.length === 0) {
    push(`${file}: needs a non-empty body`);
    return;
  }
  const inputs = doc.body.filter(
    (item) => isMapping(item) && item.type !== "markdown"
  );
  if (inputs.length === 0) {
    push(`${file}: needs at least one non-markdown body item`);
  }
  const ids = doc.body
    .filter((item) => isMapping(item) && typeof item.id === "string")
    .map((item) => item.id);
  for (const id of new Set(ids)) {
    if (ids.filter((value) => value === id).length > 1) push(`${file}: repeats the id ${id}`);
  }
  doc.body.forEach((item, index) => checkBodyItem(item, index, file, push));
  if (labels === null) return;
  for (const label of declaredLabels(doc.labels)) {
    if (!labels.includes(label)) push(`${file}: references the missing label ${label}`);
  }
};

const checkChooser = (text, file, push) => {
  let doc;
  try {
    doc = yaml.load(text);
  } catch (error) {
    push(`${file}: does not parse as YAML (${error.message})`);
    return;
  }
  if (!isMapping(doc)) {
    push(`${file}: top level is not a mapping`);
    return;
  }
  for (const key of unknownKeys(doc, ["blank_issues_enabled", "contact_links"])) {
    push(`${file}: has an unknown key ${key}`);
  }
  if (typeof doc.blank_issues_enabled !== "boolean") {
    push(`${file}: needs a boolean blank_issues_enabled`);
  }
  if (doc.contact_links !== undefined && !Array.isArray(doc.contact_links)) {
    push(`${file}: contact_links must be a list`);
    return;
  }
  for (const link of doc.contact_links || []) {
    for (const key of ["name", "url", "about"]) {
      if (!isMapping(link) || typeof link[key] !== "string" || link[key].length === 0) {
        push(`${file}: a contact link is missing ${key}`);
      }
    }
    if (isMapping(link) && typeof link.url === "string" && !/^https?:\/\//.test(link.url)) {
      push(`${file}: contact link url must be absolute, got ${link.url}`);
    }
  }
};

const validateTemplates = (dir = TEMPLATE_DIR, labels = null) => {
  const issues = [];
  const push = (message) => issues.push(message);
  if (!fs.existsSync(dir)) {
    return { issues: [`${dir} does not exist`], forms: 0, labelsChecked: false };
  }
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
  let forms = 0;
  for (const name of files) {
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    if (name === CONFIG_FILE) {
      checkChooser(text, name, push);
      continue;
    }
    forms += 1;
    checkForm(text, name, labels, push);
  }
  if (!files.includes(CONFIG_FILE)) push(`${CONFIG_FILE} is missing from ${dir}`);
  if (forms === 0) push(`${dir} holds no forms`);
  return { issues, forms, labelsChecked: labels !== null };
};

const readLabels = (file) => {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const entries = Array.isArray(parsed) ? parsed : Object.values(parsed).flat();
  return entries.map((entry) => (typeof entry === "string" ? entry : entry.name));
};

const main = () => {
  const flag = process.argv.indexOf("--labels");
  if (flag === -1 || !process.argv[flag + 1]) {
    console.error("Pass --labels <file> holding the output of gh label list --json name");
    process.exit(1);
  }
  const labels = readLabels(process.argv[flag + 1]);
  const { issues, forms } = validateTemplates(TEMPLATE_DIR, labels);
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  console.log(`${forms} issue forms valid in ${TEMPLATE_DIR}, ${labels.length} labels checked`);
};

if (require.main === module) main();

module.exports = { validateTemplates, readLabels, TEMPLATE_DIR };
