/**
 * Philippine mobile numbers for the SMS providers.
 *
 * Numbers are stored normalized to 09XXXXXXXXX: the form in Semaphore's request
 * examples (semaphore.co/docs, "Sending Messages"). textbee recommends E.164
 * (textbee.dev/docs, "Sending SMS"), so its provider converts with toE164().
 *
 * Accepted input: 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX, with
 * optional spaces, dashes, dots or parentheses ("+63 917-123-4567").
 */
const SEPARATORS = /[\s\-.()]/g;
const PH_MOBILE = /^(?:\+?63|0)?(9\d{9})$/;

/** "+63 917 123 4567" → "09171234567"; null if it isn't a PH mobile number. */
export function normalizePhMobile(input: string): string | null {
  const match = PH_MOBILE.exec(input.replace(SEPARATORS, ''));
  return match ? `0${match[1] ?? ''}` : null;
}

/** "09171234567" → "+639171234567" (E.164). Expects a normalized number. */
export function toE164(phMobile: string): string {
  return `+63${phMobile.replace(/^0/, '')}`;
}

export interface PhoneList {
  /** Normalized (09XXXXXXXXX), duplicates removed, in the given order. */
  numbers: string[];
  /** 1-based positions of entries that are not PH mobile numbers. */
  invalidPositions: number[];
}

/** ALERT_PHONE_NUMBERS: comma- (or semicolon-) separated; blank entries are ignored. */
export function parsePhoneList(raw: string): PhoneList {
  const numbers: string[] = [];
  const invalidPositions: number[] = [];
  raw
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry, i) => {
      const n = normalizePhMobile(entry);
      if (n === null) invalidPositions.push(i + 1);
      else if (!numbers.includes(n)) numbers.push(n);
    });
  return { numbers, invalidPositions };
}

/** "091••••4567": enough to recognise a number, nothing to leak into logs or the API. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 7) return '••••';
  return `${digits.slice(0, 3)}${'•'.repeat(digits.length - 7)}${digits.slice(-4)}`;
}

/** Masks every phone-like digit run (10–13 digits) in free text, e.g. a provider answer. */
export function maskPhonesInText(text: string): string {
  return text.replace(/\+?\d{10,13}/g, (m) => maskPhone(m));
}
