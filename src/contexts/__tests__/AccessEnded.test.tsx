import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FilterContextProvider from "../../components/FilterContext";
import useFilters from "../../app/use-filters";
import { SortBy } from "../../app/sort-by";
import { FREE_DECK_AMOUNT } from "../../app/constants";
import { decksKey, matchupsKey } from "../../app/query-keys";
import AccessEnded from "../AccessEnded";
import { EntitlementProvider } from "../EntitlementContext";
import { MetaWindowProvider, useMetaWindow } from "../MetaWindowContext";

// `premium` stands in for the entitlement until a test sets it to "real".
const access = vi.hoisted(() => ({ premium: true as boolean | null | "real" }));
const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  getFirestore: vi.fn(() => ({})),
}));

vi.mock("firebase/firestore/lite", () => firestore);
vi.mock("../../config/firebase", () => ({ default: { name: "app" } }));
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" }, loading: false }),
}));
vi.mock("../../app/use-is-premium", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../app/use-is-premium")>();
  return {
    ...actual,
    default: () => (access.premium === "real" ? actual.default() : access.premium),
  };
});

const Probe = () => {
  const { window } = useMetaWindow();
  const { energy, deckAmount, sortBy, includeEx, setEnergy, setDeckAmount, setSortBy, setIncludeEx } =
    useFilters();
  return (
    <div>
      <p data-testid="window">{window}</p>
      <p data-testid="filters">{JSON.stringify({ energy, deckAmount, sortBy, includeEx })}</p>
      <button
        onClick={() => {
          setEnergy("Fire");
          setDeckAmount(100);
          setSortBy(SortBy.POPULARITY);
          setIncludeEx(false);
        }}
      >
        filter
      </button>
    </div>
  );
};

let client: QueryClient;

const tree = () => (
  <QueryClientProvider client={client}>
    <FilterContextProvider>
      <EntitlementProvider>
        <MetaWindowProvider>
          <AccessEnded />
          <Probe />
        </MetaWindowProvider>
      </EntitlementProvider>
    </FilterContextProvider>
  </QueryClientProvider>
);

const defaults = JSON.stringify({
  energy: null,
  deckAmount: FREE_DECK_AMOUNT,
  sortBy: SortBy.POWER,
  includeEx: true,
});

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  access.premium = true;
  firestore.getDoc.mockResolvedValue({ exists: () => false });
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  client.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
  window.history.pushState({}, "", "/");
});

describe("when Supporter access ends", () => {
  it("moves a free viewer off a Supporter window named in the URL", () => {
    access.premium = false;
    window.history.pushState({}, "", "/deck/x-a1-001?window=30d");
    render(tree());

    expect(screen.getByTestId("window")).toHaveTextContent("20d");
  });

  it("keeps a Supporter window while access is unknown or granted", () => {
    window.history.pushState({}, "", "/?window=all");
    access.premium = null;
    const view = render(tree());
    expect(screen.getByTestId("window")).toHaveTextContent("all");

    access.premium = true;
    view.rerender(tree());
    expect(screen.getByTestId("window")).toHaveTextContent("all");
  });

  it("resets the window, the Supporter-only tier list filters and Supporter queries", async () => {
    window.history.pushState({}, "", "/?window=30d");
    client.setQueryData(decksKey("30d"), "supporter decks");
    client.setQueryData(matchupsKey("20d"), "public matchups");
    const view = render(tree());
    await userEvent.click(screen.getByText("filter"));
    expect(screen.getByTestId("filters")).not.toHaveTextContent(defaults);

    access.premium = false;
    view.rerender(tree());

    expect(screen.getByTestId("window")).toHaveTextContent("20d");
    expect(screen.getByTestId("filters")).toHaveTextContent(defaults);
    expect(client.getQueryData(decksKey("30d"))).toBeUndefined();
    expect(client.getQueryData(matchupsKey("20d"))).toBe("public matchups");
  });

  it("does the same when a grant expires while the page is open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    access.premium = "real";
    client.setQueryData(["entitlement", "u1"], { premium: true, expiresAtMs: Date.now() + 1_000 });
    window.history.pushState({}, "", "/?window=all");
    render(tree());
    act(() => screen.getByText("filter").click());
    expect(screen.getByTestId("window")).toHaveTextContent("all");
    expect(screen.getByTestId("filters")).not.toHaveTextContent(defaults);

    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(screen.getByTestId("window")).toHaveTextContent("20d");
    expect(screen.getByTestId("filters")).toHaveTextContent(defaults);
  });
});
