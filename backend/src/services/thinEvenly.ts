/**
 * Keeps at most `max` items, evenly spaced, always including the first and the
 * last one (the newest reading must never be dropped). Pure: unit-tested.
 */
export function thinEvenly<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  if (max <= 1) return items.length ? [items[items.length - 1] as T] : [];
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)] as T);
  return out;
}
