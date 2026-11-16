import { createContext, useContext } from "react";
import { DEFAULT_WINDOW, type WindowId } from "../types/meta-windows";

export interface MetaWindowContextValue {
  window: WindowId;
  setWindow: (window: WindowId) => void;
}

export const MetaWindowContext = createContext<MetaWindowContextValue>({
  window: DEFAULT_WINDOW,
  setWindow: () => {},
});

export const useMetaWindow = (): MetaWindowContextValue => useContext(MetaWindowContext);
