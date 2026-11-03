import { deckSlug } from "./deck-slug.mjs";

const CARD_ID_SUFFIX = /-[a-z0-9]+-\d+$/;

export const deckArchetypeSlug = (name) => {
  const lead = deckSlug(name).split("&", 1)[0];
  return lead.replace(CARD_ID_SUFFIX, "");
};

export const deckVariantSlug = (name) => deckSlug(name);
