import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import ExpansionListPage from "../ExpansionListPage";

const state = vi.hoisted(() => ({
  cards: [] as unknown[],
  expansions: [] as unknown[],
}));

const setFixture = (id: string, name: string, image: string) => {
  setPacksFixture(id, name, [image]);
};

const setPacksFixture = (id: string, name: string, images: string[]) => {
  const packs = images.map((image, index) => ({
    id: `${id}-pack-${index + 1}`,
    name: `Pack ${index + 1}`,
    image,
  }));
  state.cards = packs.map((pack) => ({ id: `${pack.id}-001`, name: "Volbeat", set: id, pack: pack.name, score: 0.8 }));
  state.expansions = [{ id, name, packs }];
};

vi.mock("../../../app/use-cards", () => ({
  __esModule: true,
  default: () => state.cards,
}));

vi.mock("../../../app/use-expansions", () => ({
  __esModule: true,
  default: () => state.expansions,
}));

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

const LocationSearch = () => <span data-testid="search">{useLocation().search}</span>;

const renderPage = (path = "/expansion-list/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ExpansionListPage />
      <LocationSearch />
    </MemoryRouter>
  );

const expansionLinks = (container: HTMLElement) =>
  container.querySelectorAll('a[href^="/expansion-list/"]');

describe("ExpansionListPage", () => {
  beforeEach(() => {
    setFixture("b4a", "Team Rocket's Ambition", "b4a.webp");
  });

  it("renders expansion tiers by default", () => {
    const { container } = renderPage();

    expect(screen.getByText("S")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "b4a.webp");
    expect(screen.getByRole("button", { name: "expansionList.viewExpansions" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "expansionList.viewPacks" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("links an expansion tile to its page by name", () => {
    setFixture("c1", "Dual Fusion", "c1.webp");
    const { container } = renderPage();

    expect(container.querySelector('a[href="/expansion-list/c1"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "Dual Fusion" })).toHaveAttribute("href", "/expansion-list/c1");
  });

  it("stacks up to three pack images into a multi-pack expansion tile", () => {
    setPacksFixture("c1", "Dual Fusion", ["a.webp", "b.webp", "c.webp", "d.webp"]);
    renderPage();

    const images = screen.getByRole("link", { name: "Dual Fusion" }).querySelectorAll("img");
    expect(Array.from(images, (image) => image.getAttribute("src"))).toEqual(["c.webp", "b.webp", "a.webp"]);
  });

  it("omits a deluxe expansion from the expansions view", () => {
    setFixture("b4b", "Deluxe Pack: Mega", "b4b.webp");
    const { container } = renderPage();

    expect(container.querySelector('img[src="b4b.webp"]')).toBeNull();
    expect(expansionLinks(container)).toHaveLength(0);
  });

  it("shows every pack in the packs view without expansion links", () => {
    setPacksFixture("c1", "Dual Fusion", ["c1-a.webp", "c1-b.webp"]);
    const { container } = renderPage("/expansion-list/?view=packs");

    expect(screen.getByRole("img", { name: "Dual Fusion: Pack 1" })).toHaveAttribute("src", "c1-a.webp");
    expect(screen.getByRole("img", { name: "Dual Fusion: Pack 2" })).toHaveAttribute("src", "c1-b.webp");
    expect(expansionLinks(container)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "expansionList.viewPacks" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("switches views through the URL query", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByRole("button", { name: "expansionList.viewPacks" }));
    expect(screen.getByTestId("search")).toHaveTextContent("?view=packs");
    expect(expansionLinks(container)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "expansionList.viewExpansions" }));
    expect(screen.getByTestId("search")).toHaveTextContent(/^$/);
    expect(expansionLinks(container)).toHaveLength(1);
  });
});
