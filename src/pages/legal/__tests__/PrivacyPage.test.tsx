import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../../../i18n";
import PrivacyPage from "../PrivacyPage";

vi.mock("../../../ads/ContentReadyContext", () => ({
  __esModule: true,
  useMarkContentReady: vi.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>
  );

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
    renderPage();
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
    expect(collection).toMatch(/email address, name and message only when a payment is not granted automatically/i);

    const retention = sectionText("How long we keep information");
    expect(retention).toMatch(/record for every payment/i);
    expect(retention).toMatch(/identifier and type, amount and currency/i);
    expect(retention).toMatch(/credited months, status, timestamps/i);
    expect(retention).toMatch(/matched account identifier and matching method/i);
    expect(retention).toMatch(/email address, name and message are stored only when a payment is not granted automatically/i);
  });

  it("sends questions and deletion requests to the feedback form", () => {
    renderPage();
    expect(sectionText("Contact")).toMatch(
      /contact us through the feedback form/i
    );
    expect(screen.getByRole("link", { name: "feedback form" })).toHaveAttribute("href", "/feedback/");
    expect(screen.queryByRole("link", { name: /protonMail/i })).not.toBeInTheDocument();
  });

  it("discloses the Supporter record, the stored email and the payment code", () => {
    renderPage();
    const collection = sectionText("Information we collect");
    expect(collection).toMatch(
      /Supporter access\. When you become a Supporter, we store a record with your account ID, your email address, when your access ends, how it was granted and when it last changed/i
    );
    expect(collection).toMatch(/payment code, we store it with your account ID/i);
    expect(collection).toMatch(/Besides us, only you can read your own record/i);

    const retention = sectionText("How long we keep information");
    expect(retention).toMatch(/Supporter record and payment code until you ask us to delete them/i);
  });

  it("says every feedback message keeps the sender's email and rests on the agreement box", () => {
    renderPage();
    const collection = sectionText("Information we collect");
    expect(collection).toMatch(/we store your account ID, your email address, your message, the topic you chose/i);
    expect(collection).toMatch(/We keep your email address so we can reply/i);
    expect(collection).toMatch(/tick a box confirming that you have read this policy and agree/i);
    expect(collection).not.toMatch(/only if you tick the box asking us to reply/i);

    expect(sectionText("Legal basis")).toMatch(/For feedback, we rely on the box you tick on the form/i);
    expect(sectionText("How long we keep information")).toMatch(
      /feedback messages, and the email address stored with them, until you ask us to delete them/i
    );
  });

  it("points rights requests and deletion requests at the feedback form", () => {
    renderPage();
    expect(sectionText("Your rights")).toMatch(/contact us through the feedback form linked below/i);
    expect(sectionText("How long we keep information")).toMatch(
      /ask us to delete them through the feedback form linked below/i
    );
    expect(sectionText("Your rights")).not.toMatch(/details below/i);
  });

  it("shows the date of the latest policy change", () => {
    renderPage();
    expect(screen.getByText("Last updated: 20 November 2026")).toBeInTheDocument();
  });
});
