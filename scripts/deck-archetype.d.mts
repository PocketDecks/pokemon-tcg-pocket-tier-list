export type HubVariant = { name: string; firstSeen: string; lastSeen: string };

export const deckArchetypeSlug: (name: string) => string;
export const deckVariantSlug: (name: string) => string;
export const hubDisplayName: (entries: HubVariant[]) => string;
export const hubSeenRange: (entries: HubVariant[]) => { firstSeen: string; lastSeen: string };
