import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LanguageSwitcher from "../LanguageSwitcher";

const changeLanguage = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", changeLanguage },
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

describe("LanguageSwitcher", () => {
  it("renders the mobile selector with an accessible name and changes language", () => {
    render(<LanguageSwitcher mobile />);
    const selector = screen.getByRole("combobox", { name: "Select language" });

    expect(selector).toHaveValue("en");
    fireEvent.change(selector, { target: { value: "de" } });
    expect(changeLanguage).toHaveBeenCalledWith("de");
  });
});