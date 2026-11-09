import { ThresholdsUpdateSchema, type Thresholds, type ThresholdsUpdate } from '@/types/api';

export type ThresholdKey = keyof ThresholdsUpdate;

export const THRESHOLD_KEYS = [
  'fanOnTemp',
  'fanOffTemp',
  'airTempMin',
  'airTempMax',
  'humidityMin',
  'humidityMax',
  'soilMoistureMin',
  'soilMoistureMax',
  'luxMin',
  'luxMax',
] as const satisfies readonly ThresholdKey[];

/** Text typed in each field. Empty min/max = no limit; fan fields are required. */
export type ThresholdsForm = Record<ThresholdKey, string>;
export type FieldErrors = Partial<Record<ThresholdKey, string>>;

const REQUIRED: ReadonlySet<ThresholdKey> = new Set(['fanOnTemp', 'fanOffTemp']);

/** Fields validated together: an error on one is shown once either was edited. */
export const PARTNER: Record<ThresholdKey, ThresholdKey> = {
  fanOnTemp: 'fanOffTemp',
  fanOffTemp: 'fanOnTemp',
  airTempMin: 'airTempMax',
  airTempMax: 'airTempMin',
  humidityMin: 'humidityMax',
  humidityMax: 'humidityMin',
  soilMoistureMin: 'soilMoistureMax',
  soilMoistureMax: 'soilMoistureMin',
  luxMin: 'luxMax',
  luxMax: 'luxMin',
};

export function isThresholdKey(key: string): key is ThresholdKey {
  return (THRESHOLD_KEYS as readonly string[]).includes(key);
}

const LUX_KEYS: ReadonlySet<ThresholdKey> = new Set(['luxMin', 'luxMax']);

/** Light limits read better as "60k" than "60000" (exact multiples of 100 only, so it round-trips). */
function formatField(key: ThresholdKey, v: number): string {
  if (LUX_KEYS.has(key) && v >= 1000 && v % 100 === 0) return `${String(v / 1000)}k`;
  return String(v);
}

export function toForm(t: Thresholds): ThresholdsForm {
  const form = {} as ThresholdsForm;
  for (const key of THRESHOLD_KEYS) {
    const v = t[key];
    form[key] = v === null ? '' : formatField(key, v);
  }
  return form;
}

/** "" → null (no limit) or NaN (required); accepts a decimal comma and "60k" for light; junk → NaN. */
function parseField(key: ThresholdKey, text: string): number | null {
  let s = text.trim().replace(',', '.');
  if (s === '') return REQUIRED.has(key) ? Number.NaN : null;
  let factor = 1;
  if (LUX_KEYS.has(key) && /k$/i.test(s)) {
    factor = 1000;
    s = s.slice(0, -1).trim();
  }
  return /^-?\d+(\.\d+)?$|^-?\.\d+$/.test(s)
    ? Math.round(Number(s) * factor * 100) / 100
    : Number.NaN;
}

/** Form text → request values (not yet validated). */
export function fromForm(form: ThresholdsForm): Record<ThresholdKey, number | null> {
  const out = {} as Record<ThresholdKey, number | null>;
  for (const key of THRESHOLD_KEYS) out[key] = parseField(key, form[key]);
  return out;
}

export function validateForm(
  form: ThresholdsForm,
): { ok: true; data: ThresholdsUpdate } | { ok: false; errors: FieldErrors } {
  const parsed = ThresholdsUpdateSchema.safeParse(fromForm(form));
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && isThresholdKey(key)) errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/** True when any field's value differs from the saved thresholds. */
export function isDirty(form: ThresholdsForm, saved: Thresholds): boolean {
  const values = fromForm(form);
  return THRESHOLD_KEYS.some((key) => !Object.is(values[key], saved[key]));
}
