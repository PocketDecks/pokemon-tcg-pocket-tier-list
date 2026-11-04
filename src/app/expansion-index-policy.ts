import { isListedExpansion, newestExpansion } from "./expansion-policy.mjs";

type ExpansionPolicyInput = { id: string; name: string; release_date: string | null };

export const expansionIndexPolicy = (
  expansions: ExpansionPolicyInput[],
  coveredIds: Set<string>
) => {
  const covered = expansions.filter(
    (expansion) => isListedExpansion(expansion) && coveredIds.has(expansion.id)
  );
  const newest = newestExpansion(covered);
  const ordered = covered
    .filter((expansion): expansion is ExpansionPolicyInput & { release_date: string } => Boolean(expansion.release_date))
    .sort((a, b) => b.release_date.localeCompare(a.release_date));
  const previous = ordered.find((expansion) => expansion.id !== newest?.id) ?? null;
  const indexable = new Set([newest?.id, previous?.id].filter(Boolean));
  return {
    newest,
    previous,
    isIndexable: (id: string) => indexable.has(id),
  };
};
