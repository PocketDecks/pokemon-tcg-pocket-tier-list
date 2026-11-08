import { parseArgs } from "node:util";

export const ENTITLEMENT_COLLECTION = "entitlements";
export const DEFAULT_GRANT_SOURCE = "manual";

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SOURCE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface EntitlementData {
  premium: boolean;
  source: string;
  expiresAt?: Date;
  updatedAt: Date;
}

export interface PremiumGrantPlan {
  path: string;
  data: EntitlementData;
}

export interface GrantArgs {
  uid: string;
  until: string | undefined;
  source: string | undefined;
  revoke: boolean;
  dryRun: boolean;
}

const endOfDay = (value: string): Date => {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`--until must be YYYY-MM-DD, received "${value}"`);
  const [, year, month, day] = match;
  const date = new Date(`${value}T23:59:59.999Z`);
  const valid =
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day);
  if (!valid) throw new Error(`--until must be YYYY-MM-DD, received "${value}"`);
  return date;
};

export const planPremiumGrant = ({
  uid,
  until,
  source = DEFAULT_GRANT_SOURCE,
  revoke = false,
  now,
}: {
  uid: string;
  until?: string;
  source?: string;
  revoke?: boolean;
  now: Date;
}): PremiumGrantPlan => {
  if (!UID_PATTERN.test(uid)) {
    throw new Error("uid must be 1 to 128 letters, digits, underscores or hyphens");
  }
  if (!SOURCE_PATTERN.test(source)) {
    throw new Error("source must be 1 to 64 letters, digits, underscores or hyphens");
  }
  const path = `${ENTITLEMENT_COLLECTION}/${uid}`;

  if (revoke) {
    if (until !== undefined) throw new Error("--until cannot be combined with --revoke");
    return { path, data: { premium: false, source, updatedAt: now } };
  }

  if (until === undefined) {
    return { path, data: { premium: true, source, updatedAt: now } };
  }

  const expiresAt = endOfDay(until);
  if (expiresAt.getTime() <= now.getTime()) {
    throw new Error(`--until must be in the future, ${until} has already passed`);
  }
  return { path, data: { premium: true, source, expiresAt, updatedAt: now } };
};

export const parseGrantArgs = (argv: readonly string[]): GrantArgs => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      uid: { type: "string" },
      until: { type: "string" },
      source: { type: "string" },
      revoke: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
    strict: true,
  });
  if (!values.uid) throw new Error("--uid is required");
  return {
    uid: values.uid,
    until: values.until,
    source: values.source,
    revoke: values.revoke ?? false,
    dryRun: values["dry-run"] ?? false,
  };
};
