import { isPremiumWindow, type WindowId } from "../types/meta-windows";
import type { ArtefactTier } from "./meta-window";

// Everything that belongs to the signed-in account lives under this one key
// prefix. Signing out or switching account drops the whole prefix, so a query
// added here is cleaned up without touching the auth code.
export const SUPPORTER_SCOPE = "supporter";
export const supporterScopeKey = [SUPPORTER_SCOPE] as const;

export const entitlementKey = (uid: string | null) => ["entitlement", uid] as const;

// Public file, the same for every visitor: never cleared on sign-out.
export const dataVersionKey = ["data-version"] as const;

export const decksKey = (window: WindowId) =>
  isPremiumWindow(window)
    ? ([SUPPORTER_SCOPE, "decks", window] as const)
    : (["decks", window] as const);

export const matchupsKey = (window: WindowId) =>
  isPremiumWindow(window)
    ? ([SUPPORTER_SCOPE, "matchups", window] as const)
    : (["matchups", window] as const);

// The full tier reads a Supporter artefact even for a public window.
export const metaShareKey = (window: WindowId, tier: ArtefactTier) =>
  tier === "full" || isPremiumWindow(window)
    ? ([SUPPORTER_SCOPE, "meta-share", window, tier] as const)
    : (["meta-share", window, tier] as const);

export const premiumCodeKey = (uid: string) => [SUPPORTER_SCOPE, "code", uid] as const;
