const CODE = /PD-[A-Z0-9]{6}(?![A-Z0-9])/;

export const extractCode = (message: string): string | null => CODE.exec(message)?.[0] ?? null;
