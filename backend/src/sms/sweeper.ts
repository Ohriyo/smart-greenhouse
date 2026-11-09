import type { SmsNotifier } from './notifier.js';

const SWEEP_INTERVAL_MS = 30_000;
const FIRST_SWEEP_DELAY_MS = 20_000; // let startup (broker connect, retained replay) settle first

/**
 * Runs the SMS sweep (greenhouse offline for N minutes, back online, stale
 * situations) every 30 seconds. Returns a stop function.
 */
export function startSmsSweeper(sms: SmsNotifier): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  const first = setTimeout(() => {
    void sms.sweep();
    interval = setInterval(() => void sms.sweep(), SWEEP_INTERVAL_MS);
  }, FIRST_SWEEP_DELAY_MS);
  return () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
