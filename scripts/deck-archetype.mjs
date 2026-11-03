import { deckSlug } from "./deck-slug.mjs";
import { friendlyName } from "./deck-friendly-name.mjs";

const CARD_ID_SUFFIX = /-[a-z0-9]+-\d+$/;

export const deckArchetypeSlug = (name) => {
  const lead = deckSlug(name).split("&", 1)[0];
  return lead.replace(CARD_ID_SUFFIX, "");
};

export const deckVariantSlug = (name) => deckSlug(name);

export const hubDisplayName = (entries) => {
  const latest = entries.reduce((best, entry) => (entry.lastSeen > best.lastSeen ? entry : best));
  return friendlyName(latest.name.split("&", 1)[0]);
};

export const hubSeenRange = (entries) => ({
  firstSeen: entries.map((entry) => entry.firstSeen).sort()[0],
  lastSeen: entries.map((entry) => entry.lastSeen).sort().at(-1),
});
