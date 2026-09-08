// Mirror of analysis/src/utils/set-codes.ts. The scraper runs under plain
// Node so it cannot import the TypeScript normaliser; this file keeps the
// write side on the same key contract. Keep the two implementations character
// identical and rely on analysis/src/__tests__/set-codes.test.ts to pin them
// behaviourally identical against every set code in the shipped store.
export const canonSet = (raw) => {
  const s = String(raw).trim();
  const promo = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (promo === "pa" || promo === "pb") return promo.toUpperCase();
  const m = s.match(/^([A-Za-z])(\d+)([A-Za-z])?$/);
  if (!m) return s.toUpperCase();
  return `${m[1].toUpperCase()}${m[2]}${m[3] ? m[3].toLowerCase() : ""}`;
};
export const cardKey = (name, set, number) =>
  `${name} ${canonSet(set)} ${number}`;
