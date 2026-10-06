import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import LastUpdated from "../LastUpdated";

vi.mock("../../app/last-updated", () => ({
  LAST_UPDATED: new Date("2026-10-06T00:00:00.000Z"),
}));

describe("LastUpdated", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.changeLanguage("en");
    await i18n.loadNamespaces("translation");
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("labels the displayed date as the date the rankings are current through", () => {
    render(<LastUpdated />);

    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    expect(screen.getByText(/2026\/10\/06/)).toBeInTheDocument();
  });
});
