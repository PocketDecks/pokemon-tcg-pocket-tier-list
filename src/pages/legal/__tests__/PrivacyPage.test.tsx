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

  it("links Ko-fi and discloses payment records and conditional tipper details", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("link", { name: "Ko-fi" })).toHaveAttribute(
      "href",
      "https://ko-fi.com/dalin"
    );
    const collection = sectionText("Information we collect");
    expect(collection).toMatch(/every Ko-fi payment/i);
    expect(collection).toMatch(/identifier and type, amount and currency/i);
    expect(collection).toMatch(/credited months, status/i);
    expect(collection).toMatch(/timestamps/i);
    expect(collection).toMatch(/account identifier and how it matched/i);
    expect(collection).toMatch(/only when a payment is not granted automatically/i);
    expect(collection).toMatch(/email address, name and message/i);

    const retention = sectionText("How long we keep information");
    expect(retention).toMatch(/record for every payment/i);
    expect(retention).toMatch(/identifier and type, amount and currency/i);
    expect(retention).toMatch(/credited months, status, timestamps/i);
    expect(retention).toMatch(/matched account identifier and matching method/i);
    expect(retention).toMatch(/only when a payment is not granted automatically/i);
    expect(retention).toMatch(/email address, name and message/i);
    expect(screen.getByRole("link", { name: /infoLeonid@protonMail.com/i })).toHaveAttribute(
      "href",
      "mailto:infoLeonid@protonMail.com"
    );
  });
});
