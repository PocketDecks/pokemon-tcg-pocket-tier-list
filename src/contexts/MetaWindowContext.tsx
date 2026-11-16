import { useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_META_WINDOW,
  parseMetaWindow,
  type MetaWindow,
} from "../app/meta-window";
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
  const value = useMemo(() => ({ window, setWindow }), [window]);

  return (
    <MetaWindowContext.Provider value={value}>
      {children}
    </MetaWindowContext.Provider>
  );
};
