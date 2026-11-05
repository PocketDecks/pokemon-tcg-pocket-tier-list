import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { expect, it, vi } from "vitest";
import ErrorBoundary from "../ErrorBoundary";

it("renders readable recovery text while locale resources have not loaded", async () => {
  const i18n = createInstance();
  void i18n.use({ type: "backend", read: () => {} }).use(initReactI18next).init({ lng: "fr", fallbackLng: "en" });
  const Boom = (): React.JSX.Element => { throw new Error("early crash"); };
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(<I18nextProvider i18n={i18n}><Suspense fallback={<p>locale pending</p>}><ErrorBoundary><Boom /></ErrorBoundary></Suspense></I18nextProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("alert")).toHaveTextContent("This part of the site failed to load.");
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
  } finally {
    errorLog.mockRestore();
  }
});
