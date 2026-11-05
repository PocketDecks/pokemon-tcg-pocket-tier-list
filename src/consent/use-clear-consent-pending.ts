import { useEffect } from "react";
import { whenNoPopupOpen } from "../components/popup-state";
import { CONSENT_PENDING_ATTRIBUTE } from "./consent-pending-keys.mjs";

export const useClearConsentPending = (settled: boolean) => {
  useEffect(() => {
    if (!settled) return;
    return whenNoPopupOpen(() => document.documentElement.removeAttribute(CONSENT_PENDING_ATTRIBUTE));
  }, [settled]);
};
