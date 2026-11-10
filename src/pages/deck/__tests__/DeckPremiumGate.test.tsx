import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import DeckPremiumGate from "../DeckPremiumGate";

const renderGate = (path = "/deck/x-a1-001") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DeckPremiumGate />
    </MemoryRouter>
  );

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("DeckPremiumGate", () => {
  it("names the reason in a title and one line", () => {
    renderGate();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "This deck only appears in a Premium window"
    );
    expect(
      screen.getByText("It is listed in the 30 day and all time views, which are part of Premium.")
    ).toBeInTheDocument();
  });

  it("links to the Premium section of the about page", () => {
    renderGate();

    expect(screen.getByRole("link", { name: "See Premium" })).toHaveAttribute("href", "/about/#premium");
  });

  it("keeps the locale prefix on the link", () => {
    renderGate("/ja/deck/x-a1-001");

    expect(screen.getByRole("link")).toHaveAttribute("href", "/ja/about/#premium");
  });

  it("shows no deck statistics", () => {
    renderGate();

    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
