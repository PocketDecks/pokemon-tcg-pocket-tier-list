import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import LastUpdated from "../LastUpdated";

vi.mock("../../app/last-updated", () => ({
  LAST_UPDATED: new Date("2026-10-06T18:56:00.000Z"),
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
    expect(screen.getByText(/6 October 2026 at 18:56/)).toBeInTheDocument();
  });

  it("writes the time in Japanese rather than with an English am/pm", async () => {
    await i18n.changeLanguage("ja");
    render(<LastUpdated />);

    expect(screen.getByText(/最終更新：/)).toBeInTheDocument();
    expect(screen.getByText(/2026年10月6日 18:56/)).toBeInTheDocument();
    expect(screen.queryByText(/am|pm/)).not.toBeInTheDocument();

    await i18n.changeLanguage("en");
  });
});
