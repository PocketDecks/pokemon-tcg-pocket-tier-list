const test = require("node:test");
const assert = require("node:assert/strict");
const { scripts } = require("../../package.json");

test("deck hubs prerender from the shell before the route prerender overwrites index.html", () => {
  const steps = scripts.postbuild.split("&&").map((step) => step.trim());
  const position = (script) => steps.findIndex((step) => step.endsWith(`scripts/${script}`));
  assert.ok(position("prerender-deck-hubs.js") >= 0);
  assert.ok(position("prerender-deck-hubs.js") < position("prerender-routes.js"));
});
