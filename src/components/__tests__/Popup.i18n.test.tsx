import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import Popup from "../Popup";
import en from "../../locales/en_translation.json";

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

describe("Popup with the real English resources", () => {
  it("names its Close button Close and labels the dialog from its heading", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <Popup isOpen header="userAccount.title" close={() => undefined}>
          <p>Body</p>
        </Popup>
      </I18nextProvider>
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "User Account" })).toBeInTheDocument();
  });
});
