import fs from "node:fs";
import { randomUUID } from "node:crypto";

export const writeFileAtomic = (destination, contents) => {
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents);
    fs.renameSync(temporary, destination);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
};
