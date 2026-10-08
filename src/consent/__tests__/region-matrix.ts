export interface Row {
  name: string;
  cookie?: string;
  timeZone: string | null;
  policyId: string;
  banner: boolean;
  analytics: "granted" | "denied";
  ads: "granted" | "denied";
}

export const rows: Row[] = [
  { name: "Europe/Berlin", timeZone: "Europe/Berlin", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Europe/London", timeZone: "Europe/London", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Europe/Zurich", timeZone: "Europe/Zurich", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Atlantic/Canary", timeZone: "Atlantic/Canary", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Indian/Reunion", timeZone: "Indian/Reunion", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Europe/Jersey", timeZone: "Europe/Jersey", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "Asia/Kolkata", timeZone: "Asia/Kolkata", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "Europe/Kyiv", timeZone: "Europe/Kyiv", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "America/Toronto", timeZone: "America/Toronto", policyId: "quebec_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "America/Vancouver", timeZone: "America/Vancouver", policyId: "canada_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "America/Los_Angeles", timeZone: "America/Los_Angeles", policyId: "california_opt_out", banner: false, analytics: "granted", ads: "granted" },
  { name: "America/New_York", timeZone: "America/New_York", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "Asia/Tokyo", timeZone: "Asia/Tokyo", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "Etc/UTC", timeZone: "Etc/UTC", policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "missing time zone", timeZone: null, policyId: "europe_opt_in", banner: true, analytics: "denied", ads: "denied" },
  { name: "cookie JP-13 over Europe/Berlin", cookie: "pd_geo=JP-13", timeZone: "Europe/Berlin", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "cookie XX- over Asia/Tokyo", cookie: "pd_geo=XX-", timeZone: "Asia/Tokyo", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "cookie US-NY over Europe/Berlin", cookie: "pd_geo=US-NY", timeZone: "Europe/Berlin", policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
  { name: "cookie JP-13 with missing time zone", cookie: "pd_geo=JP-13", timeZone: null, policyId: "world_no_banner", banner: false, analytics: "granted", ads: "granted" },
];
