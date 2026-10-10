import { renderHook } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
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

describe("useDocumentLanguage", () => {
  it("marks an English route as English", () => {
    renderAt("/tier-list");
    expect(document.documentElement.lang).toBe("en");
  });

  it("marks a Japanese route as Japanese", () => {
    renderAt("/ja/tier-list");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("marks a nested Japanese route as Japanese", () => {
    renderAt("/ja/deck/mega-lucario-ex-b3-081");
    expect(document.documentElement.lang).toBe("ja");
  });

  it("marks the Japanese home page as Japanese", () => {
    renderAt("/ja/");
    expect(document.documentElement.lang).toBe("ja");
  });
});
