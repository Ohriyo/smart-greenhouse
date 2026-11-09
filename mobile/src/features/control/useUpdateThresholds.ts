import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys, useServer } from '@/features/dashboard/queries';
import { api } from '@/services/api';
import type { ThresholdsUpdate } from '@/types/api';

/**
 * PUT thresholds. On success the cached thresholds are replaced with the saved
 * ones right away (dashboard limits update), then refetched to be sure.
 */
export function useUpdateThresholds(deviceId: string | undefined) {
  const queryClient = useQueryClient();
  const { apiUrl } = useServer();

  return useMutation({
    mutationFn: (body: ThresholdsUpdate) => api.updateThresholds(deviceId ?? '', body),
    onSuccess: (res) => {
      const key = queryKeys.thresholds(apiUrl, res.thresholds.deviceId);
      queryClient.setQueryData(key, res.thresholds);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
