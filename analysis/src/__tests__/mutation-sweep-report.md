# Mutation sweep report

Each guard below was broken on purpose, the analysis suite was run against the broken tree, and the mutation was reverted before the next one. This file records which test caught each break and which breaks no test caught

## Baseline and final totals

The suite was run before the first mutation and after the last revert. Both runs report 48 files and 326 tests, all passing. The series baseline in the task brief (47 files, 314 tests) predates Tasks 19 to 21, so the measured figure is the one quoted here

- before the first mutation: 48 files, 326 tests, 326 passed, 0 failed
- after the last revert: 48 files, 326 tests, 326 passed, 0 failed
- the untouched tree was run three more times during the sweep and reported 48 files and 326 tests passing each time, so no revert left a mutation behind

## Method

For every row the target text was counted before the edit (always exactly one match), the edit applied, the match count taken again and `git diff --numstat` recorded, the suite run through the JSON reporter, then the file rewritten from the pre-edit copy. `git status --short` was empty after every revert. Mutation text shows newlines as `\n` and a deletion as `(deleted)`. The landed column gives the match count either side of the edit and the diff line delta, which together prove the substitution applied; an edit that silently missed would show a zero line delta

## Rows

`caught` means a failing test title contains the test the row names. `caught by another test` means the mutation was caught, but not by the test the row names, which is itself a finding recorded under Deviations. `SURVIVOR` means the suite stayed green with the guard removed

