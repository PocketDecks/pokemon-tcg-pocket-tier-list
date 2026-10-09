import { timeZoneCountries } from "./time-zone-countries.mjs";

const REGION_COOKIE = "pd_geo";
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const REGION_PATTERN = /^[A-Z0-9]{1,3}$/;
const UNKNOWN_COUNTRIES = new Set(["XX", "T1"]);

export const readRegionCookie = (cookie) => {
  const prefix = `${REGION_COOKIE}=`;
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (entry === undefined) return null;

  const parts = entry.slice(prefix.length).split("-");
  if (parts.length !== 2) return null;

  const [country, region] = parts;
  if (!COUNTRY_PATTERN.test(country) || UNKNOWN_COUNTRIES.has(country)) return null;
  if (region === "") return { country };
  return REGION_PATTERN.test(region) ? { country, region } : null;
};

export const regionFromTimeZone = (timeZone) => {
  if (!Object.hasOwn(timeZoneCountries, timeZone)) return null;
  const [country, region] = timeZoneCountries[timeZone].split("-");
  return region === undefined ? { country } : { country, region };
};

export const resolveVisitorRegion = ({
  cookie,
  timeZone,
}) =>
  readRegionCookie(cookie) ?? (timeZone === null ? null : regionFromTimeZone(timeZone));
