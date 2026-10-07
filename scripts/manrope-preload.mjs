export const replaceManropePreload = (html, fontFileName) =>
  html.replace(
    "__MANROPE_LATIN_PRELOAD__",
    `/${fontFileName}`
  );
