import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import HomeBanner from "../HomeBanner";

vi.mock("../../app/last-updated", () => ({
  LAST_UPDATED: new Date("2026-10-06T00:00:00.000Z"),
}));

describe("HomeBanner", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.changeLanguage("en");
    await i18n.loadNamespaces("translation");
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("shows the rankings date without an expansion name", () => {
    render(<HomeBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("Rankings are current as of 6 October 2026.");
    expect(screen.getByRole("status")).not.toHaveTextContent("Team Rocket's Ambition");
  });
});
