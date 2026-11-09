import { create } from 'zustand';

/**
 * Client-side overrides of the Demo sheet. In memory only (never saved): they
 * reset on every app start, and in release builds nothing can switch them on.
 * They change what THIS app shows, never the greenhouse or the backend.
 */
interface DemoState {
  /** Show the greenhouse as offline. */
  deviceOffline: boolean;
  /** Show the server as unreachable. */
  serverUnreachable: boolean;
  /** Ignore live updates (freeze the screen). */
  pauseLive: boolean;
  /** Force the dark theme. */
  darkMode: boolean;
  set: (patch: Partial<Omit<DemoState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const OFF = { deviceOffline: false, serverUnreachable: false, pauseLive: false, darkMode: false };

export const useDemoStore = create<DemoState>()((set) => ({
  ...OFF,
  set: (patch) => set(patch),
  reset: () => set(OFF),
}));

/** True while any override is active (the Demo button shows a dot). */
export function selectDemoActive(s: DemoState): boolean {
  return s.deviceOffline || s.serverUnreachable || s.pauseLive || s.darkMode;
}
