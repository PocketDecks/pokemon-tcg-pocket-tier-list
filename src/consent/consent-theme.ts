import type { UIOptions } from "@c15t/ui/theme";

// The site sets a 10px root font size, so c15t's rem-based defaults (base
// 1rem) render at ~10px and look cramped. These tokens restyle the banner to
// the app's own scale and dark palette. Values are rem against the 10px root,
// matching the rest of the UI.
const dark = {
  primary: "#FFBF7E",
  primaryHover: "#FFDF80",
  surface: "#1A1A17",
  surfaceHover: "#26241F",
  border: "rgba(255, 255, 255, 0.12)",
  borderHover: "rgba(255, 255, 255, 0.22)",
  text: "#FFFFFF",
  textMuted: "rgba(255, 255, 255, 0.66)",
  textOnPrimary: "#1A1A17",
  overlay: "rgba(0, 0, 0, 0.6)",
};

const actionButton = {
  fontSize: "var(--c15t-font-size-base)",
  fontWeight: 500,
  minHeight: "4.2rem",
  borderRadius: "1rem",
  whiteSpace: "nowrap",
};

const legalLinkVariables = {
  "--legal-links-color": "var(--c15t-primary)",
  "--legal-links-focus-color-dark": "var(--c15t-primary)",
  "--legal-links-font-size": "var(--c15t-font-size-sm)",
  "--legal-links-text-decoration": "underline",
};

export const consentTheme: UIOptions = {
  colorScheme: "dark",
  theme: {
    colors: dark,
    dark,
    typography: {
      fontFamily:
        '"Manrope Variable", "Manrope", "Manrope Fallback", system-ui, -apple-system, "Segoe UI", sans-serif',
      fontSize: { sm: "1.4rem", base: "1.6rem", lg: "2.2rem" },
    },
    spacing: {
      xs: "0.6rem",
      sm: "1rem",
      md: "1.6rem",
      lg: "2.4rem",
      xl: "3.2rem",
    },
    radius: { sm: "0.8rem", md: "1.2rem", lg: "1.6rem", full: "9999px" },
    // Every action defaults to `stroke`, which paints an opaque `surface` fill
    // and an inset 1px ring in `surfaceHover`. The ring is a hard opaque
    // outline inside each button, which is the last thing a glass panel wants.
    // `filled` and `ghost` declare no ring at all, so the accept gradient and
    // the ghost borders are the only edges drawn, and c15t's :focus-visible
    // ring is free to show through.
    consentActions: {
      accept: { variant: "primary", mode: "filled" },
      reject: { variant: "neutral", mode: "ghost" },
      customize: { variant: "neutral", mode: "ghost" },
    },
    slots: {
      // The banner is position:fixed;bottom:0, which ignores the body's
      // padding-bottom that reserves space for the sticky AdAnchor bar. Offset it by
      // the same --ad-anchor-h so its buttons never sit under the ad bar on mobile
      // (where both occupy the bottom strip). The banner is portaled to <body> while
      // the AdAnchor lives inside #root, so a modest z-index on the banner can still
      // lose a stacking-context comparison against the anchor; pin it to the maximum
      // so it unambiguously wins regardless of context. Do NOT downgrade c15t's own
      // banner z-index (it ships 999999998) — that only weakens the stack.
      //
      // Set on the banner's own root only: the dialog and the widget switches share
      // the c15t root class prefix, and the dialog overlay is a full-viewport
      // inset:0 layer that must not be lifted off the bottom edge.
      consentBanner: {
        style: {
          bottom: "var(--ad-anchor-h, 0px)",
          zIndex: 2147483647,
          "--consent-banner-max-width": "54rem",
          ...legalLinkVariables,
        },
      },
      consentBannerCard: {
        style: {
          background: "rgba(26, 26, 23, 0.72)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 0.8rem 4rem rgba(0, 0, 0, 0.45)",
        },
      },
      consentBannerFooter: {
        style: {
          // The footer ships `background: surfaceHover` — an opaque plate that
          // sits on the blurred card and reads as a hard-edged rectangle
          // around the button row. The glass is the background here.
          background: "transparent",
          gap: "1rem",
        },
      },
      consentBannerTitle: {
        style: {
          fontSize: "var(--c15t-font-size-lg)",
          fontWeight: 600,
        },
      },
      consentBannerDescription: {
        style: {
          fontSize: "var(--c15t-font-size-base)",
          lineHeight: 1.55,
        },
      },
      consentDialogCard: {
        style: {
          "--consent-dialog-max-width": "44rem",
          ...legalLinkVariables,
        },
      },
      consentDialogTitle: {
        style: {
          fontSize: "var(--c15t-font-size-lg)",
          fontWeight: 600,
        },
      },
      consentWidget: {
        style: {
          "--consent-widget-accordion-stack-gap": "1.2rem",
          "--consent-widget-accordion-icon-size": "2.4rem",
          "--accordion-icon-size": "2.4rem",
        },
      },
      buttonPrimary: {
        style: actionButton,
      },
      buttonSecondary: {
        style: {
          ...actionButton,
          border: "1px solid rgba(255, 255, 255, 0.28)",
        },
      },
    },
  },
};
