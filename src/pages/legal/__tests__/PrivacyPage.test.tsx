import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../../i18n";
import PrivacyPage from "../PrivacyPage";

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

const sectionText = (headingName: string): string => {
  const heading = screen.getByRole("heading", { name: headingName });
  let node = heading.nextElementSibling;
  const parts: string[] = [];
  while (node && node.tagName !== "H1" && node.tagName !== "H2") {
    parts.push(node.textContent ?? "");
    node = node.nextElementSibling;
  }
  return parts.join(" ");
};

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
    expect(sectionText("Information we collect")).toMatch(/email address, name and message/i);
    expect(sectionText("How long we keep information")).toMatch(
      /not automatically grant new Premium time/i
    );
    expect(screen.getByRole("link", { name: /infoLeonid@protonMail.com/i })).toHaveAttribute(
      "href",
      "mailto:infoLeonid@protonMail.com"
    );
  });
});
