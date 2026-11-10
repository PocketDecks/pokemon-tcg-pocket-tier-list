import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const isMainModule = (metaUrl) => {
  const invoked = process.argv[1];
  if (!invoked) return false;
  const modulePath = fileURLToPath(metaUrl);
  try {
    return fs.realpathSync.native(invoked) === fs.realpathSync.native(modulePath);
  } catch {
    return path.resolve(invoked) === path.resolve(modulePath);
  }
};
