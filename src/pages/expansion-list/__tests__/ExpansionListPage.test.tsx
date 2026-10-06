import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExpansionListPage from "../ExpansionListPage";

vi.mock("../../../app/use-cards", () => ({
  __esModule: true,
  default: () => [
    {
      id: "b4a-001",
      name: "Volbeat",
      set: "b4a",
      pack: "Team Rocket's Ambition",
      score: 0.8,
    },
  ],
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => [
    {
      id: "b4a",
      name: "Team Rocket's Ambition",
      packs: [
        {
          id: "b4a-booster",
          name: "Booster",
          image: "b4a.webp",
        },
      ],
    },
  ],
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

describe("ExpansionListPage", () => {
  it("renders pack tiers without deck data", () => {
    render(<ExpansionListPage />);

    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "b4a.webp");
  });
});
