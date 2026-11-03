export const hubEntries = (archive, hub) => archive.filter((entry) => entry.hub === hub);

export const shouldIndexHub = (entries, liveVariants, previousExpansionDate) =>
  entries.some((entry) => liveVariants.has(entry.variant) || entry.lastSeen >= previousExpansionDate);