| # | Guard | Mutation | Substitution landed | Outcome | Test the row names | Failed tests | Count |
|---|---|---|---|---|---|---|---|
| T01 | `analysis/src/utils/get-id.ts` | `cards.sort().join(",")` to `cards.join(",")` | match 1 to 0, +1 -1 | caught | ignores the order of the cards | generate-og-images.test.ts (2): "stageOgImages leaves the output directory untouched until commit"; "stageOgImages does not rewrite an image whose bytes are unchanged"<br>get-id.test.ts (1): "getId ignores the order of the cards" | 3 |
| T02 | `analysis/src/utils/get-id.ts` | ``${card.count}-${card.name}-${card.set}-${card.number}`` to ``${card.count}-${card.name}-${card.number}`` | match 1 to 0, +1 -1 | caught | changes when only the set or the number changes | get-id.test.ts (1): "getId changes when only the set or the number changes" | 1 |
| T03 | `analysis/src/utils/calculate-card-scores.ts` | `      winRate * weights.winrateImportance +\n      popularity * weights.popularityImportance,` to `      winRate * weights.winrateImportance *\n      popularity * weights.popularityImportance,` | match 1 to 0, +1 -1 | caught | blends win rate and popularity by the given weights | calculate-card-scores.test.ts (4): "calculateCardScores scores a win rate with a Wilson lower bound"; "calculateCardScores trusts a larger sample more at the same win rate"; "calculateCardScores scores popularity as the card's share of the archetype's games"; "calculateCardScores blends win rate and popularity by the given weights" | 4 |
| T04 | `analysis/src/utils/calculate-card-scores.ts` | `const wilsonLowerBound = (p: number, n: number, z = 1.96): number => {` to `const wilsonLowerBound = (p: number, n: number, z = 1): number => {` | match 1 to 0, +1 -1 | caught | scores a win rate with a Wilson lower bound | calculate-card-scores.test.ts (1): "calculateCardScores scores a win rate with a Wilson lower bound" | 1 |
| T05 | `analysis/src/utils/calculate-card-scores.ts` | `  if (matchingGames <= 0) {\n    throw new Error("Total matching games must be greater than 0");\n  }\n\n` to `(deleted)` | match 1 to 0, +0 -4 | caught | rejects an archetype with no games | calculate-card-scores.test.ts (1): "calculateCardScores rejects an archetype with no games" | 1 |
| T06 | `analysis/src/utils/calculate-matchup-results.ts` | `  const matchingDecks = decks.filter((deck) => deck.name === deckName);` to `  const matchingDecks = decks;` | match 1 to 0, +1 -1 | caught | ignores decks of other archetypes | calculate-matchup-results.test.ts (1): "calculateMatchupResults scope ignores decks of other archetypes" | 1 |
| T07 | `analysis/src/utils/calculate-matchup-results.ts` | `  if (!decks?.length || !deckName) {\n    return {};\n  }\n\n` to `(deleted)` | match 1 to 0, +0 -4 | **SURVIVOR** | returns nothing for an empty list or an empty archetype name | none | 0 |
| T08 | `analysis/src/utils/convert-cards.ts` | `  if (set === "P-A") return "pa";\n  if (set === "P-B") return "pb";\n` to `(deleted)` | match 1 to 0, +0 -2 | caught | drops the hyphen from the promo set codes | convert-cards.test.ts (1): "convertCardsToIds drops the hyphen from the promo set codes" | 1 |
| T09 | `analysis/src/utils/convert-cards.ts` | `card.number.padStart(3, "0")` to `card.number.padStart(2, "0")` | match 1 to 0, +1 -1 | caught | writes count, lower-case set and a three-digit number | convert-cards.test.ts (3): "convertCardsToIds writes count, lower-case set and a three-digit number"; "convertCardsToIds drops the hyphen from the promo set codes"; "convertCardsToIds preserves the order of the cards"<br>get-best-decks.test.ts (4): "run writes every artefact together and then publishes the staged images"; "run stages one image per archetype before anything is written"; "run refuses stale data, writes nothing and discards the staged images"; "run discards the staged images when writing fails" | 7 |
| T10 | `analysis/src/utils/build-window-artefacts.ts` | `deck.winCount / deck.totalGames >= MIN_WINRATE_THRESHOLD` to `deck.winCount / deck.totalGames > MIN_WINRATE_THRESHOLD` | match 1 to 0, +1 -1 | caught | keeps a deck exactly at the gate and drops one just below it | get-best-decks.test.ts (5): "run writes every artefact together and then publishes the staged images"; "run stages one image per archetype before anything is written"; "run refuses stale data, writes nothing and discards the staged images"; "run discards the staged images when writing fails"; "run stops before staging when a list names a card the card database lacks"<br>ranking-gates.test.ts (1): "the win-rate gate keeps a deck exactly at the gate and drops one just below it" | 6 |
| T11 | `analysis/src/utils/build-window-artefacts.ts` | `(gamesByName.get(name) ?? 0) >= MIN_ARCHETYPE_QUALIFIED_GAMES` to `(gamesByName.get(name) ?? 0) > MIN_ARCHETYPE_QUALIFIED_GAMES` | match 1 to 0, +1 -1 | caught | keeps an archetype at the floor and drops one just under it | ranking-gates.test.ts (2): "the archetype games floor keeps an archetype at the floor and drops one just under it"; "the archetype games floor sums the games of an archetype's decks before comparing" | 2 |
| T12 | `analysis/src/get-best-decks.ts` | `  try {\n    assertPublishable({` to `  staged.commit();\n  try {\n    assertPublishable({` | match 1 to 1, +1 -0 | caught | writes every artefact together and then publishes the staged images | get-best-decks.test.ts (3): "run writes every artefact together and then publishes the staged images"; "run refuses stale data, writes nothing and discards the staged images"; "run discards the staged images when writing fails" | 3 |
| T13 | `analysis/src/get-best-decks.ts` | `    staged.discard();\n    throw error;` to `    staged.commit();\n    throw error;` | match 1 to 0, +1 -1 | caught | discards the staged images when writing fails | get-best-decks.test.ts (2): "run refuses stale data, writes nothing and discards the staged images"; "run discards the staged images when writing fails" | 2 |
| T14 | `analysis/src/utils/assert-publishable.ts` | `  } else if (total < floor) {` to `  } else if (total <= floor) {` | match 1 to 0, +1 -1 | caught | accepts a run exactly at every floor | assert-publishable.test.ts (1): "publishFailures accepts a run exactly at every floor" | 1 |
| T15 | `analysis/src/utils/assert-publishable.ts` | `if (ageDays > MAX_DATA_AGE_DAYS) {` to `if (ageDays > MAX_DATA_AGE_DAYS + 1) {` | match 1 to 0, +1 -1 | **SURVIVOR** | the age boundary case in assert-publishable.test.ts | none | 0 |
| T16 | `analysis/src/utils/generate-og-images.ts` | `          throw new Error(`OG image: failed to load card image ${url}: ${reason}`);` to `          console.warn(`OG image: failed to load card image ${url}: ${reason}`);\n          return undefined as never;` | match 1 to 0, +2 -1 | caught | fails and publishes nothing when a card image cannot be loaded | generate-og-images.test.ts (1): "stageOgImages fails and publishes nothing when a card image cannot be loaded" | 1 |
| T17 | `analysis/src/utils/generate-og-images.ts` | `      if (fs.existsSync(published) && fs.readFileSync(published).equals(fs.readFileSync(staged))) {\n        continue;\n      }\n` to `(deleted)` | match 1 to 0, +0 -3 | caught | does not rewrite an image whose bytes are unchanged | generate-og-images.test.ts (1): "stageOgImages does not rewrite an image whose bytes are unchanged" | 1 |
| T18 | `analysis/src/utils/generate-og-images.ts` | `      if (!current.has(entry.name.replace(/\.png$/, ""))) {` to `      if (false) {` | match 1 to 0, +1 -1 | caught | publishes valid PNGs and prunes orphans on commit | generate-og-images.test.ts (1): "stageOgImages publishes valid PNGs and prunes orphans on commit" | 1 |
| T19 | `analysis/src/utils/set-codes.ts` | `"B4", "B4a",\n] as const;` to `"B4",\n] as const;` | match 1 to 0, +1 -1 | caught by another test | uses only set codes the enumeration knows, each already canonical | get-best-decks.test.ts (3): "run writes every artefact together and then publishes the staged images"; "run stages one image per archetype before anything is written"; "run discards the staged images when writing fails"<br>listing-store-data.test.ts (1): "the shipped listing store holds rows, and every row resolves to cards"<br>set-codes.test.ts (2): "canonSet folds case and promo spellings to the store form"; "cardKey builds the pairing key from canonical and raw parts"<br>slug-cards.test.ts (1): "resolveSlug expands the rockets spelling to the apostrophe card name" | 7 |
| T20 | `analysis/src/utils/slug-cards.ts` | `export const resolveSlug = (slug: string): IndexedCard[] => {\n  const tokens = slugTokens(slug);` to `export const resolveSlug = (slug: string): IndexedCard[] => {\n  return [];\n  const tokens = slugTokens(slug);` | match 1 to 0, +1 -0 | caught | holds rows, and every row resolves to cards | deck-name-golden.test.ts (1): "deck naming characterisation regenerates the golden unchanged"<br>get-deck-name.test.ts (11): "getDeckName matches a deck to the newest-set listing that names all its cards"; "getDeckName keeps the partner in the name instead of folding it into the primary"; "getDeckName matches a single-card listing"; "getDeckName names the seeded Oricorio A3 66 archetype"; "getDeckName names the seeded Gigalith ex A2 94 archetype"; "getDeckName prefers a matching listing over the seed when a partner is present"; "row ranking: a fuller listing outranks an anchored shorter one keeps the Mega Rayquaza ex partner on a Dragonair deck"; "row ranking: a fuller listing outranks an anchored shorter one keeps the Oricorio partner on a Chandelure deck"; "row ranking: a fuller listing outranks an anchored shorter one still rejects a tech Basic row in favour of the real archetype"; "Milotic ex/Eevee ex naming: Eevee ex misread as a plain tech Basic and sameLine outranking set recency names the milotic-ex-b3b-015&vaporeon-ex-b3-037#0 real list after the current B4a pairing"; "Milotic ex/Eevee ex naming: Eevee ex misread as a plain tech Basic and sameLine outranking set recency names the milotic-ex-b3b-015#3 real list after the current B4a pairing"<br>listing-store-data.test.ts (10): "the shipped listing store holds rows, and every row resolves to cards"; "the shipped listing store uses only set codes the enumeration knows, each already canonical"; "the shipped listing store rebuilds every shipped pairing key unchanged"; "deck naming parity over the listing store names lapras-ex-pa-014 identically"; "deck naming parity over the listing store names mega-pidgeot-ex-pb-006 identically"; "deck naming parity over the listing store names mega-pidgeot-ex-pb-006 identically"; "deck naming parity over the listing store names charizard-ex-a2b-010&greninja-a1-089 identically"; "deck naming parity over the listing store names suicune-ex-a4a-020&greninja-a1-089 identically"; "deck naming parity over the listing store names giratina-ex-a2b-035&mimikyu-ex-b2-073 identically"; "deck naming parity over the listing store names magnezone-b1a-026 identically"<br>slug-cards.test.ts (7): "resolveSlug resolves a plain two-card slug to its card keys"; "resolveSlug splits a hyphen-merged token into two cards"; "resolveSlug folds reprint-set (A4b) cards onto the earliest earlier printing"; "resolveSlug folds reprint-set (B4b) cards onto the earliest earlier printing"; "resolveSlug expands the rockets spelling to the apostrophe card name"; "resolveSlug resolves a two-card slug with the wanted-set spelling each"; "resolveSlug resolves a two-card promo slug with a p-a suffix" | 29 |
| E01 | `analysis/src/utils/deck-store.ts` | `      if (ids.has(deck.id)) throw new Error(`Deck ${deck.id} appears twice in one batch`);\n` to `(deleted)` | match 1 to 0, +0 -1 | caught | refuses a repeated id inside one batch | deck-store.test.ts (1): "deck store refuses a repeated id inside one batch"<br>migrate-legacy-decks.test.ts (1): "migrateLegacyDecks rejects a legacy list with a repeated deck id" | 2 |
| E02 | `analysis/src/utils/expansion-shards.ts` | `    if (time < window.start) break;` to `    if (time <= window.start) break;` | match 1 to 0, +1 -1 | caught | starts a shard on the exact release instant | expansion-shards.test.ts (2): "shardIdForDate starts a shard on the exact release instant"; "shardIdForDate ends a shard one millisecond before the next release" | 2 |
| E03 | `analysis/scripts/generate-deck-name-golden.ts` | `  if (realDecks.skipped) {\n    throw new Error(\n      `${realDecks.skipped} real deck lists failed to resolve to cards. The golden would ` +\n        `silently shrink. Regenerate real-deck-lists.json or fix the card ids.`\n    );\n  }\n` to `(deleted)` | match 1 to 0, +0 -6 | caught | writes nothing when a real deck list failed to resolve | generate-deck-name-golden-guard.test.ts (1): "generate writes nothing when a real deck list failed to resolve" | 1 |
| E04 | `analysis/src/utils/limitless-client.ts` | `const retryable = (status: number): boolean => status === 429 || status >= 500;` to `const retryable = (status: number): boolean => status >= 500;` | match 1 to 0, +1 -1 | caught | waits for the Retry-After header on a 429 | limitless-client.test.ts (1): "fetchLimitless waits for the Retry-After header on a 429" | 1 |
| E05 | `analysis/src/utils/migrate-legacy-decks.ts` | `  if (Object.keys(readManifest(to).shards).length > 0) {\n    throw new Error(`${to} already holds a migrated store; refusing to overwrite`);\n  }\n` to `(deleted)` | match 1 to 0, +0 -3 | caught | refuses to overwrite a store that is already migrated | migrate-legacy-decks.test.ts (1): "migrateLegacyDecks refuses to overwrite a store that is already migrated" | 1 |
| E06 | `analysis/src/utils/parse-set-page.ts` | `  if (page.decks.length === 0) {\n    throw new Error(`Limitless ${set} page held no deck rows`);\n  }\n` to `(deleted)` | match 1 to 0, +0 -3 | caught | rejects a page with no rows | parse-set-page.test.ts (2): "assertUsablePage rejects a page with no rows"; "fetchSetPage rejects a challenge page instead of returning an empty snapshot" | 2 |
| E07 | `analysis/src/utils/build-trends.ts` | `    .filter((deck) => deck.powerScore !== null)\n` to `(deleted)` | match 1 to 0, +0 -1 | caught | never picks an unranked archetype | pick-trend-names.test.ts (2): "pickTrendNames never picks an unranked archetype"; "pickTrendNames returns nothing when no archetype is ranked" | 2 |
| E08 | `analysis/src/utils/tally-cards.ts` | `    if (games > bestGames || (games === bestGames && count < best)) {` to `    if (games > bestGames) {` | match 1 to 0, +1 -1 | **SURVIVOR** | prefers the lower count on a tie | none | 0 |
| E09 | `analysis/src/utils/build-window-artefacts.ts` | `  const bestDecks = rankedDecks.filter((deck) => !isUnmatchedDeck(deck.name));` to `  const bestDecks = rankedDecks;` | match 1 to 0, +1 -1 | caught | ranks only the real archetypes | unmatched-deck.test.ts (2): "a window holding unmatched decks ranks only the real archetypes"; "a window holding unmatched decks divides every real archetype's share by the full qualified field, bucket included" | 2 |
| E10 | `analysis/src/utils/build-trends.ts` | `    if (dateStr === currentDate) continue;\n\n` to `(deleted)` | match 1 to 0, +0 -2 | caught | excludes the current UTC date | build-trends.test.ts (1): "buildTrends excludes the current UTC date" | 1 |
| E11 | `analysis/src/utils/calculate-deck-score.ts` | `      return totalScore + cardScore * card.count;` to `      return totalScore + cardScore;` | match 1 to 0, +1 -1 | caught | calculates strength, popularity, and the weighted composite score | calculate-deck-score.test.ts (1): "calculateDeckScore calculates strength, popularity, and the weighted composite score"<br>tally-cards.test.ts (1): "calculateDeckScore keyed by identity multiplies each identity score by the copies the deck runs" | 2 |
| E12 | `analysis/src/download-decks.ts` | `  if (value.length > 0 && !hasStore) {\n    throw new Error("The deck store and processed-tournaments.json must exist together");\n  }\n` to `(deleted)` | match 1 to 0, +0 -3 | caught | refuses to run when a processed list exists without a deck store | download-decks.test.ts (1): "downloadDecks refuses to run when a processed list exists without a deck store" | 1 |
| E13 | `analysis/src/utils/filter-decks.ts` | `    .filter((deck) => deck.tournamentExPercent >= NOEX_PERCENT_CUTOFF)` to `    .filter((deck) => deck.tournamentExPercent > NOEX_PERCENT_CUTOFF)` | match 1 to 0, +1 -1 | caught | drops decks from tournaments with too few ex decks and keeps the boundary | filter-decks.test.ts (1): "filterDecks drops decks from tournaments with too few ex decks and keeps the boundary" | 1 |
| E14 | `analysis/src/utils/format-name.ts` | `            const padded = id.padStart(3, "0");` to `            const padded = id.padStart(2, "0");` | match 1 to 0, +1 -1 | caught | should format a single card name correctly | deck-name-golden.test.ts (1): "deck naming characterisation regenerates the golden unchanged"<br>format-name.test.ts (4): "formatName should format a single card name correctly"; "formatName should format multiple card names correctly"; "formatName should handle P-A set code correctly"; "formatName keeps a three-digit number as it is and pads a one-digit one"<br>get-deck-name.test.ts (12): "getDeckName matches a deck to the newest-set listing that names all its cards"; "getDeckName keeps the partner in the name instead of folding it into the primary"; "getDeckName matches a single-card listing"; "getDeckName names the seeded Oricorio A3 66 archetype"; "getDeckName names the seeded Puppy-Loving Girl B3b 67 archetype"; "getDeckName names the seeded Gigalith ex A2 94 archetype"; "getDeckName prefers a matching listing over the seed when a partner is present"; "getDeckName keeps a seeded archetype when the partner matches no listing"; "row ranking: a fuller listing outranks an anchored shorter one keeps the Oricorio partner on a Chandelure deck"; "row ranking: a fuller listing outranks an anchored shorter one still rejects a tech Basic row in favour of the real archetype"; "Milotic ex/Eevee ex naming: Eevee ex misread as a plain tech Basic and sameLine outranking set recency names the milotic-ex-b3b-015&vaporeon-ex-b3-037#0 real list after the current B4a pairing"; "Milotic ex/Eevee ex naming: Eevee ex misread as a plain tech Basic and sameLine outranking set recency names the milotic-ex-b3b-015#3 real list after the current B4a pairing"<br>listing-store-data.test.ts (7): "deck naming parity over the listing store names lapras-ex-pa-014 identically"; "deck naming parity over the listing store names mega-pidgeot-ex-pb-006 identically"; "deck naming parity over the listing store names mega-pidgeot-ex-pb-006 identically"; "deck naming parity over the listing store names charizard-ex-a2b-010&greninja-a1-089 identically"; "deck naming parity over the listing store names suicune-ex-a4a-020&greninja-a1-089 identically"; "deck naming parity over the listing store names giratina-ex-a2b-035&mimikyu-ex-b2-073 identically"; "deck naming parity over the listing store names magnezone-b1a-026 identically" | 24 |
| E15 | `analysis/src/utils/get-deck-name.ts` | `  for (const seed of SEEDED_ARCHETYPES) {\n    if (present.has(seed.primary)) return formatName(seed.display);\n  }\n\n` to `(deleted)` | match 1 to 0, +0 -4 | caught by another test | names the seeded Oricorio A3 66 archetype | deck-name-golden.test.ts (1): "deck naming characterisation regenerates the golden unchanged"<br>get-deck-name.test.ts (2): "getDeckName names the seeded Puppy-Loving Girl B3b 67 archetype"; "getDeckName keeps a seeded archetype when the partner matches no listing" | 3 |
| E16 | `analysis/src/utils/get-decks.ts` | `    return readDecks(decksDir(), EXPANSION_RELEASE_DATE);` to `    return readDecks(decksDir());` | match 1 to 0, +1 -1 | caught | does not open shards that end before the current release | get-decks.test.ts (1): "getDecks does not open shards that end before the current release" | 1 |
| E17 | `analysis/src/utils/get-pairings.ts` | `  return pairings\n    .filter((pairing) => typeof pairing.winner === "string" && pairing.winner !== "")\n    .map((pairing) => {` to `  return pairings\n    .map((pairing) => {` | match 1 to 0, +0 -1 | caught | skips a pairing that has no winner instead of inventing an id | get-pairings.test.ts (1): "getPairings skips a pairing that has no winner instead of inventing an id" | 1 |
| E18 | `analysis/src/utils/get-tournament-decks.ts` | `  if (decks.length === 0) return [];\n\n` to `(deleted)` | match 1 to 0, +0 -2 | caught | returns nothing and skips the pairings request when no deck is usable | get-tournament-decks.test.ts (1): "getTournamentDecks returns nothing and skips the pairings request when no deck is usable" | 1 |
| E19 | `analysis/src/utils/get-tournaments.ts` | `        tournament.players && tournament.players >= MIN_PLAYERS_IN_TOURNAMENT` to `        tournament.players && tournament.players > MIN_PLAYERS_IN_TOURNAMENT` | match 1 to 0, +1 -1 | caught | keeps a tournament with exactly the minimum players and drops one without a count | get-tournaments.test.ts (1): "getTournaments keeps a tournament with exactly the minimum players and drops one without a count" | 1 |
| E20 | `analysis/src/utils/round.ts` | `// Rounds a number to a fixed number of decimal places.\nexport const round` to `import "../../scripts/generate-deck-name-golden";\n\n// Rounds a number to a fixed number of decimal places.\nexport const round` | match 1 to 1, +2 -0 | caught | only imports from analysis/scripts/ where the allowlist says so | layering.test.ts (1): "analysis/src/ import layering only imports from analysis/scripts/ where the allowlist says so" | 1 |
| E21 | `analysis/src/utils/populate-deck-names.ts` | `    decksWithNames.push({\n      ...deck,\n      name,\n    });` to `    decksWithNames.push(deck);` | match 1 to 0, +1 -4 | caught | should populate deck names and create idToName mapping | populate-deck-names.test.ts (1): "populateDeckNames should populate deck names and create idToName mapping" | 1 |
| E22 | `analysis/src/settings.ts` | `  const winrateImportance = Math.min(0.2 + weeksLive * 0.15, 0.75);` to `  const winrateImportance = Math.min(0.2 + weeksLive * 0.15, 0.7);` | match 1 to 0, +1 -1 | caught | caps win-rate importance at week four and beyond | settings-weights.test.ts (1): "scoringWeights caps win-rate importance at week four and beyond" | 1 |

