// ESM so src/ can import it and the build scripts can require() it.
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

export const JA_HUB_TITLE_SUFFIX = "デッキ | ポケポケ デッキレシピと相性";

export const JA_HUB_LIVE_DESCRIPTION_SUFFIX =
  "のデッキバリエーション、勝率、メタシェアをまとめたページです。現在の大会データをもとに、最新環境の立ち回りを確認できます。";

export const JA_HUB_RETIRED_DESCRIPTION_SUFFIX =
  "のデッキ履歴をまとめたページです。過去に確認されたバリエーションの期間、ピークのシェア、代表的なカードを確認できます。";

export const hubHead = (name, status, translated) => {
  if (translated) {
    const suffix = {
      live: JA_HUB_LIVE_DESCRIPTION_SUFFIX,
      retired: JA_HUB_RETIRED_DESCRIPTION_SUFFIX,
      unknown: "のデッキバリエーションと履歴をまとめたページです。",
    }[status];
    return { title: `${name} ${JA_HUB_TITLE_SUFFIX}`, description: `${name}${suffix}` };
  }
  const description = {
    live: `${name} Pokemon TCG Pocket deck variants, win rates and meta share from current tournament data.`,
    retired: `${name} Pokemon TCG Pocket deck history. This archetype is not in the current meta.`,
    unknown: `${name} Pokemon TCG Pocket deck variants and history.`,
  }[status];
  return { title: `${name} Deck | Pokemon TCG Pocket`, description };
};
