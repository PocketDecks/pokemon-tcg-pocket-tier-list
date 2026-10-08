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

export const DECK_THUMB_VERSION = "3";
export const DECK_THUMB_SIZES = [96, 183];

export const deckThumbUrl = (cardId, size = 183) =>
  `/thumbs/v${DECK_THUMB_VERSION}/${cardId}-${size}.webp?v=${DECK_THUMB_VERSION}`;

const CARD_IMAGE = /([a-z0-9]+)\/(\d+)\.webp$/;

export const cardIdFromImage = (image) => {
  const match = image.match(CARD_IMAGE);
  return match ? `${match[1]}-${match[2]}` : null;
};

export const CARD_THUMB_WIDTHS = [120, 240];
export const CARD_THUMB_ASPECT = { width: 367, height: 512 };

export const cardThumbHeight = (width) =>
  Math.round((width * CARD_THUMB_ASPECT.height) / CARD_THUMB_ASPECT.width);

export const cardThumbUrl = (cardId, width) =>
  `/thumbs/v${DECK_THUMB_VERSION}/cards/${cardId}-${width}.webp?v=${DECK_THUMB_VERSION}`;

export const cardThumbSrcSet = (cardId) =>
  CARD_THUMB_WIDTHS.map((width) => `${cardThumbUrl(cardId, width)} ${width}w`).join(", ");

export const DECK_CARD_SIZES = "(max-width: 900px) calc(50vw - 36px), 240px";

const deckListCardId = (ref) => ref.split(":")[1];

export const deckListCardIds = (decks) => {
  const ids = new Set();
  for (const deck of decks) {
    for (const list of deck.lists ?? []) {
      for (const ref of list.cards) ids.add(deckListCardId(ref));
    }
  }
  return [...ids];
};

export const firstBestListCardId = (deck) => {
  const best = deck.lists.reduce((top, list) => (list.score > top.score ? list : top));
  return deckListCardId(best.cards[0]);
};
