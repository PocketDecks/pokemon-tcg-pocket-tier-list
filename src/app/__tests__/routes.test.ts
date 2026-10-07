import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const loaders = vi.hoisted(() => ({
  loadLandingPage: vi.fn(() => Promise.resolve({ default: {} })),
  loadTierListPage: vi.fn(() => Promise.resolve({ default: {} })),
  loadDeckFinderPage: vi.fn(() => Promise.resolve({ default: {} })),
  loadDeckDetailPage: vi.fn(() => Promise.resolve({ default: {} })),
  loadCardsListPage: vi.fn(() => Promise.resolve({ default: {} })),
  loadExpansionListPage: vi.fn(() => Promise.resolve({ default: {} })),
  loadStatisticsPage: vi.fn(() => Promise.resolve({ default: {} })),
  loadPrivacyPage: vi.fn(() => Promise.resolve({ default: {} })),
  loadAboutPage: vi.fn(() => Promise.resolve({ default: {} })),
  loadFeedbackPage: vi.fn(() => Promise.resolve({ default: {} })),
  loadNotFoundPage: vi.fn(() => Promise.resolve({ default: {} })),
}));

vi.mock("../route-loaders", () => loaders);

let preloadRoute: (pathname: string) => Promise<unknown>;

beforeAll(async () => {
  ({ preloadRoute } = await import("../routes"));
});

describe("preloadRoute", () => {
  beforeEach(() => {
    Object.values(loaders).forEach((loader) => loader.mockClear());
  });

  const cases = [
    ["/", "loadLandingPage"],
    ["/tier-list", "loadTierListPage"],
    ["/cards-list", "loadCardsListPage"],
    ["/expansion-list", "loadExpansionListPage"],
    ["/statistics", "loadStatisticsPage"],
    ["/stats", "loadStatisticsPage"],
    ["/privacy", "loadPrivacyPage"],
    ["/about", "loadAboutPage"],
    ["/feedback", "loadFeedbackPage"],
    ["/404", "loadNotFoundPage"],
    ["/deck", "loadDeckFinderPage"],
    ["/deck/example", "loadDeckDetailPage"],
    ["/unknown", "loadNotFoundPage"],
  ] as const;

  it.each(cases)("maps %s to %s", async (pathname, loaderName) => {
    await preloadRoute(pathname);
    expect(loaders[loaderName]).toHaveBeenCalledOnce();
    expect(Object.entries(loaders).filter(([, loader]) => loader.mock.calls.length)).toHaveLength(1);
  });
});
