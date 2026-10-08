import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalLimitlessKey = process.env.LIMITLESS_API_KEY;
const originalWarn = console.warn;

const loadModule = async () => {
  vi.resetModules();
  return import("../load-env");
};

afterEach(() => {
  if (originalLimitlessKey === undefined) delete process.env.LIMITLESS_API_KEY;
  else process.env.LIMITLESS_API_KEY = originalLimitlessKey;
  console.warn = originalWarn;
});

describe("loadEnv", () => {
  it("loads values from the root env file", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-"));
    fs.writeFileSync(path.join(root, ".env"), "LIMITLESS_API_KEY=file-key\n");
    delete process.env.LIMITLESS_API_KEY;

    const { loadEnv } = await loadModule();
    loadEnv(root);

    expect(process.env.LIMITLESS_API_KEY).toBe("file-key");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("preserves an existing environment value", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-"));
    fs.writeFileSync(path.join(root, ".env"), "LIMITLESS_API_KEY=file-key\n");
    process.env.LIMITLESS_API_KEY = "shell-key";

    const { loadEnv } = await loadModule();
    loadEnv(root);

    expect(process.env.LIMITLESS_API_KEY).toBe("shell-key");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("warns when the analysis env file exists", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-"));
    fs.mkdirSync(path.join(root, "analysis"));
    fs.writeFileSync(path.join(root, "analysis", ".env"), "LIMITLESS_API_KEY=old-key\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { loadEnv } = await loadModule();
    loadEnv(root);

    expect(warn).toHaveBeenCalledWith(
      "analysis/.env is ignored; move its values to the root .env"
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
});
