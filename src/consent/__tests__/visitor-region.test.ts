import { describe, expect, it } from "vitest";
import { readRegionCookie, regionFromTimeZone, resolveVisitorRegion } from "../visitor-region";

describe("readRegionCookie", () => {
  it.each([
    ["pd_geo=DE-BY", { country: "DE", region: "BY" }],
    ["pd_geo=GB-ENG", { country: "GB", region: "ENG" }],
    ["pd_geo=JP-13", { country: "JP", region: "13" }],
    ["pd_geo=US-", { country: "US" }],
    ["theme=dark; pd_geo=US-CA; other=1", { country: "US", region: "CA" }],
  ])("parses %s", (cookie, expected) => {
    expect(readRegionCookie(cookie)).toEqual(expected);
  });

  it.each([
    "",
    "theme=dark",
    "pd_geo=",
    "pd_geo=XX-",
    "pd_geo=T1-",
    "pd_geo=de-by",
    "pd_geo=DE-by",
    "pd_geo=DEU-BY",
    "pd_geo=DE",
    "pd_geo=DE-BY-1",
    "pd_geo=DE-ABCD",
  ])("returns null for %j", (cookie) => {
    expect(readRegionCookie(cookie)).toBeNull();
  });
});

describe("regionFromTimeZone", () => {
  it.each([
    ["Europe/Berlin", { country: "DE" }],
    ["Europe/London", { country: "GB" }],
    ["Europe/Zurich", { country: "CH" }],
    ["America/Toronto", { country: "CA", region: "QC" }],
    ["America/Montreal", { country: "CA", region: "QC" }],
    ["America/Vancouver", { country: "CA" }],
    ["America/Los_Angeles", { country: "US", region: "CA" }],
    ["America/New_York", { country: "US" }],
    ["Asia/Tokyo", { country: "JP" }],
    ["Asia/Calcutta", { country: "IN" }],
    ["Asia/Kolkata", { country: "IN" }],
    ["Europe/Kiev", { country: "UA" }],
    ["Europe/Kyiv", { country: "UA" }],
    ["Asia/Saigon", { country: "VN" }],
    ["Asia/Ho_Chi_Minh", { country: "VN" }],
    ["Pacific/Truk", { country: "FM" }],
    ["Pacific/Chuuk", { country: "FM" }],
    ["America/Indiana/Indianapolis", { country: "US" }],
    ["America/Kentucky/Louisville", { country: "US" }],
    ["Atlantic/Canary", { country: "ES" }],
    ["Atlantic/Madeira", { country: "PT" }],
    ["Atlantic/Azores", { country: "PT" }],
    ["Africa/Ceuta", { country: "ES" }],
    ["Indian/Reunion", { country: "RE" }],
    ["Indian/Mayotte", { country: "YT" }],
    ["America/Cayenne", { country: "GF" }],
    ["America/Guadeloupe", { country: "GP" }],
    ["America/Martinique", { country: "MQ" }],
    ["America/Marigot", { country: "MF" }],
    ["Europe/Mariehamn", { country: "AX" }],
  ])("maps %s", (timeZone, expected) => {
    expect(regionFromTimeZone(timeZone)).toEqual(expected);
  });

  it.each(["UTC", "GMT", "Etc/UTC", "Etc/GMT+5", "Mars/Olympus_Mons", "", "constructor"])(
    "returns null for %j",
    (timeZone) => {
      expect(regionFromTimeZone(timeZone)).toBeNull();
    }
  );
});

describe("resolveVisitorRegion", () => {
  it("prefers a valid cookie over the time zone", () => {
    expect(resolveVisitorRegion({ cookie: "pd_geo=JP-13", timeZone: "Europe/Berlin" })).toEqual({
      country: "JP",
      region: "13",
    });
  });

  it("ignores an unknown cookie and uses the time zone", () => {
    expect(resolveVisitorRegion({ cookie: "pd_geo=XX-", timeZone: "Asia/Tokyo" })).toEqual({
      country: "JP",
    });
  });

  it("returns null when neither the cookie nor the time zone resolve", () => {
    expect(resolveVisitorRegion({ cookie: "", timeZone: "Etc/UTC" })).toBeNull();
  });
});
