import { OfflineClient } from "c15t";
import { policyPacks } from "./policy-packs.mjs";
import { regionFromTimeZone } from "./visitor-region.mjs";
import { timeZoneCountries } from "./time-zone-countries.mjs";
import { CONSENT_PENDING_ATTRIBUTE, CONSENT_STORAGE_KEY, REGION_COOKIE } from "./consent-pending-keys.mjs";


const showsBanner = async (policies, { country, region }) => {
  const headers = {};
  if (country) headers["x-c15t-country"] = country;
  if (region) headers["x-c15t-region"] = region;
  const response = await new OfflineClient(undefined, undefined, undefined, {
    policyPacks: policies,
  }).init({ headers });
  const policy = response.data?.policy;
  if (!policy) return 0;
  const mode = policy.ui?.mode;
  return (mode === undefined ? policy.model !== "none" : mode !== "none") ? 1 : 0;
};

export const buildConsentPendingData = async (
  policies = policyPacks,
  table = timeZoneCountries
) => {
  const fallback = await showsBanner(policies, {});

  const zones = {};
  for (const zone of Object.keys(table)) {
    const region = regionFromTimeZone(zone);
    if (!region) continue;
    if ((await showsBanner(policies, region)) === fallback) continue;
    const slash = zone.indexOf("/");
    const key = slash < 0 ? zone : zone.slice(0, slash);
    const rest = slash < 0 ? "" : zone.slice(slash + 1);
    (zones[key] ??= []).push(rest);
  }

  const countries = new Set();
  const regionKeys = new Set();
  for (const policy of policies) {
    for (const country of policy.match.countries ?? []) countries.add(country);
    for (const { country, region } of policy.match.regions ?? []) {
      regionKeys.add(`${country}-${region}`);
    }
  }

  const countryBanners = {};
  for (const country of [...countries].sort()) {
    countryBanners[country] = await showsBanner(policies, { country });
  }

  const regions = {};
  for (const key of regionKeys) {
    const [country, region] = key.split("-");
    regions[key] = await showsBanner(policies, { country, region });
  }

  return {
    fallback,
    unmatched: await showsBanner(policies, { country: "ZZ" }),
    zones,
    countries: countryBanners,
    regions,
  };
};

export const consentPendingScript = (data) => `(function(){
try{
var root=document.documentElement;
var stored=false;
try{var raw=localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)});if(raw){var saved=JSON.parse(raw);stored=!!(saved&&saved.consentInfo&&!saved.consentInfo.requiresReconsent)}}catch(e){}
if(!stored){try{var cookie=document.cookie.split(";").map(function(part){return part.trim()}).filter(function(part){return part.indexOf(${JSON.stringify(CONSENT_STORAGE_KEY + "=")})===0})[0];stored=cookie!==undefined&&!/(?:^|,)i\\.requiresReconsent:1(?:,|$)/.test(cookie.slice(${CONSENT_STORAGE_KEY.length + 1}))}catch(e){}}
if(stored)return;
var data=${JSON.stringify(data)};
var geo=null;
try{
var entry=document.cookie.split(";").map(function(part){return part.trim()}).filter(function(part){return part.indexOf(${JSON.stringify(REGION_COOKIE + "=")})===0})[0];
if(entry!==undefined){
var parts=entry.slice(${REGION_COOKIE.length + 1}).split("-");
if(parts.length===2&&/^[A-Z]{2}$/.test(parts[0])&&parts[0]!=="XX"&&parts[0]!=="T1"&&(parts[1]===""||/^[A-Z0-9]{1,3}$/.test(parts[1])))geo={country:parts[0],region:parts[1]}
}
}catch(e){}
var banner;
if(geo){
var byRegion=geo.region?data.regions[geo.country+"-"+geo.region]:undefined;
var byCountry=data.countries[geo.country];
banner=byRegion!==undefined?byRegion:byCountry!==undefined?byCountry:data.unmatched;
}else{
var zone=null;
try{zone=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}
banner=data.fallback;
if(typeof zone==="string"){
var slash=zone.indexOf("/");
var key=slash<0?zone:zone.slice(0,slash);
var group=Object.prototype.hasOwnProperty.call(data.zones,key)?data.zones[key]:null;
if(group&&group.indexOf(slash<0?"":zone.slice(slash+1))>=0)banner=data.fallback?0:1;
}
}
if(banner)root.setAttribute(${JSON.stringify(CONSENT_PENDING_ATTRIBUTE)},"");
}catch(e){}
})();`;
