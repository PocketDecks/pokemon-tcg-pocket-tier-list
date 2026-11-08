import { createContext, useContext } from "react";
import { DEFAULT_META_WINDOW, type MetaWindow } from "../app/meta-window";

export interface MetaWindowContextValue {
  window: MetaWindow;
  setWindow: (window: MetaWindow) => void;
}

export const MetaWindowContext = createContext<MetaWindowContextValue>({
  window: DEFAULT_META_WINDOW,
  setWindow: () => {},
});

export const useMetaWindow = (): MetaWindowContextValue => useContext(MetaWindowContext);
