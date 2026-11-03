export const deckSlug = (name) =>
  name
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9&\s-]/g, "")
    .replace(/\s/g, "-")
    .replace(/-+/g, "-");
