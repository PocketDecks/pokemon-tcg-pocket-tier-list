export { cardIdFromImage, deckThumbUrl } from "../../scripts/deck-thumbs.mjs";

export const onDeckThumbError =
  (remote: string) =>
  (event: { currentTarget: HTMLImageElement }): void => {
    const image = event.currentTarget;
    if (image.dataset.fallback) return;
    image.dataset.fallback = "true";
    image.src = remote;
  };
