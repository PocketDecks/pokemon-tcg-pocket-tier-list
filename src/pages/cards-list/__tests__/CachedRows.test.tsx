import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import CardsListPage from "../CardsListPage";
import ExpansionListPage from "../../expansion-list/ExpansionListPage";

vi.mock("../../../app/use-cards", () => ({ default: () => ({ cards: [{ id: "b4a-001", name: "Volbeat", set: "b4a", pack: "Booster", score: 1 }], error: new Error("503"), retry: vi.fn() }) }));
vi.mock("../../../app/use-expansions", () => ({ default: () => [{ id: "b4a", name: "Rocket", packs: [{ id: "booster", name: "Booster", image: "rocket.webp" }] }] }));
vi.mock("../../../ads/ContentReadyContext", () => ({ useMarkContentReady: vi.fn() }));
vi.mock("../../../components/CardIcon", () => ({ default: () => <span>Volbeat row</span> }));
vi.mock("../../../components/LastUpdated", () => ({ default: () => null }));

describe("cached rankings", () => {
  it.each([["cards", CardsListPage], ["expansions", ExpansionListPage]] as const)("keeps the grid and a non-blocking retry line for %s", (_name, Page) => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("loadError.message");
    expect(screen.getByRole("button", { name: "loadError.retry" })).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
  });
});
