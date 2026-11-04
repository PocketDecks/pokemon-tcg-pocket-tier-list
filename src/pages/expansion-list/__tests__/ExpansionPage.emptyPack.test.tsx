const i18nReady = vi.hoisted(async () => {
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  const en = (await import("../../../locales/en_translation.json")).default;
  await i18next.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import ExpansionPage from "../ExpansionPage";

const card = {
  id: "b2-001",
  name: "Charizard Card",
  rarity: "Common",
  pack: "Charizard",
  type: "Pokemon",
  supertype: "Pokemon",
  health: 100,
  stage: "Basic",
  image: "/cards/b2-001.webp",
  ex: false,
  set: "b2",
  deckBuilderNr: 1,
};

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [
    {
      id: "b2",
      name: "Wisdom of Sea and Sky",
      release_date: null,
      packs: [
        { id: "b2-charizard", name: "Charizard", image: null },
        { id: "b2-pikachu", name: "Pikachu", image: null },
      ],
    },
  ],
}));

vi.mock("../../../app/use-decks", () => ({
  useDecks: () => ({
    decks: [],
    rawDecks: [{ name: "charizard-b2-001", lists: [{ score: 1, cards: ["2:b2-001"] }] }],
    metaShareBySlug: null,
    loading: false,
    error: null,
  }),
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

const renderAt = (path: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(["cards"], { cards: [card] });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/expansion-list/:expansionId" element={<ExpansionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("ExpansionPage filtered to a pack with no matching cards", () => {
  it("names the pack in the empty state and keeps the aside line", async () => {
    await i18nReady;
    renderAt("/expansion-list/b2?pack=pikachu");

    expect(
      screen.getByText("None of the Pikachu pack or shared cards are in a top deck right now.", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText(/That's unfortunate/)).toBeInTheDocument();
  });

  it("shows the set's cards and no pack wording when no pack is filtered", async () => {
    await i18nReady;
    renderAt("/expansion-list/b2");

    expect(screen.getByText("Charizard Card")).toBeInTheDocument();
    expect(screen.queryByText(/None of the Pikachu pack/)).toBeNull();
  });
});
