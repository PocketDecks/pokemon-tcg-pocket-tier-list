import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

if (typeof Element.prototype.checkVisibility !== "function") {
  Element.prototype.checkVisibility = function checkVisibility(this: Element) {
    return !this.closest("[hidden]") && getComputedStyle(this).display !== "none";
  };
}

// RTL needs this flag in Vitest; without it, act() warns on every render.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
