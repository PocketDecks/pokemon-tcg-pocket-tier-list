import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

const isRenderedInTree = (element: Element, options?: CheckVisibilityOptions) => {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute("hidden")) return false;
    const style = getComputedStyle(node);
    if (style.display === "none") return false;
    if (options?.visibilityProperty && style.visibility === "hidden") return false;
  }
  return true;
};

if (typeof Element.prototype.checkVisibility !== "function") {
  Element.prototype.checkVisibility = function checkVisibility(options?: CheckVisibilityOptions) {
    return isRenderedInTree(this, options);
  };
}

// RTL needs this flag in Vitest; without it, act() warns on every render.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
