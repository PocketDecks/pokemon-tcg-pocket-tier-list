export const ART_SIZE: { width: number; height: number };
export const DECK_THUMB_CROP: {
  left: number;
  top: number;
  width: number;
  height: number;
};
export const DECK_THUMB_QUALITY: number;
export const DECK_THUMB_VERSION: string;
export const DECK_THUMB_SIZES: number[];
export const deckThumbUrl: (cardId: string, size?: number) => string;
export const cardIdFromImage: (image: string) => string | null;
export const deriveCropRect: (
  art?: { width: number; height: number },
  scale?: number,
  top?: number
) => { left: number; top: number; width: number; height: number };
export const CARD_THUMB_WIDTHS: number[];
export const CARD_THUMB_ASPECT: { width: number; height: number };
export const cardThumbHeight: (width: number) => number;
export const cardThumbUrl: (cardId: string, width: number) => string;
export const cardThumbSrcSet: (cardId: string) => string;
export const DECK_CARD_SIZES: string;
export const deckListCardIds: (decks: { lists?: { cards: string[] }[] }[]) => string[];
export const firstBestListCardId: (deck: { lists?: { score: number; cards: string[] }[] }) => string | null;
