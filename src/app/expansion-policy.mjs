export const DELUXE_EXPANSION_IDS = new Set(["a4b", "b4b"]);

export const isListedExpansion = (expansion) => !DELUXE_EXPANSION_IDS.has(expansion.id);

export const newestExpansion = (list) =>
  list
    .filter((expansion) => isListedExpansion(expansion) && expansion.release_date)
    .reduce(
      (newest, expansion) =>
        !newest || expansion.release_date > newest.release_date ? expansion : newest,
      null
    );
