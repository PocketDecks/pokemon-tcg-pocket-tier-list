import type { MetaShareEntry } from "../types/pipeline-data";

export const settleAllNewShares = (entries: MetaShareEntry[]): MetaShareEntry[] => {
  if (entries.length === 0 || !entries.every((entry) => entry.isNew)) return entries;
  return entries.map((entry) => ({ ...entry, isNew: false, delta: 0 }));
};
