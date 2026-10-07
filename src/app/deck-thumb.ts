import {
  cardIdFromImage as readCardId,
  deckThumbUrl as thumbUrl,
} from "../../scripts/deck-thumbs.mjs";

export const deckThumbUrl = (cardId: string): string => thumbUrl(cardId);

export const cardIdFromImage = (image: string): string | null => readCardId(image);

export const onDeckThumbError =
  (remote: string) =>
  (event: { currentTarget: HTMLImageElement }): void => {
    const image = event.currentTarget;
    if (image.dataset.fallback) return;
    image.dataset.fallback = "true";
    image.src = remote;
  };
