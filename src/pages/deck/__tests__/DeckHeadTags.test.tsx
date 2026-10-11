import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import DeckHeadTags from "../DeckHeadTags";

// Literal expectations on purpose: deriving them from the shared helpers would
// make the test agree with the code by construction.
const DECKS = [
  {
    id: "mega-sharpedo-ex-b4-035&chien-pao-ex-b2a-037",
    name: "mega-sharpedo-ex-b4-035&chien-pao-ex-b2a-037",
    title: "Mega Sharpedo ex & Chien Pao ex | ポケポケ デッキレシピと相性",
    description:
      "Mega Sharpedo ex & Chien Pao exのデッキレシピ、相性、勝率をまとめたページです。ポケモンカードゲーム ポケットの最新環境での立ち回りを確認できます。",
  },
  {
    id: "greninja-a1-089&mega-absol-ex-b1-151",
    name: "greninja-a1-089&mega-absol-ex-b1-151",
    title: "Mega Absol ex & Greninja | ポケポケ デッキレシピと相性",
    description:
      "Mega Absol ex & Greninjaのデッキレシピ、相性、勝率をまとめたページです。ポケモンカードゲーム ポケットの最新環境での立ち回りを確認できます。",
  },
  {
    id: "beautifly-b4-003&dustox-b4-005",
    name: "beautifly-b4-003&dustox-b4-005",
    title: "Beautifly & Dustox | ポケポケ デッキレシピと相性",
    description:
      "Beautifly & Dustoxのデッキレシピ、相性、勝率をまとめたページです。ポケモンカードゲーム ポケットの最新環境での立ち回りを確認できます。",
  },
];

const renderAt = (entry: string, deck: (typeof DECKS)[number]) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="*" element={<DeckHeadTags deck={deck} />} />
      </Routes>
    </MemoryRouter>
  );

const meta = (selector: string) =>
  document.head.querySelector(selector)?.getAttribute("content");

describe("DeckHeadTags", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.loadNamespaces("translation");
    await i18n.changeLanguage("en");
  });

  it("keeps the English tags on the English deck page", () => {
    renderAt(`/deck/${DECKS[0].id}`, DECKS[0]);
    expect(document.title).toContain("Top Pocket Decks");
    expect(meta('meta[property="og:url"]')).toBe(
      `https://pocketdecks.top/deck/${DECKS[0].id}/`
    );
  });

  it.each(DECKS)("stamps the prerendered Japanese head for $id", async (deck) => {
    await i18n.changeLanguage("ja");
    renderAt(`/ja/deck/${deck.id}`, deck);

    expect(document.title).toBe(deck.title);
    expect(document.title).not.toContain("Deck List | Top Pocket Decks");
    expect(meta('meta[name="description"]')).toBe(deck.description);
    expect(meta('meta[property="og:title"]')).toBe(deck.title);
    expect(meta('meta[property="og:description"]')).toBe(deck.description);
    expect(meta('meta[property="og:url"]')).toBe(
      `https://pocketdecks.top/ja/deck/${deck.id}/`
    );
    expect(document.head.querySelectorAll('meta[property="og:url"]')).toHaveLength(1);

    await i18n.changeLanguage("en");
  });
});
