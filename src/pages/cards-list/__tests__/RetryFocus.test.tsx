import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import CardsListPage from "../CardsListPage";
import ExpansionListPage from "../../expansion-list/ExpansionListPage";

const retryScores = [{ name: "1 A1 225", score: 1, popularity: 0.8 }];

vi.mock("../../../ads/ContentReadyContext", () => ({ useMarkContentReady: vi.fn() }));
vi.mock("../../../components/CardIcon", () => ({ default: ({ card }: { card: { id: string; name: string } }) => <span data-testid={`card-tile-${card.id}`}>{card.name}</span> }));
vi.mock("../../../components/LastUpdated", () => ({ default: () => null }));

afterEach(() => vi.unstubAllGlobals());

describe("Retry focus", () => {
  it.each([
    ["cards", CardsListPage, "good"], ["cards", CardsListPage, "empty"], ["cards", CardsListPage, "error"],
    ["expansions", ExpansionListPage, "good"], ["expansions", ExpansionListPage, "empty"], ["expansions", ExpansionListPage, "error"],
  ] as const)("focuses the %s heading after Retry settles (%#)", async (_name, Page, outcome) => {
    let retried = false;
    const fetchScores = vi.fn(async (url: string) => {
      expect(url).toBe("/data/card-scores.json");
      const succeeds = retried && outcome !== "error";
      const rows = outcome === "good" ? retryScores : [];
      return new Response(JSON.stringify(succeeds ? rows : []), { status: succeeds ? 200 : 503 });
    });
    vi.stubGlobal("fetch", fetchScores);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const user = userEvent.setup();
    const page = render(<QueryClientProvider client={client}><MemoryRouter><Page /></MemoryRouter></QueryClientProvider>);
    try {
      const button = await screen.findByRole("button", { name: "loadError.retry" });
      expect(fetchScores).toHaveBeenCalledTimes(1);
      expect(fetchScores).toHaveBeenNthCalledWith(1, "/data/card-scores.json");
      retried = true;
      await user.click(button);
      await waitFor(() => expect(fetchScores).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
      expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("tabindex", "-1");

      if (outcome === "good") {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        if (_name === "cards") {
          expect(await screen.findByTestId("card-tile-a1-225")).toHaveTextContent("Sabrina");
        } else {
          expect(await screen.findByRole("link", { name: "Genetic Apex" })).toBeInTheDocument();
        }
      } else if (outcome === "empty") {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByText(_name === "cards" ? "No cards found" : "No decks found")).toBeInTheDocument();
      } else {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        const retryAgain = screen.getByRole("button", { name: "loadError.retry" });
        expect(retryAgain).toBeEnabled();
        await user.click(retryAgain);
        await waitFor(() => expect(fetchScores).toHaveBeenCalledTimes(3));
        await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "loadError.retry" })).toBeEnabled();
      }
    } finally {
      page.unmount();
      client.clear();
    }
  });
});
