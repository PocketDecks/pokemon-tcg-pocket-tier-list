import { parseArgs } from "node:util";

export class UsageError extends Error {}

export const DEFAULT_URL = "https://pocketdecks-kofi.pocketdecks.workers.dev";

export interface GrantArgs {
  help: boolean;
  paymentId: string;
  uid?: string;
  email?: string;
  keyPath?: string;
  tokenFile?: string;
  url: string;
  months?: number;
  dryRun: boolean;
}

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
  --months      months to grant, 1 to 120; required when the payment stores none
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

  if (values.help) {
    return { help: true, paymentId: "", url: DEFAULT_URL, dryRun: false };
  }
  if (!values.payment) throw new UsageError("--payment is required");

  const hasUid = values.uid !== undefined;
  const hasEmail = values.email !== undefined;
  if (hasUid === hasEmail) throw new UsageError("Give exactly one of --uid and --email");
  if (hasUid && !values.uid) throw new UsageError("--uid must not be empty");
  if (hasEmail && !values.email?.trim()) throw new UsageError("--email must not be empty");

  const hasKey = values.key !== undefined;
  const hasTokenFile = values["token-file"] !== undefined;
  if (hasKey === hasTokenFile) throw new UsageError("Give exactly one of --key and --token-file");
  if (hasKey && !values.key) throw new UsageError("--key must not be empty");
  if (hasTokenFile && !values["token-file"]) throw new UsageError("--token-file must not be empty");
  if (hasKey && values.url !== undefined) throw new UsageError("--url only applies with --token-file");

  let months: number | undefined;
  if (values.months !== undefined) {
    const parsed = MONTHS.test(values.months) ? Number(values.months) : Number.NaN;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 120) {
      throw new UsageError("--months must be a whole number from 1 to 120");
    }
    months = parsed;
  }

  return {
    help: false,
    paymentId: values.payment,
    uid: values.uid,
    email: values.email,
    keyPath: values.key,
    tokenFile: values["token-file"],
    url: values.url === undefined ? DEFAULT_URL : parseUrl(values.url),
    months,
    dryRun: values["dry-run"] === true,
  };
};
