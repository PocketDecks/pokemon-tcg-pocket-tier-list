// The single set-code normaliser behind the pairing key contract. Both sides
// of the language boundary fold a raw set code into one canonical form, so a
// pairing key is always "Name SET N" with SET one of A1 to B4a, PA or PB.
// Promo and variant-letter casing collapse here so the scraper and the
// matcher cannot drift apart.

export const canonSet = (raw: string): string => {
  const s = String(raw).trim();
  const promo = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (promo === "pa" || promo === "pb") return promo.toUpperCase();
  const m = s.match(/^([A-Za-z])(\d+)([A-Za-z])?$/);
  if (!m) return s.toUpperCase();
  return `${m[1].toUpperCase()}${m[2]}${m[3] ? m[3].toLowerCase() : ""}`;
};

export const cardKey = (name: string, set: string, number: string): string =>
  `${name} ${canonSet(set)} ${number}`;
