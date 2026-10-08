import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const sourceFiles = ["src/**/*.{ts,tsx}"];
const testFiles = ["**/__tests__/**/*.{ts,tsx}", "**/*.{test,spec}.{ts,tsx}"];
const appPureFiles = ["src/app/**/*.ts"];
const pageFiles = ["src/pages/**/*.{ts,tsx}"];

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "analysis/**",
      "public/**",
      ".agents/**",
      "coverage/**",
      "node_modules/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: sourceFiles,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    files: testFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["scripts/**/*.js", "scripts/**/*.mjs", "vite.config.mts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-undef": "off",
    },
  },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
    },
  },
  {
    files: ["scripts/**/*.mjs", "vite.config.mts"],
    languageOptions: {
      sourceType: "module",
    },
  },
  {
    files: pageFiles,
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/contexts/*"],
              message: "Pages must not reach into src/contexts/ directly. Depend on src/app/ instead, so page code stays testable without a provider tree.",
            },
          ],
        },
      ],
    },
  },
  {
    files: appPureFiles,
    ignores: ["src/app/use-*.ts", "**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              message: "src/app/ holds pure helpers. React belongs in hooks (src/app/use-*.ts) and in components.",
            },
          ],
          patterns: [
            {
              group: ["**/components/*", "**/contexts/*"],
              message: "App pure layer must depend only on types from src/types/. No component or context imports.",
            },
          ],
        },
      ],
    },
  },
);
