import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import GlobalStyles from "./styles/GlobalStyles";
import { BrowserRouter } from "react-router";
import MissingContextProvider from "./components/MissingContext";
import FilterContextProvider from "./components/FilterContext";
import { UIProvider } from "./contexts/UIContext";
import ConsentProvider from "./consent/ConsentProvider";
import { handlePreloadError } from "./app/preload-reload-guard";
import "./i18n";

window.addEventListener("vite:preloadError", handlePreloadError);

const rootElement = document.getElementById("root") as HTMLElement;

const app = (
  <React.StrictMode>
    <BrowserRouter>
      <UIProvider>
        <MissingContextProvider>
          <FilterContextProvider>
            <GlobalStyles />
            <ConsentProvider>
              <App />
            </ConsentProvider>
          </FilterContextProvider>
        </MissingContextProvider>
      </UIProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// The build pipeline prerenders each route to static HTML so crawlers
// (and the AdSense review) receive real content. We render fresh rather than
// hydrate: this app is heavily client-driven (i18n with per-user language
// detection, auth, async data), so the prerendered markup and the client's
// first paint diverge. Hydrating that would only produce mismatch errors and a
// full client re-render, so rendering fresh replaces the static markup cleanly
// in every language, while the served HTML keeps its SEO and AdSense value.
createRoot(rootElement).render(app);

reportWebVitals();
