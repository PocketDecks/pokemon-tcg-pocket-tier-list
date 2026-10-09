import { policyPackPresets } from "c15t";
import { EUROPE_OPT_IN_EXTRA_COUNTRIES } from "./policy-countries.mjs";

const europeOptIn = policyPackPresets.europeOptIn();
const europe = {
  ...europeOptIn,
  match: {
    ...europeOptIn.match,
    countries: [...(europeOptIn.match.countries ?? []), ...EUROPE_OPT_IN_EXTRA_COUNTRIES],
  },
  consent: {
    ...europeOptIn.consent,
    categories: ["necessary", "measurement"],
    scopeMode: "strict",
  },
};

const canada = {
  ...policyPackPresets.quebecOptIn(),
  id: "canada_opt_in",
  match: { countries: ["CA"] },
};

export const policyPacks = [
  europe,
  policyPackPresets.quebecOptIn(),
  canada,
  policyPackPresets.californiaOptOut(),
  policyPackPresets.worldNoBanner(),
];
