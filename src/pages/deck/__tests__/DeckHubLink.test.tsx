import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import DeckHubLink from "../DeckHubLink";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("DeckHubLink", () => {
  it("links a variant to every variant of its hub", () => {
    render(
      <MemoryRouter>
        <DeckHubLink variant="umbreon-ex-a4-112&greninja-a1-089" />
      </MemoryRouter>
    );
    const link = screen.getByRole("link", { name: "All Umbreon ex variants" });
    expect(link.getAttribute("href")).toBe("/deck/umbreon-ex/");
  });

  it("translates the label into the active language", async () => {
    await i18n.changeLanguage("de");
    render(
      <MemoryRouter>
        <DeckHubLink variant="umbreon-ex-a4-112&greninja-a1-089" />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Alle Varianten von Umbreon ex" })).toBeTruthy();
    await i18n.changeLanguage("en");
  });

  it("renders nothing for a variant outside the archive", () => {
    const { container } = render(
      <MemoryRouter>
        <DeckHubLink variant="does-not-exist" />
      </MemoryRouter>
    );
    expect(container.innerHTML).toBe("");
  });
});
