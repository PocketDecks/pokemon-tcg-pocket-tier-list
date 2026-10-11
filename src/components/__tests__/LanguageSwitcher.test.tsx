import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LanguageSwitcher from "../LanguageSwitcher";
import { useDocumentLanguage } from "../../app/use-document-language";

const { i18nState } = vi.hoisted(() => ({ i18nState: { language: "en" } }));

const changeLanguage = vi.fn((language: string) => {
  i18nState.language = language;
  return Promise.resolve();
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { get language() { return i18nState.language; }, changeLanguage },
    t: (key: string) => (key === "a11y.selectLanguage" ? "Choose your language" : key),
  }),
}));

const DocumentLanguage = () => {
  useDocumentLanguage();
  return null;
};

const LocationProbe = () => {
  const { pathname } = useLocation();
  return <div data-testid="pathname">{pathname}</div>;
};

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <LanguageSwitcher />
              <DocumentLanguage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );

const pathname = () => screen.getByTestId("pathname").textContent;

beforeEach(() => {
  changeLanguage.mockClear();
  i18nState.language = "en";
});

describe("LanguageSwitcher", () => {
  it("renders the selector and switches language", () => {
    renderAt("/tier-list");
    const selector = screen.getByRole("combobox", { name: "Choose your language" });

    expect(selector).toHaveValue("en");
    fireEvent.change(selector, { target: { value: "de" } });
    expect(changeLanguage).toHaveBeenCalledWith("de");
  });

  it("offers every supported language, not only the ones with a URL", () => {
    renderAt("/tier-list");
    const selector = screen.getByRole("combobox", { name: "Choose your language" });
    const codes = Array.from(selector.querySelectorAll("option")).map((option) =>
      option.getAttribute("value")
    );

    expect(codes).toEqual([
      "en",
      "de",
      "es",
      "fr",
      "it",
      "ja",
      "ko",
      "pt",
      "ro",
      "zh-CN",
      "zh-TW",
    ]);
  });

  it("navigates to the Japanese URL when Japanese is chosen", () => {
    renderAt("/tier-list");
    const selector = screen.getByRole("combobox", { name: "Choose your language" });

    fireEvent.change(selector, { target: { value: "ja" } });

    expect(pathname()).toBe("/ja/tier-list");
    expect(changeLanguage).toHaveBeenCalledWith("ja");
  });

  it("navigates back to the English URL when English is chosen", () => {
    renderAt("/ja/deck/mega-lucario-ex-b3-081");
    const selector = screen.getByRole("combobox", { name: "Choose your language" });

    fireEvent.change(selector, { target: { value: "en" } });

    expect(pathname()).toBe("/deck/mega-lucario-ex-b3-081");
  });

  it("falls back to the unprefixed URL for a language with no locale URL", () => {
    renderAt("/ja/tier-list");
    const selector = screen.getByRole("combobox", { name: "Choose your language" });

    fireEvent.change(selector, { target: { value: "de" } });

    expect(pathname()).toBe("/tier-list");
    expect(changeLanguage).toHaveBeenCalledWith("de");
    expect(document.documentElement.lang).toBe("de");
  });
});
