import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServer } from '@/features/dashboard/queries';
import { api } from '@/services/api';
import type { NotificationSettings, NotificationSettingsUpdate } from '@/types/api';

const settingsKey = (url: string | null) => ['notificationSettings', url] as const;

/** Push preferences, stored on the backend (they apply to every registered phone). */
export function useNotificationSettings() {
  const { apiUrl, ready } = useServer();
  return useQuery({
    queryKey: settingsKey(apiUrl),
    enabled: ready,
    queryFn: ({ signal }) => api.notificationSettings(signal),
  });
}

/** Optimistic: the switch moves at once and snaps back if saving fails. */
export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  const { apiUrl } = useServer();
  const key = settingsKey(apiUrl);
  return useMutation({
    mutationFn: (body: NotificationSettingsUpdate) => api.updateNotificationSettings(body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NotificationSettings>(key);
      if (previous) qc.setQueryData<NotificationSettings>(key, { ...previous, ...body });
      return { previous };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (saved) => qc.setQueryData(key, saved),
  });
}

export function useSendTestPush() {
  return useMutation({ mutationFn: () => api.sendTestPush() });
}
