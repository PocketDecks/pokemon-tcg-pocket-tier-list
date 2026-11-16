import { useMemo, useState, type ReactNode } from "react";
import { DEFAULT_WINDOW, type WindowId } from "../types/meta-windows";
import { parseMetaWindow } from "../app/meta-window";
import { MetaWindowContext } from "./meta-window-state";

export { useMetaWindow } from "./meta-window-state";

const windowFromUrl = (): WindowId | null =>
  parseMetaWindow(new URLSearchParams(globalThis.location?.search ?? "").get("window"));

export const MetaWindowProvider = ({
  children,
  initialWindow,
}: {
  children: ReactNode;
  initialWindow?: WindowId;
}) => {
  const [window, setWindow] = useState<WindowId>(
    () => initialWindow ?? windowFromUrl() ?? DEFAULT_WINDOW
  );
  const value = useMemo(() => ({ window, setWindow }), [window]);

  return (
    <MetaWindowContext.Provider value={value}>
      {children}
    </MetaWindowContext.Provider>
  );
};
