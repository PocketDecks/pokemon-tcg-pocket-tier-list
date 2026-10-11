import { fireEvent, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { useDocumentLanguage } from "../use-document-language";

const renderAt = (path: string) =>
  renderHook(() => useDocumentLanguage(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={children} />
        </Routes>
      </MemoryRouter>
    ),
  });

const BackButton = () => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>back</button>;
};

const renderStack = (entries: string[]) =>
  renderHook(() => useDocumentLanguage(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                {children}
                <BackButton />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    ),
  });

describe("useDocumentLanguage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("marks an English route as English", () => {
    renderAt("/tier-list");
    expect(document.documentElement.lang).toBe("en");
  });

  it("marks a Japanese route as Japanese", async () => {
    renderAt("/ja/tier-list");
    expect(document.documentElement.lang).toBe("ja");
    await waitFor(() => expect(i18n.language).toBe("ja"));
  });

  it("marks a nested Japanese route as Japanese", () => {
    renderAt("/ja/deck/mega-lucario-ex-b3-081");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("marks the Japanese home page as Japanese", () => {
    renderAt("/ja/");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("drops back to English when a back navigation leaves the Japanese tree", async () => {
    renderStack(["/tier-list", "/ja/tier-list"]);
    await waitFor(() => expect(i18n.language).toBe("ja"));
    expect(document.documentElement.lang).toBe("ja");

    fireEvent.click(document.querySelector("button") as HTMLButtonElement);

    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(i18n.language).toBe("en");
  });
});
