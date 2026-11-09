import { E164_PATTERN } from '@/types/api';

/**
 * What people type → international format. Handles Philippine numbers written
 * the usual ways ("0917 123 4567", "639171234567", "9171234567") and keeps any
 * "+…" number as typed. The result is NOT validated: check it with E164_PATTERN.
 */
export function normalizePhone(input: string): string {
  const compact = input.replace(/[\s\-().]/g, '');
  if (compact.startsWith('+')) return `+${compact.slice(1).replace(/\D/g, '')}`;
  const digits = compact.replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  return digits === '' ? '' : `+${digits}`;
}

export function isValidPhone(normalized: string): boolean {
  return E164_PATTERN.test(normalized);
}

/** "+63 917 123 4567" for Philippine numbers, otherwise unchanged. */
export function formatPhone(phone: string): string {
  const m = /^\+63(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `+63 ${m[1]} ${m[2]} ${m[3]}` : phone;
}
