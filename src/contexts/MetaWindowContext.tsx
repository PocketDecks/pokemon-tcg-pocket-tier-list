import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_META_WINDOW,
  isPremiumMetaWindow,
  parseMetaWindow,
  type MetaWindow,
} from "../app/meta-window";
import { useQueryClient } from "@tanstack/react-query";
import { PremiumAccessError } from "../app/premium-data";
import useIsPremium from "../app/use-is-premium";
import { MetaWindowContext } from "./meta-window-state";

export { useMetaWindow } from "./meta-window-state";

const windowFromUrl = (): MetaWindow | null =>
  parseMetaWindow(new URLSearchParams(globalThis.location?.search ?? "").get("window"));

export const MetaWindowProvider = ({
  children,
  initialWindow,
}: {
  children: ReactNode;
  initialWindow?: MetaWindow;
}) => {
  const [window, setWindow] = useState<MetaWindow>(
    () => initialWindow ?? windowFromUrl() ?? DEFAULT_META_WINDOW
  );
  const isPremium = useIsPremium();
  const queryClient = useQueryClient();

  // Premium lapse mid-session falls back to the default; unknown premium
  // state (null) never resets.

  useEffect(() => {
    if (isPremium === false && isPremiumMetaWindow(window)) {
      setWindow(DEFAULT_META_WINDOW);
    }
  }, [isPremium, window]);

  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          event.action.type === "error" &&
          event.action.error instanceof PremiumAccessError
        ) {
          setWindow(DEFAULT_META_WINDOW);
        }
      }),
    [queryClient]
  );

  const value = useMemo(() => ({ window, setWindow }), [window]);

  return (
    <MetaWindowContext.Provider value={value}>
      {children}
    </MetaWindowContext.Provider>
  );
};
