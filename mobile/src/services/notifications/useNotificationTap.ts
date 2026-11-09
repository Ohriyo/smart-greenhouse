import type { QueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { PushDataSchema } from '@/types/api';

/**
 * Tapping an alert notification opens the Alerts tab, whether the app was in
 * the foreground, in the background or killed (then the tap is the "last
 * notification response" read at start). Call once in the root layout, so the
 * navigator is mounted before we navigate.
 */
export function useNotificationTap(queryClient: QueryClient): void {
  useEffect(() => {
    let lastHandled: string | null = null;

    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      // A cold start can deliver the same tap both ways: handle it once.
      if (id === lastHandled) return;
      lastHandled = id;
      Notifications.clearLastNotificationResponse(); // don't re-open on the next start

      // Only known in-app routes: never navigate to whatever a payload says.
      const data = PushDataSchema.safeParse(response.notification.request.content.data);
      if (!data.success) return;
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      router.navigate(data.data.url);
    };

    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [queryClient]);
}
