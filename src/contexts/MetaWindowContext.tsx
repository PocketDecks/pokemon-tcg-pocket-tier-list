import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_META_WINDOW,
  isPremiumMetaWindow,
  type MetaWindow,
} from "../app/meta-window";
import { useQueryClient } from "@tanstack/react-query";
import { PremiumAccessError } from "../app/premium-data";
import useIsPremium from "../app/use-is-premium";

interface MetaWindowContextValue {
  window: MetaWindow;
  setWindow: (window: MetaWindow) => void;
}

// Non-null default keeps tests and the prerender working without the provider.
const MetaWindowContext = createContext<MetaWindowContextValue>({
  window: DEFAULT_META_WINDOW,
  setWindow: () => {},
});

export const MetaWindowProvider = ({
  children,
  initialWindow = DEFAULT_META_WINDOW,
}: {
  children: ReactNode;
  initialWindow?: MetaWindow;
}) => {
  const [window, setWindowState] = useState<MetaWindow>(initialWindow);
  const isPremium = useIsPremium();
  const queryClient = useQueryClient();
  const setWindow = useCallback((next: MetaWindow) => setWindowState(next), []);

  // Premium lapse mid-session falls back to the default; unknown premium
  // state (null) never resets.

  useEffect(() => {
    if (isPremium === false && isPremiumMetaWindow(window)) {
      setWindowState(DEFAULT_META_WINDOW);
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
          setWindowState(DEFAULT_META_WINDOW);
        }
      }),
    [queryClient]
  );

  const value = useMemo(() => ({ window, setWindow }), [window, setWindow]);

  return (
    <MetaWindowContext.Provider value={value}>
      {children}
    </MetaWindowContext.Provider>
  );
};

export const useMetaWindow = (): MetaWindowContextValue =>
  useContext(MetaWindowContext);
