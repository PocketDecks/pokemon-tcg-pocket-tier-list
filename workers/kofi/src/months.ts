const AMOUNT = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

export const parseAmountPence = (amount: string): number | null => {
  const match = AMOUNT.exec(amount.trim());
  if (!match) return null;
  const pounds = Number(match[1]);
  const pence = Number((match[2] ?? "").padEnd(2, "0") || "0");
  return pounds * 100 + pence;
};

export const MAX_MONTHS = 120;

export const monthsForPayment = (amountPence: number, currency: string): number => {
  if (currency.toUpperCase() !== "GBP") return 0;
  const months = Math.floor(amountPence / 100);
  return months > MAX_MONTHS ? 0 : months;
};

const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

export const addCalendarMonths = (from: Date, months: number): Date => {
  const totalMonths = from.getUTCFullYear() * 12 + from.getUTCMonth() + months;
  const year = Math.floor(totalMonths / 12);
  const monthIndex = totalMonths - year * 12;
  const day = Math.min(from.getUTCDate(), daysInMonth(year, monthIndex));
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
};

export const monthKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
