import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useServer } from '@/features/dashboard/queries';
import { api } from '@/services/api';

const smsKey = (url: string | null) => ['smsSettings', url] as const;

/** The owner's SMS preferences and the SMS service state (stored on the backend). */
export function useSmsSettings() {
  const { apiUrl, ready } = useServer();
  return useQuery({
    queryKey: smsKey(apiUrl),
    enabled: ready,
    queryFn: ({ signal }) => api.smsSettings(signal),
  });
}

/** Saves the preferences; the screen's data is replaced by what the server returns. */
export function useUpdateSmsSettings() {
  const queryClient = useQueryClient();
  const { apiUrl } = useServer();
  return useMutation({
    mutationFn: api.updateSmsSettings,
    onSuccess: (saved) => queryClient.setQueryData(smsKey(apiUrl), saved),
  });
}

/** Sends one test SMS, then refreshes "last SMS" and the daily count. */
export function useSendTestSms() {
  const queryClient = useQueryClient();
  const { apiUrl } = useServer();
  return useMutation({
    mutationFn: () => api.sendTestSms(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: smsKey(apiUrl) }),
  });
}
