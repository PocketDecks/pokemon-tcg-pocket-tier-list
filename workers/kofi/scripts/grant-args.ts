import { parseArgs } from "node:util";

export class UsageError extends Error {}

export interface GrantArgs {
  help: boolean;
  paymentId: string;
  uid: string;
  keyPath: string;
  months?: number;
  dryRun: boolean;
}

export const USAGE = `Usage:
  yarn --cwd workers/kofi grant --payment <id> --uid <uid> --key <file> [--months <n>] [--dry-run]

Options:
  --payment   id of the kofiPayments document to grant
  --uid       Firebase Authentication uid of the account to credit
  --key       path to the kofi-receiver service account JSON key
  --months    months to grant, 1 to 120; required when the payment stores none
  --dry-run   read and report only, write nothing
  --help      show this text
`;

const MONTHS = /^[0-9]{1,3}$/;

export const parseGrantArgs = (argv: string[]): GrantArgs => {
  let values: {
    payment?: string;
    uid?: string;
    key?: string;
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
        key: { type: "string" },
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
    return { help: true, paymentId: "", uid: "", keyPath: "", dryRun: false };
  }
  if (!values.payment) throw new UsageError("--payment is required");
  if (!values.uid) throw new UsageError("--uid is required");
  if (!values.key) throw new UsageError("--key is required");

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
    keyPath: values.key,
    months,
    dryRun: values["dry-run"] === true,
  };
};
