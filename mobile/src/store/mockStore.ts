import { create } from 'zustand';

import { mockAlerts } from '@/constants/mock';
import type { Alert } from '@/types/api';

/**
 * Design-phase only: lets every screen be previewed in each state
 * (Settings → Design preview). Removed once real data arrives.
 */
export type PreviewScenario = 'normal' | 'loading' | 'offline' | 'error';

interface MockState {
  scenario: PreviewScenario;
  setScenario: (s: PreviewScenario) => void;
  alerts: Alert[];
  markRead: (id: number) => void;
  markAllRead: () => void;
  resetAlerts: () => void;
}

export const useMockStore = create<MockState>((set) => ({
  scenario: 'normal',
  setScenario: (scenario) => set({ scenario }),
  alerts: mockAlerts,
  markRead: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === id && a.readAt === null ? { ...a, readAt: new Date().toISOString() } : a,
      ),
    })),
  markAllRead: () =>
    set((s) => {
      const now = new Date().toISOString();
      return { alerts: s.alerts.map((a) => (a.readAt === null ? { ...a, readAt: now } : a)) };
    }),
  resetAlerts: () => set({ alerts: mockAlerts }),
}));

/** Unread count, as a selector so subscribers re-render only when it changes. */
export const selectUnreadCount = (s: MockState) => s.alerts.filter((a) => a.readAt === null).length;
