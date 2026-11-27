import { useQuery } from '@tanstack/react-query';

import { useServer } from '@/features/dashboard/queries';
import { api } from '@/services/api';

const smsKey = (url: string | null) => ['smsStatus', url] as const;

/**
 * SMS setup and the newest attempts (GET /api/sms/status). Read-only: the
 * numbers, dry-run mode and limits are set in the server environment.
 */
export function useSmsStatus() {
  const { apiUrl, ready } = useServer();
  return useQuery({
    queryKey: smsKey(apiUrl),
    enabled: ready,
    queryFn: ({ signal }) => api.smsStatus(signal),
    staleTime: 30_000,
  });
}
