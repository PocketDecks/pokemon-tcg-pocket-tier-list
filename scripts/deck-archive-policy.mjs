import expansions from "pokemon-tcg-pocket-cards/data/v5/expansions.min.json" with { type: "json" };
import { isListedExpansion, newestExpansion } from "../src/app/expansion-policy.mjs";

export const previousExpansionDate = (list = expansions) => {
  const newest = newestExpansion(list);
  return list
    .filter((expansion) => isListedExpansion(expansion) && expansion.release_date && expansion.id !== newest?.id)
    .reduce((latest, expansion) => (expansion.release_date > latest ? expansion.release_date : latest), "1970-01-01");
};

export const hubEntries = (archive, hub) => archive.filter((entry) => entry.hub === hub);

export const shouldIndexHub = (entries, liveVariants, previousDate = previousExpansionDate()) =>
  entries.some((entry) => liveVariants.has(entry.variant) || entry.lastSeen >= previousDate);
