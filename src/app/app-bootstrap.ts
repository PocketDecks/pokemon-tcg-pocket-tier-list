import { useSyncExternalStore } from "react";

let contentReadyHandler: (() => void) | null = null;
const visibilityListeners = new Set<() => void>();

const isAppVisible = (): boolean =>
  document.documentElement.dataset.appVisible === "true";

export const setAppVisible = (): void => {
  if (isAppVisible()) return;
  document.documentElement.dataset.appVisible = "true";
  visibilityListeners.forEach((listener) => listener());
};

export const useAppVisible = (): boolean =>
  useSyncExternalStore(
    (listener) => {
      visibilityListeners.add(listener);
      return () => visibilityListeners.delete(listener);
    },
    isAppVisible,
    () => false
  );

export const setContentReadyHandler = (handler: (() => void) | null): void => {
  contentReadyHandler = handler;
};

export const notifyContentReady = (): void => {
  contentReadyHandler?.();
};

export interface AppMount {
  mount: HTMLElement;
  prerendered: boolean;
  swap: () => void;
  startCap: (delay: number) => () => void;
}

export const prepareAppMount = (rootElement: HTMLElement): AppMount => {
  if (!rootElement.hasChildNodes()) {
    setAppVisible();
    return {
      mount: rootElement,
      prerendered: false,
      swap: () => {},
      startCap: () => () => {},
    };
  }

  const appRoot = document.createElement("div");
  appRoot.id = "app-root";
  appRoot.style.position = "absolute";
  appRoot.style.inset = "0 0 auto 0";
  appRoot.style.visibility = "hidden";
  rootElement.parentElement?.insertBefore(appRoot, rootElement.nextSibling);

  let swapped = false;
  const swap = () => {
    if (swapped) return;
    swapped = true;
    const scrollY = window.scrollY;
    rootElement.replaceChildren();
    appRoot.removeAttribute("style");
    setAppVisible();
    if (scrollY > 0) window.scrollTo(0, scrollY);
  };

  return {
    mount: appRoot,
    prerendered: true,
    swap,
    startCap: (delay) => {
      const timeout = window.setTimeout(swap, delay);
      return () => window.clearTimeout(timeout);
    },
  };
};
