import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import CardsListPage from "../CardsListPage";
import ExpansionListPage from "../../expansion-list/ExpansionListPage";
import committedScores from "../../../../public/data/card-scores.json";

vi.mock("../../../ads/ContentReadyContext", () => ({ useMarkContentReady: vi.fn() }));
vi.mock("../../../components/CardIcon", () => ({ default: () => <span>card row</span> }));
vi.mock("../../../components/LastUpdated", () => ({ default: () => null }));

afterEach(() => vi.unstubAllGlobals());

describe("Retry focus", () => {
  it.each([
    ["cards", CardsListPage, "good"], ["cards", CardsListPage, "empty"], ["cards", CardsListPage, "error"],
    ["expansions", ExpansionListPage, "good"], ["expansions", ExpansionListPage, "empty"], ["expansions", ExpansionListPage, "error"],
  ] as const)("focuses the %s heading after Retry settles (%#)", async (_name, Page, outcome) => {
    let retried = false;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(retried && outcome === "good" ? committedScores : []), { status: retried && outcome !== "error" ? 200 : 503 })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const user = userEvent.setup();
    const page = render(<QueryClientProvider client={client}><MemoryRouter><Page /></MemoryRouter></QueryClientProvider>);
    try {
      const button = await screen.findByRole("button", { name: "loadError.retry" });
      retried = true;
      await user.click(button);
      await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());
      expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("tabindex", "-1");
    } finally {
      page.unmount();
      client.clear();
    }
  });
});
