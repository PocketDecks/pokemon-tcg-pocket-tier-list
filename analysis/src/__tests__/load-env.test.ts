import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalLimitlessKey = process.env.LIMITLESS_API_KEY;
const originalWarn = console.warn;
const tempDirectories: string[] = [];

const makeRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "load-env-"));
  tempDirectories.push(root);
  return root;
};

const loadModule = async () => {
  vi.resetModules();
  return import("../load-env");
};

afterEach(() => {
  if (originalLimitlessKey === undefined) delete process.env.LIMITLESS_API_KEY;
  else process.env.LIMITLESS_API_KEY = originalLimitlessKey;
  console.warn = originalWarn;
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadEnv", () => {
  it("loads values from the root env file", async () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, ".env"), "LIMITLESS_API_KEY=file-key\n");
    delete process.env.LIMITLESS_API_KEY;

    const { loadEnv } = await loadModule();
    loadEnv(root);

    expect(process.env.LIMITLESS_API_KEY).toBe("file-key");
  });

  it("loads the repository-root fixture with the default path", async () => {
    const fixtureEnv = path.resolve(__dirname, "../__fixtures__/load-env-root.env");
    const repositoryRoot = path.resolve(__dirname, "../../../");
    const repositoryEnv = path.join(repositoryRoot, ".env");
    const originalRepositoryEnv = fs.existsSync(repositoryEnv)
      ? fs.readFileSync(repositoryEnv, "utf8")
      : undefined;

    fs.copyFileSync(fixtureEnv, repositoryEnv);
    delete process.env.LIMITLESS_API_KEY;
    try {
      const { loadEnv } = await loadModule();
      loadEnv();
      expect(process.env.LIMITLESS_API_KEY).toBe("fixture-root-key");
    } finally {
      if (originalRepositoryEnv === undefined) fs.rmSync(repositoryEnv, { force: true });
      else fs.writeFileSync(repositoryEnv, originalRepositoryEnv);
    }
  });
  it("preserves an existing environment value", async () => {
    const root = makeRoot();
    fs.writeFileSync(path.join(root, ".env"), "LIMITLESS_API_KEY=file-key\n");
    process.env.LIMITLESS_API_KEY = "shell-key";

    const { loadEnv } = await loadModule();
    loadEnv(root);

    expect(process.env.LIMITLESS_API_KEY).toBe("shell-key");
  });

  it("warns when the analysis env file exists", async () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "analysis"));
    fs.writeFileSync(path.join(root, "analysis", ".env"), "LIMITLESS_API_KEY=old-key\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { loadEnv } = await loadModule();
    loadEnv(root);

    expect(warn).toHaveBeenCalledWith(
      "analysis/.env is ignored; move its values to the root .env"
    );
  });
});
