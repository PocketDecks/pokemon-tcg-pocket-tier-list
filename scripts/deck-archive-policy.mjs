export const hubEntries = (archive, hub) => archive.filter((entry) => entry.hub === hub);

export const shouldIndexHub = (entries) => entries.length > 0;
