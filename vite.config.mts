/// <reference types="vitest/config" />
import { replaceManropePreload } from "./scripts/manrope-preload.mjs";
import { buildConsentPendingData, consentPendingScript } from "./src/consent/consent-pending.mjs";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const MANROPE_PRELOAD = "__MANROPE_LATIN_PRELOAD__";

const manropePreload = (): Plugin => {
  let manropeFont: string | undefined;
  return {
    name: "manrope-preload",
    apply: "build",
  transformIndexHtml(html) {
    return {
      html,
      tags: [
        {
          tag: "link",
          injectTo: "head",
          attrs: {
            rel: "preload",
            as: "font",
            type: "font/woff2",
            crossorigin: "anonymous",
            href: MANROPE_PRELOAD,
          },
        },
      ],
    };
  },
  generateBundle(_options, bundle) {
    const font = Object.values(bundle).find(
      (item) =>
        item.type === "asset" &&
        item.fileName.includes("manrope-latin-wght-normal") &&
        item.fileName.endsWith(".woff2")
    );
    if (!font) {
      throw new Error("Could not resolve the emitted Manrope latin font preload");
    }
    manropeFont = font.fileName;
  },
  writeBundle(options) {
    const outputDir = options.dir;
    if (!outputDir || !manropeFont) {
      throw new Error("Could not resolve the built Manrope latin font preload");
    }
    const htmlPath = path.join(outputDir, "index.html");
    const html = fs.readFileSync(htmlPath, "utf8");
    fs.writeFileSync(htmlPath, replaceManropePreload(html, manropeFont));
  },
  };
};

const consentPending = (): Plugin => ({
  name: "consent-pending",
  transformIndexHtml() {
    return buildConsentPendingData()
      .then(consentPendingScript)
      .then((children) => [
        {
          tag: "script",
          injectTo: "head-prepend" as const,
          attrs: { "data-consent-init": "true" },
          children,
        },
      ]);
  },
});

export default defineConfig({
  plugins: [react(), manropePreload(), consentPending()],
  envPrefix: ["VITE_", "REACT_APP_"],
  server: { port: 3000 },
  build: { target: "baseline-widely-available", sourcemap: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
  },
});
