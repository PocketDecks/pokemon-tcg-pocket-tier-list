import archive from "../../public/data/deck-archive.json";

export interface DeckArchiveEntry {
  variant: string;
  hub: string;
  name: string;
  firstSeen: string;
  lastSeen: string;
}

export const DECK_ARCHIVE = archive as DeckArchiveEntry[];
export const DECK_VARIANTS = new Set(DECK_ARCHIVE.map((entry) => entry.variant));

export const archiveForHub = (hub: string): DeckArchiveEntry[] =>
  DECK_ARCHIVE.filter((entry) => entry.hub === hub);
