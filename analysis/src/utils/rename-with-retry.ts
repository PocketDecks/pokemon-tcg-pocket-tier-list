import fs from "fs";

// Windows keeps EPERM-locked targets for as long as a reader holds them, so
// short retries cover transient locks before the direct-write fallback.
export const renameWithRetry = (source: string, destination: string): void => {
  const attempts = 3;
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.renameSync(source, destination);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM" || attempt >= attempts) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * attempt);
    }
  }
};
