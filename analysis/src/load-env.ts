import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

export const loadEnv = (repoRoot = path.resolve(__dirname, "..", "..")) => {
  config({ path: path.join(repoRoot, ".env"), quiet: true });

  const analysisEnvPath = path.join(repoRoot, "analysis", ".env");
  if (fs.existsSync(analysisEnvPath)) {
    console.warn("analysis/.env is ignored; move its values to the root .env");
  }
};

loadEnv();
