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

export const consentTheme: UIOptions = {
  colorScheme: "dark",
  theme: {
    colors: dark,
    dark,
    typography: {
      fontFamily:
        '"Manrope Variable", "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif',
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
    // not — it survives as a hard opaque outline inside each button, which is
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
          // c15t's own footer padding lives in @layer components and loses the
          // cascade to the app's unlayered `* { padding: 0 }` reset, which is
          // why the row otherwise butts straight against the description.
          paddingTop: "1.6rem",
        },
      },
    },
  },
};
