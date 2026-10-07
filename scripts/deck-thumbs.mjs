export const ART_SIZE = { width: 367, height: 512 };

const TILE_ART_SCALE = 2.8;
const TILE_ART_TOP = -0.32;

export const deriveCropRect = (art = ART_SIZE, scale = TILE_ART_SCALE, top = TILE_ART_TOP) => {
  const artWidth = scale * (art.width / art.height);
  const left = (1 - artWidth) / 2;
  return {
    left: Math.round((-left / artWidth) * art.width),
    top: Math.round((-top / scale) * art.height),
    width: Math.round((1 / artWidth) * art.width),
    height: Math.round((1 / scale) * art.height),
  };
};

export const DECK_THUMB_CROP = deriveCropRect();

export const DECK_THUMB_QUALITY = 80;

export const deckThumbUrl = (cardId) => `/thumbs/${cardId}.webp`;

const CARD_IMAGE = /([a-z0-9]+)\/(\d+)\.webp$/;

export const cardIdFromImage = (image) => {
  const match = image.match(CARD_IMAGE);
  return match ? `${match[1]}-${match[2]}` : null;
};