## Survivors

39 of the 42 mutations were caught by at least one test. The remaining 3 left the suite green with the guard removed

### T07: calculate-matchup-results.ts empty input

- file: `analysis/src/utils/calculate-matchup-results.ts`
- mutation: `  if (!decks?.length || !deckName) {\n    return {};\n  }\n\n` to `(deleted)`
- substitution landed: match 1 to 0, diff +0 -4
- test that should have tripped it: returns nothing for an empty list or an empty archetype name
- recorded failures: 0

### T15: assert-publishable.ts data age

- file: `analysis/src/utils/assert-publishable.ts`
- mutation: `if (ageDays > MAX_DATA_AGE_DAYS) {` to `if (ageDays > MAX_DATA_AGE_DAYS + 1) {`
- substitution landed: match 1 to 0, diff +1 -1
- test that should have tripped it: the age boundary case in assert-publishable.test.ts
- recorded failures: 0

### E08: tally-cards.ts modal tie-break

- file: `analysis/src/utils/tally-cards.ts`
- mutation: `    if (games > bestGames || (games === bestGames && count < best)) {` to `    if (games > bestGames) {`
- substitution landed: match 1 to 0, diff +1 -1
- test that should have tripped it: prefers the lower count on a tie
- recorded failures: 0

## Coverage of the files the series added or rewrote

