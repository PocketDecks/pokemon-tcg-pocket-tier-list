import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("documents settled prerenders independently of ads on error and empty screens", () => {
  const doc = readFileSync("docs/explanation/ads-premium-and-consent.md", "utf8");
  expect(doc).toContain("Ads stay off on error and empty screens.");
  expect(doc).toContain("data-route-ready");
});

it("documents route boundary recovery for pathname and search changes", () => {
  const doc = readFileSync("docs/reference/frontend-architecture.md", "utf8");
  expect(doc).toContain("The boundary resets when the pathname or search parameters change");
});

it("documents MetaWindowProvider between AuthProvider and DecksProvider", () => {
  const doc = readFileSync("docs/reference/frontend-architecture.md", "utf8");
  const stack = doc.slice(doc.indexOf("Inside `App` (`src/App.tsx`)"));
  const auth = stack.indexOf("AuthProvider");
  const metaWindow = stack.indexOf("MetaWindowProvider");
  const decks = stack.indexOf("DecksProvider");
  expect(metaWindow).toBeGreaterThan(auth);
  expect(metaWindow).toBeLessThan(decks);
  expect(stack).toContain("src/contexts/MetaWindowContext.tsx");
});
