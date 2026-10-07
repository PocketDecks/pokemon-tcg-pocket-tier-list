export const formatTrendDay = (value: string, language: string): string => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(language, {
        day: "numeric",
        month: "short",
        ...(dateOnly ? { timeZone: "UTC" } : {}),
      });
};
