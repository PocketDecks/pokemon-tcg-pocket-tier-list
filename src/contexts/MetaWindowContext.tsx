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
import useIsPremium from "../app/use-is-premium";

interface MetaWindowContextValue {
  window: MetaWindow;
  setWindow: (window: MetaWindow) => void;
}

// A default value rather than null keeps the toggle and the query layer
// usable on surfaces that never mount the provider (page tests, prerender).
// The default is also the window the prerendered HTML must show.
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
  const setWindow = useCallback((next: MetaWindow) => setWindowState(next), []);

  // A locked window outlives its entitlement when Premium lapses mid-session.
  // Fall back to the default rather than serving a window the plan no longer
  // grants. Unknown premium state (null) never resets the selection.
  useEffect(() => {
    if (isPremium === false && isPremiumMetaWindow(window)) {
      setWindowState(DEFAULT_META_WINDOW);
    }
  }, [isPremium, window]);

  const value = useMemo(() => ({ window, setWindow }), [window, setWindow]);

  return (
    <MetaWindowContext.Provider value={value}>
      {children}
    </MetaWindowContext.Provider>
  );
};

export const useMetaWindow = (): MetaWindowContextValue =>
  useContext(MetaWindowContext);