The list was built by diffing `analysis/src/__tests__/` at `ec3c9c5` against this head: 32 files, 15 added and 17 rewritten. Every one carries at least one row

| Test file | Status on the series | Rows |
|---|---|---|
| `assert-publishable.test.ts` | added | T14, T15 |
| `build-trends.test.ts` | rewritten | E10 |
| `calculate-card-scores.test.ts` | added | T03, T04, T05 |
| `calculate-deck-score.test.ts` | rewritten | E11 |
| `calculate-matchup-results.test.ts` | rewritten | T06, T07 |
| `convert-cards.test.ts` | added | T08, T09 |
| `deck-store.test.ts` | added | E01 |
| `download-decks.test.ts` | rewritten | E12 |
| `expansion-shards.test.ts` | added | E02 |
| `filter-decks.test.ts` | rewritten | E13 |
| `format-name.test.ts` | rewritten | E14 |
| `generate-deck-name-golden-guard.test.ts` | added | E03 |
| `generate-og-images.test.ts` | rewritten | T16, T17, T18 |
| `get-best-decks.test.ts` | added | T12, T13 |
| `get-deck-name.test.ts` | rewritten | E15 |
| `get-decks.test.ts` | rewritten | E16 |
| `get-id.test.ts` | rewritten | T01, T02 |
| `get-pairings.test.ts` | rewritten | E17 |
| `get-tournament-decks.test.ts` | rewritten | E18 |
| `get-tournaments.test.ts` | rewritten | E19 |
| `layering.test.ts` | rewritten | E20 |
| `limitless-client.test.ts` | added | E04 |
| `listing-store-data.test.ts` | added | T19, T20 |
| `migrate-legacy-decks.test.ts` | added | E05 |
| `parse-set-page.test.ts` | added | E06 |
| `pick-trend-names.test.ts` | added | E07 |
| `populate-deck-names.test.ts` | rewritten | E21 |
| `ranking-gates.test.ts` | added | T10, T11 |
| `set-codes.test.ts` | rewritten | T19 |
| `settings-weights.test.ts` | rewritten | E22 |
| `tally-cards.test.ts` | added | E08 |
| `unmatched-deck.test.ts` | added | E09 |

