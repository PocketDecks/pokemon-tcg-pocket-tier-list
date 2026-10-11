/**
 * The deck display name and the Japanese deck-page copy, authored as ESM so
 * src/ can import them directly; the build scripts require() it, which Node
 * supports for ESM without a top-level await.
 */
const isEx = (name) => /\bex$/i.test(name.trim());

const deckNameFromId = (id) => {
  const parts = id.split("-");
  const nameWords = parts.slice(0, -2);
  return nameWords
    .map((w) =>
      w.toLowerCase() === "ex" ? "ex" : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
};

export const friendlyName = (deckName) => {
  const names = deckName.split("&").map((p) => deckNameFromId(p.trim()));
  names.sort((a, b) => Number(isEx(b)) - Number(isEx(a)));
  return names.join(" & ");
};

export const JA_DECK_TITLE_SUFFIX = "| ポケポケ デッキレシピと相性";

export const JA_HOME_LABEL = "ホーム";

export const JA_TIER_LIST_LABEL = "ティアリスト";

export const JA_DECK_DESCRIPTION_SUFFIX =
  "のデッキレシピ、相性、勝率をまとめたページです。ポケモンカードゲーム ポケットの最新環境での立ち回りを確認できます。";
