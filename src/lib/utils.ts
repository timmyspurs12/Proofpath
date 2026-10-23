import clsx, { type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}
