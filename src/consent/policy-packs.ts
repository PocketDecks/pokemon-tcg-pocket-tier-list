import { policyPackPresets, type PolicyConfig } from "c15t";
import { EUROPE_OPT_IN_EXTRA_COUNTRIES } from "./policy-countries.mjs";

const europeOptIn = policyPackPresets.europeOptIn();
const europe: PolicyConfig = {
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

const canada: PolicyConfig = {
  ...policyPackPresets.quebecOptIn(),
  id: "canada_opt_in",
  match: { countries: ["CA"] },
};

export const policyPacks: PolicyConfig[] = [
  europe,
  policyPackPresets.quebecOptIn(),
  canada,
  policyPackPresets.californiaOptOut(),
  policyPackPresets.worldNoBanner(),
];
