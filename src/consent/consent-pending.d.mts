import type { PolicyConfig } from "c15t";

export interface ConsentPendingData {
  fallback: 0 | 1;
  unmatched: 0 | 1;
  zones: Record<string, string[]>;
  countries: Record<string, 0 | 1>;
  regions: Record<string, 0 | 1>;
}

export declare const buildConsentPendingData: (
  policies?: PolicyConfig[],
  table?: Record<string, string>
) => Promise<ConsentPendingData>;

export declare const consentPendingScript: (data: ConsentPendingData) => string;
