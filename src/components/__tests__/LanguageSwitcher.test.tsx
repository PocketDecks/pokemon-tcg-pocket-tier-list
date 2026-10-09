import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LanguageSwitcher from "../LanguageSwitcher";

const changeLanguage = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", changeLanguage },
    t: (key: string) => (key === "a11y.selectLanguage" ? "Choose your language" : key),
  }),
}));

beforeEach(() => {
  changeLanguage.mockClear();
});

describe("LanguageSwitcher", () => {
  it("renders the desktop selector and changes language", () => {
    render(<LanguageSwitcher />);
    const selector = screen.getByRole("combobox", { name: "Choose your language" });

    expect(selector).toHaveValue("en");
    fireEvent.change(selector, { target: { value: "de" } });
    expect(changeLanguage).toHaveBeenCalledWith("de");
  });
});
