import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const isMainModule = (metaUrl) => {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return fs.realpathSync(path.resolve(invoked)) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
};