## The brief's table

All 20 rows of the table in the task brief are present above as T01 to T20, in the brief's order, none dropped and none weakened. Rows E01 to E22 extend the sweep to the remaining source files the series added or rewrote

## Deviations and findings

- T19 was caught, but not by the test the row names. Removing `B4a` from `SET_CODES` makes `canonSet` reject it, so `resolveSlug` drops every `B4a` card, and the store then yields no `B4a` pairing key. The named test builds its set of codes from those keys, so `B4a` never reaches its loop and the test passes while the enumeration is wrong. Seven other tests failed, including `holds rows, and every row resolves to cards`. The hole is in the named test, not in the suite
- T15 is a survivor because the boundary test it names does not exist. `assert-publishable.test.ts` pins 19.4 days as stale and 7 days as fresh, with no case between 7 and 8 days, so widening the limit by one day changes no assertion
- T07 is a survivor because the guard is unreachable for the inputs its test passes. An empty deck list and an empty archetype name both filter to nothing, so the function returns `{}` with or without the guard. It only changes behaviour for a deck named `""`, which no test builds
- E08 is a survivor because the tie-break clause cannot be reached through the public function. The test passes `{ 2: 10, 1: 10 }`, and JavaScript enumerates integer-like keys in ascending order, so `1` is visited first and wins on the plain greater-than comparison. A direct check confirms `{ 2: 10, 1: 10 }` and `{ 3: 10, 1: 10 }` both return `1` with the clause removed
- E15's row names one test, but the mutation was caught by three, and not by the test the row names. `Oricorio A3 66` is also a real listing row, so the deck is named `oricorio-a3-034` by the listing path and the named test passes with the seed branch deleted. `Puppy-Loving Girl B3b 67` exists only as a seed, so its test and the golden both failed. The seed branch is covered, but the Oricorio test does not test it
- The brief's promo-fold mutation was applied against the merged head, where the two branches sit on separate lines. The intent (delete the `P-A` and `P-B` branches) is what the row records

