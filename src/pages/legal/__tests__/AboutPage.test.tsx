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

  it("keeps the Premium anchor and links to Ko-fi with the monthly tip rule", () => {
    renderAt("/about#premium");
    expect(document.getElementById("premium")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /ko-fi/i });
    expect(link).toHaveAttribute("href", "https://ko-fi.com/dalin");
    expect(screen.getByText(/whole GBP 1 buys one calendar month/i)).toBeInTheDocument();
  });
});
