import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useServer } from '@/features/dashboard/queries';
import { api } from '@/services/api';
import { useLiveStore } from '@/store/liveStore';

/** PATCH the greenhouse name; the live store updates at once, the list is refetched. */
export function useRenameDevice(deviceId: string | undefined) {
  const queryClient = useQueryClient();
  const { apiUrl } = useServer();
  return useMutation({
    mutationFn: (name: string) => api.renameDevice(deviceId ?? '', name),
    onSuccess: (device) => {
      useLiveStore.getState().upsertDevice(device);
      void queryClient.invalidateQueries({ queryKey: ['devices', apiUrl] });
    },
  });
}
