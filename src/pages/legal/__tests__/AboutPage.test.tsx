import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import AboutPage from "../AboutPage";

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="*" element={<AboutPage />} />
      </Routes>
    </MemoryRouter>
  );

const tierListLink = () => screen.getByRole("link", { name: /deck tier list/i });

describe("AboutPage", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.loadNamespaces("seo");
    await i18n.changeLanguage("en");
  });

  it("sends the tier list link to the tier list", () => {
    renderAt("/about");
    expect(tierListLink()).toHaveAttribute("href", "/tier-list/");
  });

  it("keeps the tier list link inside the Japanese tree", () => {
    renderAt("/ja/about");
    expect(tierListLink()).toHaveAttribute("href", "/ja/tier-list/");
  });

  it("keeps the Premium anchor and discloses the GBP limit and review path", () => {
    renderAt("/about#premium");
    expect(document.getElementById("premium")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /ko-fi/i });
    expect(link).toHaveAttribute("href", "https://ko-fi.com/dalin");
    const article = screen.getByRole("article");
    expect(article).toHaveTextContent(/eligible GBP tips/i);
    expect(article).toHaveTextContent(/one calendar month per whole pound/i);
    expect(article).toHaveTextContent(/up to 120 months per tip/i);
    expect(article).toHaveTextContent(/GBP £121 or more/i);
    expect(article).toHaveTextContent(/other currencies need review/i);
    expect(article).toHaveTextContent(/grant no Premium automatically/i);
    expect(article).toHaveTextContent(/use code matching in the Premium popup or contact us/i);
  });
});
