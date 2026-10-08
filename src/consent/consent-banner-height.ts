import { useEffect } from "react";

export const CONSENT_BANNER_HEIGHT_PROPERTY = "--consent-banner-h";
export const CONSENT_BANNER_SELECTOR = '[data-testid="consent-banner-root"]';

const publishHeight = (root: HTMLElement, height: number): void => {
  root.style.setProperty(CONSENT_BANNER_HEIGHT_PROPERTY, `${Math.max(0, Math.round(height))}px`);
};

export const useConsentBannerHeight = (enabled: boolean): void => {
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.style.removeProperty(CONSENT_BANNER_HEIGHT_PROPERTY);
      return;
    }

    let banner: Element | null = null;
    let observer: ResizeObserver | null = null;

    const measure = (): void => {
      if (!banner) return;
      publishHeight(root, banner.getBoundingClientRect().height);
    };

    const attach = (): void => {
      const next = document.querySelector(CONSENT_BANNER_SELECTOR);
      if (next === banner) return;
      observer?.disconnect();
      observer = null;
      banner = next;
      if (!banner) {
        publishHeight(root, 0);
        return;
      }
      measure();
      if (typeof ResizeObserver === "undefined") return;
      observer = new ResizeObserver(measure);
      observer.observe(banner);
    };

    attach();
    const mutations = new MutationObserver(attach);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer?.disconnect();
      root.style.removeProperty(CONSENT_BANNER_HEIGHT_PROPERTY);
    };
  }, [enabled]);
};
