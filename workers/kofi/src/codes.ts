const CODE = /(?<![A-Z0-9])PD-[A-Z0-9]{6}(?![A-Z0-9])/i;

export const extractCode = (message: string): string | null =>
  CODE.exec(message)?.[0].toUpperCase() ?? null;
