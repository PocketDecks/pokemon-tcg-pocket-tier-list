const test = require("node:test");
const assert = require("node:assert");

const {
  buildTimeZoneCountries,
  renderTimeZoneCountries,
} = require("../generate-time-zone-countries.mjs");

const lookup = (zonesByCountry) => (country) => zonesByCountry[country];

test("maps a zone claimed by one country to that country", () => {
  const table = buildTimeZoneCountries({
    countries: ["JP"],
    timeZonesOf: lookup({ JP: ["Asia/Tokyo"] }),
    overrides: {},
    aliases: [],
  });

  assert.deepStrictEqual(table, { "Asia/Tokyo": "JP" });
});

test("keeps the first country for a shared zone when all claimants share an outcome", () => {
  const table = buildTimeZoneCountries({
    countries: ["DE", "FR"],
    timeZonesOf: lookup({
      DE: ["Europe/Berlin", "Europe/Shared"],
      FR: ["Europe/Paris", "Europe/Shared"],
    }),
    overrides: {},
    aliases: [],
  });

  assert.deepStrictEqual(table, {
    "Europe/Berlin": "DE",
    "Europe/Paris": "FR",
    "Europe/Shared": "DE",
  });
});

test("drops a shared zone whose claimants have different outcomes", () => {
  const table = buildTimeZoneCountries({
    countries: ["US", "CA"],
    timeZonesOf: lookup({
      US: ["America/New_York", "America/Shared"],
      CA: ["America/Vancouver", "America/Shared"],
    }),
    overrides: {},
    aliases: [],
  });

  assert.deepStrictEqual(table, {
    "America/New_York": "US",
    "America/Vancouver": "CA",
  });
});

test("treats Switzerland as part of the European opt-in outcome", () => {
  const table = buildTimeZoneCountries({
    countries: ["CH", "GB"],
    timeZonesOf: lookup({
      CH: ["Europe/Zurich", "Europe/Shared"],
      GB: ["Europe/London", "Europe/Shared"],
    }),
    overrides: {},
    aliases: [],
  });

  assert.strictEqual(table["Europe/Shared"], "CH");
  assert.strictEqual(table["Europe/Zurich"], "CH");
});

test("drops a zone shared between Switzerland and the rest of the world", () => {
  const table = buildTimeZoneCountries({
    countries: ["CH", "JP"],
    timeZonesOf: lookup({
      CH: ["Europe/Shared"],
      JP: ["Europe/Shared"],
    }),
    overrides: {},
    aliases: [],
  });

  assert.deepStrictEqual(table, {});
});

test("treats the EU outermost regions and Aland as European", () => {
  const table = buildTimeZoneCountries({
    countries: ["RE", "AX", "GF", "YT", "MF", "MQ", "GP"],
    timeZonesOf: lookup({
      RE: ["Indian/Reunion"],
      AX: ["Europe/Mariehamn"],
      GF: ["America/Cayenne"],
      YT: ["Indian/Mayotte"],
      MF: ["America/Marigot"],
      MQ: ["America/Martinique"],
      GP: ["America/Guadeloupe"],
    }),
    overrides: {},
    aliases: [],
  });

  assert.deepStrictEqual(table, {
    "America/Cayenne": "GF",
    "America/Guadeloupe": "GP",
    "America/Marigot": "MF",
    "America/Martinique": "MQ",
    "Europe/Mariehamn": "AX",
    "Indian/Mayotte": "YT",
    "Indian/Reunion": "RE",
  });
});

test("treats Gibraltar and the Crown Dependencies as European", () => {
  const table = buildTimeZoneCountries({
    countries: ["GI", "JE", "GG", "IM"],
    timeZonesOf: lookup({
      GI: ["Europe/Gibraltar"],
      JE: ["Europe/Jersey"],
      GG: ["Europe/Guernsey"],
      IM: ["Europe/Isle_of_Man"],
    }),
    overrides: {},
    aliases: [],
  });

  assert.deepStrictEqual(table, {
    "Europe/Gibraltar": "GI",
    "Europe/Guernsey": "GG",
    "Europe/Isle_of_Man": "IM",
    "Europe/Jersey": "JE",
  });
});

test("drops a zone shared between an EU outermost region and the rest of the world", () => {
  const table = buildTimeZoneCountries({
    countries: ["RE", "US"],
    timeZonesOf: lookup({ RE: ["Indian/Shared"], US: ["Indian/Shared"] }),
    overrides: {},
    aliases: [],
  });

  assert.deepStrictEqual(table, {});
});

test("adds the region overrides even when the lookup does not return their zones", () => {
  const table = buildTimeZoneCountries({
    countries: ["CA", "US"],
    timeZonesOf: lookup({ CA: ["America/Vancouver"], US: ["America/Denver"] }),
    aliases: [],
  });

  assert.strictEqual(table["America/Montreal"], "CA-QC");
  assert.strictEqual(table["America/Toronto"], "CA-QC");
  assert.strictEqual(table["America/Los_Angeles"], "US-CA");
  assert.strictEqual(table["America/Vancouver"], "CA");
});

test("replaces a claimed zone with its region override", () => {
  const table = buildTimeZoneCountries({
    countries: ["US"],
    timeZonesOf: lookup({ US: ["America/Los_Angeles"] }),
    overrides: { "America/Los_Angeles": "US-CA" },
    aliases: [],
  });

  assert.deepStrictEqual(table, { "America/Los_Angeles": "US-CA" });
});

test("emits the current name for a legacy zone and the legacy name for a current one", () => {
  const table = buildTimeZoneCountries({
    countries: ["IN", "UA"],
    timeZonesOf: lookup({ IN: ["Asia/Calcutta"], UA: ["Europe/Kyiv"] }),
    overrides: {},
    aliases: [
      ["Asia/Calcutta", "Asia/Kolkata"],
      ["Europe/Kiev", "Europe/Kyiv"],
    ],
  });

  assert.deepStrictEqual(table, {
    "Asia/Calcutta": "IN",
    "Asia/Kolkata": "IN",
    "Europe/Kiev": "UA",
    "Europe/Kyiv": "UA",
  });
});

test("does not overwrite an alias that the lookup already returned", () => {
  const table = buildTimeZoneCountries({
    countries: ["IN"],
    timeZonesOf: lookup({ IN: ["Asia/Calcutta", "Asia/Kolkata"] }),
    overrides: {},
    aliases: [["Asia/Calcutta", "Asia/Kolkata"]],
  });

  assert.deepStrictEqual(table, { "Asia/Calcutta": "IN", "Asia/Kolkata": "IN" });
});

test("ignores countries whose lookup returns nothing", () => {
  const table = buildTimeZoneCountries({
    countries: ["BV"],
    timeZonesOf: () => undefined,
    overrides: {},
    aliases: [],
  });

  assert.deepStrictEqual(table, {});
});

test("renders one string entry per zone", () => {
  const source = renderTimeZoneCountries({
    "America/Toronto": "CA-QC",
    "Asia/Tokyo": "JP",
  });

  assert.strictEqual(
    source,
    [
      "export const timeZoneCountries: Record<string, string> = {",
      '  "America/Toronto": "CA-QC",',
      '  "Asia/Tokyo": "JP",',
      "};",
      "",
    ].join("\n")
  );
});
