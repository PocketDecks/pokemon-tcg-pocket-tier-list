import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    setupFiles: ["vitest.setup.ts"],
  },
  esbuild: {
    tsconfigRaw: path.resolve(__dirname, "tsconfig.json"),
  },
});
