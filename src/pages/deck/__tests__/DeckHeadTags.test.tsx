import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import DeckHeadTags from "../DeckHeadTags";

const deck = { id: "venusaur-a1-004&bulbasaur-a1-001", name: "venusaur-a1-004&bulbasaur-a1-001" };

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="*" element={<DeckHeadTags deck={deck} />} />
      </Routes>
    </MemoryRouter>
  );

const ogUrl = () => document.head.querySelector('meta[property="og:url"]')?.getAttribute("content");

describe("DeckHeadTags", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.loadNamespaces("translation");
    await i18n.changeLanguage("en");
  });

  it("keeps the English tags on the English deck page", () => {
    renderAt(`/deck/${deck.id}`);
    expect(ogUrl()).toBe(`https://pocketdecks.top/deck/${deck.id}/`);
    expect(document.title).toContain("Top Pocket Decks");
  });

  it("points a Japanese deck page at its own URL and leaves the Japanese title standing", async () => {
    await i18n.changeLanguage("ja");
    renderAt(`/ja/deck/${deck.id}`);

    expect(ogUrl()).toBe(`https://pocketdecks.top/ja/deck/${deck.id}/`);
    expect(ogUrl()?.startsWith("https://pocketdecks.top/ja/")).toBe(true);
    expect(document.title).not.toContain("Deck List | Top Pocket Decks");
    expect(
      document.head.querySelector('meta[name="description"]')
    ).toBeNull();

    await i18n.changeLanguage("en");
  });
});
