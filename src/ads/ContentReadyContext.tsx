import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "react-router";
import { notifyContentReady } from "../app/app-bootstrap";

// Tracks whether the *current* route has finished rendering meaningful
// publisher content. Ads must never show on loading, error, or otherwise
// content-less screens (AdSense "ads on screens without publisher content"
// policy), so ad components gate on this.
//
// Readiness is stored as the path that was marked ready, and compared against
// the current path. This makes navigation reset readiness automatically (the
// stored path no longer matches) without an effect that could race with the
// next page's "mark ready" effect.
interface ContentReadyValue {
  readyPath: string | null;
  markReady: (path: string, owner: object) => void;
  clearReady: (owner: object) => void;
}

interface ReadyClaim {
  path: string;
  owner: object;
}

const ContentReadyContext = createContext<ContentReadyValue | undefined>(
  undefined
);

export const ContentReadyProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [readyClaim, setReadyClaim] = useState<ReadyClaim | null>(null);
  const readyPath = readyClaim?.path ?? null;
  const markReady = useCallback(
    (path: string, owner: object) => setReadyClaim({ path, owner }),
    []
  );
  const clearReady = useCallback(
    (owner: object) => {
      setReadyClaim((current) => (current?.owner === owner ? null : current));
    },
    []
  );

  const value = useMemo(
    () => ({ readyPath, markReady, clearReady }),
    [readyPath, markReady, clearReady]
  );

  return (
    <ContentReadyContext.Provider value={value}>
      {children}
    </ContentReadyContext.Provider>
  );
};

const useContentReadyContext = (): ContentReadyValue => {
  const ctx = useContext(ContentReadyContext);
  if (!ctx) {
    throw new Error("ContentReady hooks must be used within ContentReadyProvider");
  }
  return ctx;
};

// For ad components: true only once the current route has marked itself ready.
export const useContentReady = (): boolean => {
  const { readyPath } = useContentReadyContext();
  const { pathname } = useLocation();
  return readyPath === pathname;
};

// For pages: call with `true` once primary content has rendered, and `false`
// while loading or on empty/error states. Pages that never become ready simply
// never show ads.
export const useMarkContentReady = (isReady: boolean, isSettled = isReady): void => {
  const { markReady, clearReady } = useContentReadyContext();
  const { pathname } = useLocation();
  const owner = React.useRef<object>({});
  useEffect(() => {
    if (isReady) {
      markReady(pathname, owner.current);
    } else {
      clearReady(owner.current);
    }
    if (isSettled) {
      document.documentElement.dataset.routeReady = pathname;
      notifyContentReady();
    } else if (document.documentElement.dataset.routeReady === pathname) {
      delete document.documentElement.dataset.routeReady;
    }
    return () => clearReady(owner.current);
  }, [isReady, isSettled, pathname, markReady, clearReady]);
};
