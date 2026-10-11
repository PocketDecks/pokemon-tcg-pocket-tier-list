# How-to guide: Adding a language

The app loads translations at runtime from `src/locales/`. i18next builds each
file name as `${language}_${namespace}.json`, so a language called `pt` reads
`src/locales/pt_translation.json`. Adding one touches four files: the locale
JSON itself, `src/i18n.ts`, `src/components/LanguageSwitcher.tsx` and the
parity test in `src/locales/__tests__/translation-parity.test.ts`.

Improving an existing translation is smaller. If the language is already
registered, your PR only changes that one JSON file: no registration, no test
edits. The parity suite still runs on it and confirms you left the keys alone.

## Choose the code first

Use the exact BCP 47 tag that browsers report, not an invented abbreviation.
Chinese simplified is `zh-CN` and Chinese traditional is `zh-TW`; a tag like
`tw-CN` matches nothing and will never be selected. When you only translate
one regional variant, register the base language: a single `pt` file serves
both `pt` and `pt-BR` visitors, because i18next falls back from the regional
tag to the base language before falling back to `en`.

## Create the locale file

Copy the English file to the new name.
```bash
cp src/locales/en_translation.json src/locales/nl_translation.json
```
Translate the values and leave every key unchanged. Keep `{{placeholders}}`
intact inside the translated strings; interpolation breaks if a placeholder
is dropped or renamed. The English file currently uses `{{card}}`,
`{{date}}` and `{{expansion}}`.

You can leave some values untranslated while you work. The parity test only
checks keys, not their content.

## Register the language

Add the new code to `supportedLngs` in `src/i18n.ts`. A code missing from
this list is never loaded, even if the locale file exists.
```ts
supportedLngs: ["en", "de", "es", "fr", "it", "ko", "ja", "pt", "ro", "nl", "zh-CN", "zh-TW"],
```

Then add it to the `languages` array in `src/components/LanguageSwitcher.tsx`.
Each entry is a `{ code, name }` pair, where `name` is written in that
language so speakers can find it. Order the list alphabetically by code among
the Latin-script entries and keep the CJK entries (`ja`, `ko`, `zh-CN`,
`zh-TW`) at the end.
```ts
const languages = [
  { code: "en", name: "English" },
  // ...
  { code: "nl", name: "Nederlands" },
  // ...
];
```

The switcher sets `i18n.changeLanguage(value)`, which triggers the backend in
`src/i18n.ts` to import your file by name. There is no separate registry to
update.

## Add the SEO namespace

Page prose for the public routes lives in a second namespace, `seo`, so the
marketing copy on a page can be translated without touching UI chrome. The
files are `src/locales/en_seo.json` and `src/locales/ja_seo.json`, and both
carry the same key set: `tierList`, `cardsList`, `expansionList`, `statistics`,
`deckDetail`, `deckFinder` and `about`. Page components read them with
`t("tierList.heading", { ns: "seo" })`.

A new locale does not need a `_seo.json` file to work. The backend in
`src/i18n.ts` resolves `./locales/${language}_seo.json` and falls back to
`en_seo.json` when that file is absent, so an untranslated locale serves the
English prose rather than raw keys. Add the file only when you have the
translated prose; a locale with a partial file ships English for the missing
keys, which is worse for search engines than serving English throughout.

When you do add one, keep its key set identical to `en_seo.json`. The parity
suite pins `ja_seo.json` to `en_seo.json` in both directions, so a key added to
the English file fails the build until the Japanese file carries it too.

## Add the parity test

Import the new file and add it to the `locales` record in
`src/locales/__tests__/translation-parity.test.ts`.
```ts
import nl from "../nl_translation.json";

const locales: Record<string, object> = {
    de,
    // ...
    nl,
    // ...
};
```
The test asserts two things for every entry: the locale has every key that
`en_translation.json` has, and no key that English lacks. Run the suite:
```bash
yarn test:ci
```
A failure naming your locale means keys are missing (you removed or renamed
one while translating) or stale (you added a key that does not exist in the
English file). Fix the JSON until both directions pass. If TypeScript
complains about the import, check the file name: the code goes before
`_translation.json` exactly as registered, dashes included, as in
`zh-CN_translation.json`.

Once the suite is green, commit the four files together: the locale JSON,
`src/i18n.ts`, `LanguageSwitcher.tsx` and the parity test.

For the wider picture of how translations fit into the frontend, see
[Frontend architecture](../reference/frontend-architecture.md).
