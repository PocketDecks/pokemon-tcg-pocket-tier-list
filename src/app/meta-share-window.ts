import type { MetaShareEntry, MovingMetaShareEntry } from "../types/pipeline-data";

export const hasMovement = (entry: MetaShareEntry): entry is MovingMetaShareEntry =>
  typeof entry.sharePrev === "number" &&
  typeof entry.delta === "number" &&
  typeof entry.firstSeen === "string" &&
  typeof entry.isNew === "boolean";

export const settleAllNewShares = (entries: MetaShareEntry[]): MetaShareEntry[] => {
  const moving = entries.filter(hasMovement);
  if (moving.length === 0 || !moving.every((entry) => entry.isNew)) return entries;
  return entries.map((entry) => (hasMovement(entry) ? { ...entry, isNew: false, delta: 0 } : entry));
};
