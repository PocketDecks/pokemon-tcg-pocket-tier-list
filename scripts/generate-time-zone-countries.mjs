import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { policyPackPresets } from "c15t";
import { EUROPE_OPT_IN_EXTRA_COUNTRIES } from "../src/consent/policy-countries.mjs";

const ISO_COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
];

const EUROPE_OPT_IN_COUNTRIES = new Set([
  ...policyPackPresets.europeOptIn().match.countries,
  ...EUROPE_OPT_IN_EXTRA_COUNTRIES,
]);

const REGION_OVERRIDES = {
  "America/Montreal": "CA-QC",
  "America/Toronto": "CA-QC",
  "America/Los_Angeles": "US-CA",
};

const TIME_ZONE_ALIASES = [
  ["Asia/Calcutta", "Asia/Kolkata"],
  ["Europe/Kiev", "Europe/Kyiv"],
  ["Asia/Saigon", "Asia/Ho_Chi_Minh"],
  ["Pacific/Truk", "Pacific/Chuuk"],
  ["Pacific/Ponape", "Pacific/Pohnpei"],
  ["Asia/Katmandu", "Asia/Kathmandu"],
  ["Asia/Rangoon", "Asia/Yangon"],
  ["America/Godthab", "America/Nuuk"],
  ["Atlantic/Faeroe", "Atlantic/Faroe"],
  ["America/Buenos_Aires", "America/Argentina/Buenos_Aires"],
  ["America/Indianapolis", "America/Indiana/Indianapolis"],
  ["America/Louisville", "America/Kentucky/Louisville"],
  ["Asia/Dacca", "Asia/Dhaka"],
  ["Asia/Thimbu", "Asia/Thimphu"],
  ["Asia/Ujung_Pandang", "Asia/Makassar"],
  ["Asia/Ulan_Bator", "Asia/Ulaanbaatar"],
  ["Asia/Macao", "Asia/Macau"],
  ["Africa/Asmera", "Africa/Asmara"],
  ["Asia/Tel_Aviv", "Asia/Jerusalem"],
];

const policyOutcome = (country) => {
  if (EUROPE_OPT_IN_COUNTRIES.has(country)) return "europe-opt-in";
  if (country === "CA") return "canada-opt-in";
  return "world";
};

const applyAliases = (table, aliases) => {
  for (const [first, second] of aliases) {
    if (Object.hasOwn(table, first) && !Object.hasOwn(table, second)) table[second] = table[first];
    if (Object.hasOwn(table, second) && !Object.hasOwn(table, first)) table[first] = table[second];
  }
  return table;
};

export const buildTimeZoneCountries = ({
  countries,
  timeZonesOf,
  policyOf = policyOutcome,
  overrides = REGION_OVERRIDES,
  aliases = TIME_ZONE_ALIASES,
}) => {
  const claimants = new Map();
  for (const country of countries) {
    for (const zone of timeZonesOf(country) ?? []) {
      claimants.set(zone, [...(claimants.get(zone) ?? []), country]);
    }
  }

  const table = {};
  for (const [zone, zoneCountries] of claimants) {
    const outcomes = new Set(zoneCountries.map((country) => policyOf(country)));
    if (outcomes.size === 1) table[zone] = zoneCountries[0];
  }
  for (const [zone, region] of Object.entries(overrides)) {
    table[zone] = region;
  }
  applyAliases(table, aliases);

  return Object.fromEntries(
    Object.keys(table)
      .sort()
      .map((zone) => [zone, table[zone]])
  );
};

export const renderTimeZoneCountries = (table) =>
  [
    "export const timeZoneCountries = {",
    ...Object.entries(table).map(
      ([zone, value]) => `  ${JSON.stringify(zone)}: ${JSON.stringify(value)},`
    ),
    "};",
    "",
  ].join("\n");

const TARGET_PATH = fileURLToPath(new URL("../src/consent/time-zone-countries.mjs", import.meta.url));

const main = () => {
  const table = buildTimeZoneCountries({
    countries: ISO_COUNTRY_CODES,
    timeZonesOf: (country) => new Intl.Locale(`und-${country}`).getTimeZones(),
  });
  fs.writeFileSync(TARGET_PATH, renderTimeZoneCountries(table));
  console.log(`Wrote ${Object.keys(table).length} time zones to ${TARGET_PATH}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
