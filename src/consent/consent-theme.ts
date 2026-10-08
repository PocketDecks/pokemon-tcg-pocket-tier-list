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

export const consentTheme = (theme: ThemeName): UIOptions => {
  const colors = palette(theme);

  return {
    // c15t reads this to toggle the `c15t-dark` class on <html>, which is what
    // selects the dark token block. The app drives its own theme through
    // `data-theme`, not a `.dark` class, so the scheme has to be passed
    // explicitly; left undefined, c15t only watches for a `.dark` class that
    // never appears and the banner would sit on the default light tokens.
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
      // and an inset 1px ring in `surfaceHover`. The fill is already flattened by
      // the app's global `button { background: none }` reset, but the ring is
      // not: it survives as a hard opaque outline inside each button, which is
      // the last thing a glass panel wants. `filled` and `ghost` declare no ring
      // at all, so the accept gradient and the ghost borders below are the only
      // edges drawn, and c15t's :focus-visible ring is free to show through.
      consentActions: {
        accept: { variant: "primary", mode: "filled" },
        reject: { variant: "neutral", mode: "ghost" },
        customize: { variant: "neutral", mode: "ghost" },
      },
      slots: {
        consentBannerCard: {
          style: {
            background: themeTokens[theme]["consent-card"],
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: `1px solid ${themeTokens[theme]["consent-card-border"]}`,
            boxShadow: `0 0.8rem 4rem ${themeTokens[theme]["consent-shadow"]}`,
          },
        },
        consentBannerFooter: {
          style: {
            // The footer ships `background: surfaceHover`, an opaque plate that
            // sits on the blurred card and reads as a hard-edged rectangle
            // around the button row. The glass is the background here.
            background: "transparent",
            // c15t's own footer padding lives in @layer components and loses the
            // cascade to the app's unlayered `* { padding: 0 }` reset, which is
            // why the row otherwise butts straight against the description.
            paddingTop: "1.6rem",
          },
        },
      },
    },
  };
};