## Files this report touches

No source file changed. Every mutation above was reverted, and `git status --short` listed only this report before the commit

## Re-run after the audit remediation

The harness at `private/plans/2026-10-12-pr-123-audit-remediation/harness/mutate.js` was run against head `17e2a40`. It refuses to start on a red baseline, applies each mutation, runs the full analysis suite, and restores every file byte for byte

- `BASELINE` files 48 tests 358 passed 358 failed 0
- `AFTER` files 48 tests 358 passed 358 failed 0

Task 9 was skipped, so the suite stands at 358 tests and the `K-` row could not apply

| Id | File | Outcome | Failing tests |
|---|---|---|---|
| T07 | `analysis/src/utils/calculate-matchup-results.ts` | caught | calculate-matchup-results.test.ts: calculateMatchupResults scope refuses an empty archetype name even when a deck is named blank |
| T15 | `analysis/src/utils/assert-publishable.ts` | caught | assert-publishable.test.ts: publishFailures blocks a deck a tenth of a day past the age limit |
| E08 | `analysis/src/utils/tally-cards.ts` | caught | tally-cards.test.ts: modalCopies prefers the lower count when a fractional count ties with a whole one |
| G-unmatched-window | `analysis/src/get-best-decks.ts` | caught | get-best-decks.test.ts: run refuses a run whose unmatched bucket passes the share limit |
| G-unmatched-ge | `analysis/src/utils/assert-publishable.ts` | caught | assert-publishable.test.ts: publishFailures blocks an unmatched share a tenth of a point past the limit |
| S-restore | `analysis/src/utils/generate-og-images.ts` | caught | generate-og-images.test.ts: stageOgImages restores the previous image set when the staging rename fails |
| S-stagecleanup | `analysis/src/utils/generate-og-images.ts` | caught | generate-og-images.test.ts: stageOgImages leaves no staging directory behind when a card image cannot be loaded |
| S-backupcleanup | `analysis/src/utils/generate-og-images.ts` | caught | generate-og-images.test.ts: stageOgImages removes the previous generation after a successful swap |
| OG-precheck | `analysis/src/utils/generate-og-images.ts` | caught | generate-og-images.test.ts: stageOgImages refuses to stage while a previous image directory is still present |
| OG-commit-discard | `analysis/src/utils/generate-og-images.ts` | caught | generate-og-images.test.ts: stageOgImages removes the staging directory when the swap is refused |
| RUN-partial-message | `analysis/src/get-best-decks.ts` | caught | get-best-decks.test.ts: run says the JSON is published when the image swap fails after the write |
| D-batch | `analysis/src/utils/deck-store.ts` | caught | deck-store.test.ts: deck store refuses a repeated id inside one batch; deck-store.test.ts: deck store refuses a repeated id across shards inside one batch; migrate-legacy-decks.test.ts: migrateLegacyDecks rejects a legacy list with a repeated deck id |
| D-read | `analysis/src/utils/deck-store.ts` | caught | deck-store.test.ts: deck store refuses to read a deck id stored in two shards |
| D-untracked | `analysis/src/utils/deck-store.ts` | caught | deck-store.test.ts: deck store reports a shard file the manifest does not track |
| R-scope | `analysis/src/utils/assert-publishable.ts` | caught | assert-publishable.test.ts: readPreviousArchetypeCount ignores a previous publish from before the current release |
| R-scope-boundary | `analysis/src/utils/assert-publishable.ts` | caught | assert-publishable.test.ts: readPreviousArchetypeCount counts a previous publish made exactly at the release |
| R-wiring | `analysis/src/get-best-decks.ts` | caught | get-best-decks.test.ts: run reads each window's previous count against the current release |
| F-ramp | `analysis/src/utils/assert-publishable.ts` | caught | assert-publishable.test.ts: publishFailures ramps every floor with the days of data since the release; assert-publishable.test.ts: publishFailures names the ramped floor when a young window is still too thin |
| F-ranked | `analysis/src/utils/assert-publishable.ts` | caught | assert-publishable.test.ts: publishFailures ramps every floor with the days of data since the release; assert-publishable.test.ts: publishFailures names the ramped floor when a young window is still too thin |
| F-wiring | `analysis/src/get-best-decks.ts` | caught | get-best-decks.test.ts: run passes the days of data since the release to the gate |
| K-query | `analysis/src/utils/limitless-client.ts` | skipped | the target text matched no line: Task 9 was skipped, so the key stayed in the header |

T07, T15 and E08, recorded above as survivors, are caught by tests added after the first sweep.
T17 and T18 target code that commit dbac988 replaced, so they no longer apply
