import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import { useServer } from '@/features/dashboard/queries';
import { api } from '@/services/api';
import type { AlertPage, AlertsFilter } from '@/types/api';

export type AlertFilter = 'all' | 'critical' | 'warning' | 'info';

const FILTERS: Record<AlertFilter, AlertsFilter> = {
  all: {},
  critical: { severity: ['critical'] },
  warning: { severity: ['warning'] },
  info: { severity: ['info'] },
};

const PAGE_SIZE = 30;

/** Every alerts query starts with ['alerts', url] so one invalidation refreshes all. */
export const alertKeys = {
  all: (url: string | null) => ['alerts', url] as const,
  lists: (url: string | null) => ['alerts', url, 'list'] as const,
  list: (url: string | null, filter: AlertFilter) => ['alerts', url, 'list', filter] as const,
  unread: (url: string | null) => ['alerts', url, 'unread'] as const,
};

/** Newest first, 30 per page; `fetchNextPage` loads older alerts. */
export function useAlertsQuery(filter: AlertFilter) {
  const { apiUrl, ready } = useServer();
  return useInfiniteQuery({
    queryKey: alertKeys.list(apiUrl, filter),
    enabled: ready,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.alerts(FILTERS[filter], pageParam, { limit: PAGE_SIZE, signal }),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Unread count for the tab badge (cheap: a 1-item page carries the total). */
export function useUnreadCount() {
  const { apiUrl, ready } = useServer();
  return useQuery({
    queryKey: alertKeys.unread(apiUrl),
    enabled: ready,
    queryFn: async ({ signal }) =>
      (await api.alerts({ unread: true }, null, { limit: 1, signal })).unreadCount,
  });
}

/** Applies `readAt` to matching alerts in every cached list. Returns how many changed. */
function markReadInCache(
  qc: QueryClient,
  url: string | null,
  readAt: string,
  match: (id: number) => boolean,
): number {
  const changed = new Set<number>();
  qc.setQueriesData<InfiniteData<AlertPage>>({ queryKey: alertKeys.lists(url) }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((a) => {
              if (a.readAt !== null || !match(a.id)) return a;
              changed.add(a.id);
              return { ...a, readAt };
            }),
          })),
        }
      : data,
  );
  return changed.size;
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  const { apiUrl } = useServer();
  return useMutation({
    mutationFn: (id: number) => api.markAlertRead(id),
    // Optimistic: the row and the badge update before the server answers.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: alertKeys.all(apiUrl) });
      const n = markReadInCache(qc, apiUrl, new Date().toISOString(), (a) => a === id);
      if (n > 0) {
        qc.setQueryData<number>(alertKeys.unread(apiUrl), (c) =>
          c === undefined ? c : Math.max(0, c - 1),
        );
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: alertKeys.all(apiUrl) }),
  });
}

export function useMarkAllAlertsRead() {
  const qc = useQueryClient();
  const { apiUrl } = useServer();
  return useMutation({
    mutationFn: () => api.markAllAlertsRead(),
    onSuccess: (res) => {
      markReadInCache(qc, apiUrl, res.readAt, () => true);
      qc.setQueryData<number>(alertKeys.unread(apiUrl), 0);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: alertKeys.all(apiUrl) }),
  });
}
