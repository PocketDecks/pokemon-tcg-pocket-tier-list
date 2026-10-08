import { ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ConsentBanner,
  ConsentDialog,
  ConsentManagerProvider,
  type ConsentManagerOptions,
} from "@c15t/react";
import { gtag } from "@c15t/scripts/google-tag";
import { policyPackPresets, type PolicyConfig } from "c15t";
import { useAppVisible } from "../app/use-app-visible";
import "../styles/layers.css";
import "@c15t/react/styles.css";
import "./consent-overrides.css";
import { GOOGLE_GTAG } from "../app/constants";
import { consentTheme } from "./consent-theme";
import { toConsentLanguage } from "./consent-language";
import { consentMessages } from "./consent-messages";
import { resolveVisitorRegion, type VisitorRegion } from "./visitor-region";
import { EUROPE_OPT_IN_EXTRA_COUNTRIES } from "./policy-countries.mjs";

// During the postbuild route prerender, c15t portals <ConsentBanner/> to
// document.body — outside #root. The client uses createRoot (not hydrateRoot),
// so it never adopts that prerendered markup and a second, handler-less banner
// is frozen on screen forever (and on reload-with-consent-stored it is the ONLY
// copy, so Accept/Reject/Personalise do nothing). Skip the banner while the
// prerenderer drives the page so it stays out of the static HTML; the live
// client still renders it.
const isPrerender =
  typeof navigator !== "undefined" && navigator.userAgent === "prerender-routes";

// c15t injects gtag, sets Consent Mode v2 to denied by default and pushes the
// update when a visitor chooses. Registering both categories lets one gtag
// cover analytics (measurement) and the ad signals (marketing), so accepting
// marketing grants ad_storage and ads can personalise. The loader is injected
// once; the second entry only adds the marketing consent mapping. AdSense loads
// on its own path so the premium and content-ready gates still apply.
const scripts = [
  gtag({ id: GOOGLE_GTAG, category: "measurement" }),
  gtag({ id: GOOGLE_GTAG, category: "marketing" }),
];

const readVisitorRegion = (): VisitorRegion | null => {
  try {
    return resolveVisitorRegion({
      cookie: document.cookie,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch {
    return null;
  }
};

const europeOptIn = policyPackPresets.europeOptIn();
const europe: PolicyConfig = {
  ...europeOptIn,
  match: {
    ...europeOptIn.match,
    countries: [...(europeOptIn.match.countries ?? []), ...EUROPE_OPT_IN_EXTRA_COUNTRIES],
  },
  consent: {
    ...europeOptIn.consent,
    categories: ["necessary", "measurement"],
    scopeMode: "strict",
  },
};

const canada: PolicyConfig = {
  ...policyPackPresets.quebecOptIn(),
  id: "canada_opt_in",
  match: { countries: ["CA"] },
};

const policyPacks: PolicyConfig[] = [
  europe,
  policyPackPresets.quebecOptIn(),
  canada,
  policyPackPresets.californiaOptOut(),
  policyPackPresets.worldNoBanner(),
];

const visitorRegion = readVisitorRegion();

const consentOptions: ConsentManagerOptions = {
  mode: "offline",
  offlinePolicy: { policyPacks },
  scripts,
  legalLinks: { privacyPolicy: { href: "/privacy/", target: "_self" } },
  i18n: { locale: "en", messages: consentMessages },
  ...consentTheme,
};

const ConsentProvider = ({ children }: { children: ReactNode }) => {
  const appVisible = useAppVisible();
  const { i18n } = useTranslation();
  const options = useMemo<ConsentManagerOptions>(
    () => ({
      ...consentOptions,
      overrides: { ...visitorRegion, language: toConsentLanguage(i18n.language) },
    }),
    [i18n.language]
  );

  return (
    <ConsentManagerProvider options={options}>
      {children}
      {appVisible && !isPrerender ? (
        <>
          <ConsentBanner
            hideBranding={!import.meta.env.DEV}
            legalLinks={["privacyPolicy"]}
          />
          {/* "Customize" only flips the store's activeUI to "dialog", which
              hides the banner. Without this mounted the banner simply
              disappears and the visitor has no way back to the categories. */}
          <ConsentDialog
            hideBranding={!import.meta.env.DEV}
            legalLinks={["privacyPolicy"]}
            models={["opt-in", "opt-out", null]}
          />
        </>
      ) : null}
    </ConsentManagerProvider>
  );
};

export default ConsentProvider;
