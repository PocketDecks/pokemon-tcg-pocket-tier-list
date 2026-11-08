import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DecksProvider } from "../DecksContext";
import { MetaWindowProvider } from "../MetaWindowContext";
import { useDecks } from "../../app/use-decks";
import rawCards from "../../app/__fixtures__/cards.json";

const premium = vi.hoisted(() => ({ value: true as boolean | null }));

vi.mock("../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => premium.value,
}));

vi.mock("../../app/use-expansions", () => ({ __esModule: true, default: () => [] }));

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);

const Probe = () => <p data-testid="premium">{String(useDecks().isPremium)}</p>;

const renderProbe = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MetaWindowProvider>
        <DecksProvider>
          <Probe />
        </DecksProvider>
      </MetaWindowProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.spyOn(global, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.includes("best-decks")) return jsonResponse([]);
    if (url.includes("meta-share")) return jsonResponse({ decks: [] });
    if (url.includes("matchup-data")) return jsonResponse({});
    return jsonResponse(rawCards);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  premium.value = true;
});

describe("DecksProvider premium status", () => {
  it("exposes a premium viewer", () => {
    premium.value = true;
    renderProbe();

    expect(screen.getByTestId("premium")).toHaveTextContent("true");
  });

  it("exposes a free or signed-out viewer", () => {
    premium.value = false;
    renderProbe();

    expect(screen.getByTestId("premium")).toHaveTextContent("false");
  });

  it("exposes unknown premium status", () => {
    premium.value = null;
    renderProbe();

    expect(screen.getByTestId("premium")).toHaveTextContent("null");
  });
});
