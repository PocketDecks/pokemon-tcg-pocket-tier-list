export const ART_SIZE: { width: number; height: number };
export const DECK_THUMB_CROP: {
  left: number;
  top: number;
  width: number;
  height: number;
};
export const DECK_THUMB_QUALITY: number;
export const DECK_THUMB_VERSION: string;
export const deckThumbUrl: (cardId: string) => string;
export const cardIdFromImage: (image: string) => string | null;
export const deriveCropRect: (
  art?: { width: number; height: number },
  scale?: number,
  top?: number
) => { left: number; top: number; width: number; height: number };
