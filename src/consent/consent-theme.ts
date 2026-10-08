import type { UIOptions } from "@c15t/ui/theme";
import { themeTokens, type ThemeName } from "../styles/theme-tokens";

const palette = (theme: ThemeName) => ({
  primary: themeTokens[theme].a,
  primaryHover: themeTokens[theme].b,
  surface: themeTokens[theme].bg,
  surfaceHover: themeTokens[theme]["consent-surface-hover"],
  border: themeTokens[theme]["line-strong"],
  borderHover: themeTokens[theme]["white-22"],
  text: themeTokens[theme].text,
  textMuted: themeTokens[theme]["white-66"],
  textOnPrimary: themeTokens[theme]["on-accent"],
  overlay: themeTokens[theme].overlay,
});

const actionButton = {
  fontSize: "var(--c15t-font-size-base)",
  fontWeight: 500,
  minHeight: "4.2rem",
  borderRadius: "1rem",
  whiteSpace: "nowrap",
};

const neutralButtonVariables = {
  "--button-neutral": "var(--c15t-text)",
  "--button-neutral-dark": "var(--c15t-text)",
};

const legalLinkVariables = {
  "--legal-links-color": "var(--a-text)",
  "--legal-links-focus-color-dark": "var(--a-text)",
  "--legal-links-font-size": "var(--c15t-font-size-sm)",
  "--legal-links-text-decoration": "underline",
};

export const consentTheme = (theme: ThemeName): UIOptions => {
  const colors = palette(theme);
  const tokens = themeTokens[theme];

  return {
    // c15t reads this to toggle the `c15t-dark` class on <html>, which is what
    // selects the dark token block. The app drives its own theme through
    // `data-theme`, not a `.dark` class, so the scheme has to be passed
    // explicitly.
    colorScheme: theme,
    theme: {
      colors,
      dark: colors,
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
      // `filled` and `ghost` declare no ring at all, so the accept fill and
      // the ghost borders are the only edges drawn, and c15t's :focus-visible
      // ring is free to show through.
      consentActions: {
        accept: { variant: "primary", mode: "filled" },
        reject: { variant: "neutral", mode: "ghost" },
        customize: { variant: "neutral", mode: "ghost" },
      },
      slots: {
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
            ...neutralButtonVariables,
            outline: "none",
            padding: "2.4rem",
            background: tokens["consent-card"],
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: `1px solid ${tokens["consent-card-border"]}`,
            boxShadow: `0 0.8rem 4rem ${tokens["consent-shadow"]}`,
          },
        },
        consentBannerFooter: {
          style: {
            // The footer ships `background: surfaceHover`, an opaque plate that
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
            marginTop: "0.6rem",
            fontSize: "var(--c15t-font-size-base)",
            lineHeight: 1.55,
          },
        },
        consentDialogCard: {
          style: {
            ...neutralButtonVariables,
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
            border: `1px solid ${tokens["consent-button-border"]}`,
          },
        },
      },
    },
  };
};
