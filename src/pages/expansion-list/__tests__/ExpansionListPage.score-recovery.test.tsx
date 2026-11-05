import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import ExpansionListPage from "../ExpansionListPage";

const retry = vi.fn();

vi.mock("../../../app/use-cards", () => ({
  default: () => ({
    cards: null,
    error: new Error("Card score payload is not an array"),
    retry,
  }),
}));

vi.mock("../../../app/use-expansions", () => ({
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
  useMarkContentReady: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("ExpansionListPage score recovery", () => {
  beforeEach(() => retry.mockClear());

  it.each(["/expansion-list", "/expansion-list?view=packs"])("keeps disabled view options with the error at %s", (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <ExpansionListPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("loadError.title")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    const toggle = screen.getByRole("group", { name: "expansionList.viewLabel" });
    for (const button of within(toggle).getAllByRole("button")) expect(button).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "loadError.retry" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
