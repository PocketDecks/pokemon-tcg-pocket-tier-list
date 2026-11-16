import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEFAULT_META_WINDOW, isPremiumMetaWindow } from "../app/meta-window";
import { supporterScopeKey } from "../app/query-keys";
import useFilters from "../app/use-filters";
import useIsPremium from "../app/use-is-premium";
import { useMetaWindow } from "./meta-window-state";

/**
 * What the app does when the viewer is not a Supporter: the single place that
 * puts Supporter-only state back to its free defaults. It covers sign-out, a
 * grant that runs out while the page is open, and a free viewer who arrives on
 * a Supporter window through a link. Unknown access (loading) changes nothing.
 */
const AccessEnded = () => {
  const isPremium = useIsPremium();
  const { window, setWindow } = useMetaWindow();
  const { resetTierListFilters } = useFilters();
  const queryClient = useQueryClient();
  const wasSupporter = useRef(false);

  useEffect(() => {
    if (isPremium === true) {
      wasSupporter.current = true;
      return;
    }
    if (isPremium === null) return;
    resetTierListFilters();
    if (isPremiumMetaWindow(window)) setWindow(DEFAULT_META_WINDOW);
    if (wasSupporter.current) {
      wasSupporter.current = false;
      queryClient.removeQueries({ queryKey: supporterScopeKey });
    }
  }, [isPremium, window, setWindow, resetTierListFilters, queryClient]);

  return null;
};

export default AccessEnded;
