import { ReactNode } from "react";
import { ConsentBanner, ConsentDialog, ConsentManagerProvider } from "@c15t/react";
import { gtag } from "@c15t/scripts/google-tag";
import { useAppVisible } from "../app/app-bootstrap";
// Import the real component stylesheet directly. The @c15t/react/styles.css
// entrypoint only re-@imports this via a bare specifier, which CRA's css-loader
// does not resolve, so the prebuilt styles never load through it.
import "@c15t/ui/styles.css";
import "./consent-overrides.css";
import { GOOGLE_GTAG } from "../app/constants";
import { consentTheme } from "./consent-theme";

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

const ConsentProvider = ({ children }: { children: ReactNode }) => {
  const appVisible = useAppVisible();

  return (
    <ConsentManagerProvider options={{ mode: "offline", scripts, ...consentTheme }}>
      {children}
      {appVisible && !isPrerender ? (
        <>
          <ConsentBanner hideBranding={!import.meta.env.DEV} />
          <ConsentDialog />
        </>
      ) : null}
    </ConsentManagerProvider>
  );
};

export default ConsentProvider;
