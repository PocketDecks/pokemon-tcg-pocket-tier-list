import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

// RTL needs this flag in Vitest; without it, act() warns on every render.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
