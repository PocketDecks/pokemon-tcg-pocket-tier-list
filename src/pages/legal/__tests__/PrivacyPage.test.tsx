import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../../i18n";
import PrivacyPage from "../PrivacyPage";

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

describe("PrivacyPage", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.changeLanguage("en");
  });

  it("links Ko-fi and accurately describes manual handling of unmatched tips", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("link", { name: /ko-fi/i })).toHaveAttribute(
      "href",
      "https://ko-fi.com/dalin"
    );
    expect(screen.getAllByText(/email address, name and message/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not automatically grant new Premium time/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /infoLeonid@protonMail.com/i })).toHaveAttribute(
      "href",
      "mailto:infoLeonid@protonMail.com"
    );
  });
});
