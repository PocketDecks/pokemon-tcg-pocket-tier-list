import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { isValidMonths } from "../src/ids";
import { MAX_MONTHS } from "../src/months";

export class UsageError extends Error {}

export const resolveUserPath = (
  path: string,
  env: Record<string, string | undefined>,
  cwd: string,
): string => resolve(env.INIT_CWD ?? cwd, path);

export const DEFAULT_URL = "https://pocketdecks-kofi.pocketdecks.workers.dev";

/** Exactly one of these: the account to credit. */
export type GrantTarget = { uid: string; email?: undefined } | { uid?: undefined; email: string };

/** Exactly one of these: how the grant is sent. */
type GrantTransport =
  | { keyPath: string; tokenFile?: undefined; url: string }
  | { tokenFile: string; keyPath?: undefined; url: string };

export type GrantArgs =
  | { help: true; url?: undefined }
  | ({ help: false; paymentId: string; months?: number; dryRun: boolean } & GrantTarget &
      GrantTransport);

export const USAGE = `Usage:
  yarn --cwd workers/kofi grant --payment <id> (--uid <uid> | --email <email>) --token-file <path> [--url <base>] [--months <n>] [--dry-run]
  yarn --cwd workers/kofi grant --payment <id> (--uid <uid> | --email <email>) --key <file> [--months <n>] [--dry-run]

Options:
  --payment     id of the kofiPayments document to grant
  --uid         Firebase Authentication uid of the account to credit
  --email       email of the account to credit; it must match one verified, enabled account
  --token-file  path to a file holding the admin token; sends the grant to the live Worker
  --url         base address of the Worker, default ${DEFAULT_URL}
  --key         path to the kofi-receiver service account JSON key; writes to Firestore directly
  --months      months to grant, 1 to ${MAX_MONTHS}; required when the payment stores none
  --dry-run     read and report only, write nothing
  --help        show this text

Give exactly one of --uid and --email, and exactly one of --token-file and --key.
`;

const MONTHS = /^[0-9]{1,3}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const parseUrl = (value: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UsageError("--url must be a full web address");
  }
  const secure = parsed.protocol === "https:";
  const local = parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname);
  if (!secure && !local) {
    throw new UsageError("--url must start with https:// (http:// is allowed for localhost only)");
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
};

const pickTarget = (uid: string | undefined, email: string | undefined): GrantTarget => {
  if ((uid === undefined) === (email === undefined)) {
    throw new UsageError("Give exactly one of --uid and --email");
  }
  if (uid !== undefined) {
    if (!uid) throw new UsageError("--uid must not be empty");
    return { uid };
  }
  if (!email?.trim()) throw new UsageError("--email must not be empty");
  return { email };
};

const pickTransport = (
  key: string | undefined,
  tokenFile: string | undefined,
  url: string | undefined,
): GrantTransport => {
  if ((key === undefined) === (tokenFile === undefined)) {
    throw new UsageError("Give exactly one of --key and --token-file");
  }
  if (key !== undefined) {
    if (!key) throw new UsageError("--key must not be empty");
    if (url !== undefined) throw new UsageError("--url only applies with --token-file");
    return { keyPath: key, url: DEFAULT_URL };
  }
  if (!tokenFile) throw new UsageError("--token-file must not be empty");
  return { tokenFile, url: url === undefined ? DEFAULT_URL : parseUrl(url) };
};

export const parseGrantArgs = (argv: string[]): GrantArgs => {
  let values: {
    payment?: string;
    uid?: string;
    email?: string;
    key?: string;
    "token-file"?: string;
    url?: string;
    months?: string;
    "dry-run"?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        payment: { type: "string" },
        uid: { type: "string" },
        email: { type: "string" },
        key: { type: "string" },
        "token-file": { type: "string" },
        url: { type: "string" },
        months: { type: "string" },
        "dry-run": { type: "boolean" },
        help: { type: "boolean" },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : "Invalid arguments");
  }

  if (values.help) return { help: true };
  if (!values.payment) throw new UsageError("--payment is required");

  const target = pickTarget(values.uid, values.email);
  const transport = pickTransport(values.key, values["token-file"], values.url);

  let months: number | undefined;
  if (values.months !== undefined) {
    const parsed = MONTHS.test(values.months) ? Number(values.months) : Number.NaN;
    if (!isValidMonths(parsed)) {
      throw new UsageError(`--months must be a whole number from 1 to ${MAX_MONTHS}`);
    }
    months = parsed;
  }

  return {
    help: false,
    paymentId: values.payment,
    ...target,
    ...transport,
    months,
    dryRun: values["dry-run"] === true,
  };
};
