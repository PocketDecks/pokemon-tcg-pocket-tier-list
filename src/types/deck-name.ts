import { deckNameToIconIds as resolveIconIds } from "../../scripts/deck-name.mjs";

export const deckNameToIconIds = (name: string): string[] => resolveIconIds(name);
