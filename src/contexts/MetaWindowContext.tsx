import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_META_WINDOW, type MetaWindow } from "../app/meta-window";

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
  const setWindow = useCallback((next: MetaWindow) => setWindowState(next), []);

  const value = useMemo(() => ({ window, setWindow }), [window, setWindow]);

  return (
    <MetaWindowContext.Provider value={value}>
      {children}
    </MetaWindowContext.Provider>
  );
};

export const useMetaWindow = (): MetaWindowContextValue =>
  useContext(MetaWindowContext);
