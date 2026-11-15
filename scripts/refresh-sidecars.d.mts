export type ProofRecord = {
  version?: number;
  pid?: number;
  target?: string;
  temporary?: string;
  sha256?: string;
  targetSha256?: string;
};

export const sha256: (data: string | Uint8Array) => string;
export const SIDECAR_SUFFIXES: {
  readonly temporary: string;
  readonly proof: string;
  readonly backup: string;
  readonly marker: string;
};
export const sidecarNames: (target: string) => {
  temporary: string;
  proof: string;
  backup: string;
  marker: string;
};
export const SIDECAR_SUFFIX: RegExp;
export const ATOMIC_SUFFIX_SOURCE: string;
export const atomicTemporaryName: (destination: string, pid: number | string, uuid: string) => string;
export const atomicProofName: (temporary: string) => string;
export const parseAtomicTemporary: (
  name: string
) => { target: string; pid: number; temporary: string } | undefined;
export const buildArtefactProof: (input: { content: string; previous: string | null }) => string;
export const buildAtomicProof: (input: {
  destination: string;
  temporary: string;
  contents: string | Uint8Array;
}) => string;
export const readProof: (file: string) => ProofRecord | undefined;
export const proofCoversTemporary: (record: ProofRecord, temporaryBytes: string | Uint8Array) => boolean;
export const proofCoversTarget: (record: ProofRecord, targetBytes: string | Uint8Array) => boolean;
export const proofIsWellFormed: (record: ProofRecord) => boolean;
export const atomicProofIssue: (
  record: ProofRecord | undefined,
  expected: { pid: number; target: string; temporary: string },
  readTemporary?: () => Uint8Array
) => boolean;
export const JOURNAL_NAME: string;
export const git: (root: string, ...args: string[]) => string;
export const refreshJournalPath: (root: string) => string;
export const isJournalForHead: (journal: unknown, head: string) => boolean;
export const isRefreshActiveFor: (destination: string) => boolean;
