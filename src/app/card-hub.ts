import hubSlugs from "../data/deck-hub-slugs.json";
import { deckArchetypeSlug } from "./deck-archetype";

const HUBS = new Set<string>(hubSlugs);

export const cardHubSlug = (name: string, id: string): string => deckArchetypeSlug(`${name}-${id}`);

export const cardHubFor = (card: { name: string; id: string }): string | null => {
  const hub = cardHubSlug(card.name, card.id);
  return HUBS.has(hub) ? hub : null;
};
