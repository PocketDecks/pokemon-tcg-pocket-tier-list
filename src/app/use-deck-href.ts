import { useCallback } from "react";
import { deckHref } from "./deck-window-link";
import { useMetaWindow } from "./use-meta-window";

const useDeckHref = (): ((slug: string) => string) => {
  const { window } = useMetaWindow();
  return useCallback((slug: string) => deckHref(slug, window), [window]);
};

export default useDeckHref;
