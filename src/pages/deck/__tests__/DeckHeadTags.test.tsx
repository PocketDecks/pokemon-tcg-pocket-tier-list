import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import {
  friendlyName,
  JA_DECK_DESCRIPTION_SUFFIX,
  JA_DECK_TITLE_SUFFIX,
} from "../../../app/deck-friendly-name";
import DeckHeadTags from "../DeckHeadTags";

const DECKS = [
  { id: "mega-sharpedo-ex-b4-035&chien-pao-ex-b2a-037", name: "mega-sharpedo-ex-b4-035&chien-pao-ex-b2a-037" },
  { id: "greninja-a1-089&mega-absol-ex-b1-151", name: "greninja-a1-089&mega-absol-ex-b1-151" },
  { id: "beautifly-b4-003&dustox-b4-005", name: "beautifly-b4-003&dustox-b4-005" },
];

const renderAt = (entry: string, deck: (typeof DECKS)[number]) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="*" element={<DeckHeadTags deck={deck} />} />
      </Routes>
    </MemoryRouter>
  );

const description = () =>
  document.head.querySelector('meta[name="description"]')?.getAttribute("content");
const ogUrl = () => document.head.querySelector('meta[property="og:url"]')?.getAttribute("content");

describe("DeckHeadTags", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.loadNamespaces("translation");
    await i18n.changeLanguage("en");
  });

  it("keeps the English tags on the English deck page", () => {
    renderAt(`/deck/${DECKS[0].id}`, DECKS[0]);
    expect(document.title).toContain("Top Pocket Decks");
    expect(ogUrl()).toBe(`https://pocketdecks.top/deck/${DECKS[0].id}/`);
  });

  it.each(DECKS)("stamps the prerendered Japanese title for $id", async (deck) => {
    await i18n.changeLanguage("ja");
    renderAt(`/ja/deck/${deck.id}`, deck);

    const stamped = `${friendlyName(deck.id)} ${JA_DECK_TITLE_SUFFIX}`;
    expect(document.title).toBe(stamped);
    expect(document.title).not.toContain("Deck List | Top Pocket Decks");
    expect(description()).toBe(`${friendlyName(deck.id)}${JA_DECK_DESCRIPTION_SUFFIX}`);
    expect(ogUrl()).toBe(`https://pocketdecks.top/ja/deck/${deck.id}/`);
    expect(ogUrl()?.startsWith("https://pocketdecks.top/ja/")).toBe(true);
    expect(document.head.querySelectorAll('meta[property="og:url"]')).toHaveLength(1);

    await i18n.changeLanguage("en");
  });
});
