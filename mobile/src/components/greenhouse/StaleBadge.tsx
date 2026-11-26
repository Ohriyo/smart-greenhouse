import { memo } from 'react';

import { StatusPill } from '@/components/ui';
import { STALE_READING_MS } from '@/constants/config';
import { useLiveStore } from '@/store/liveStore';
import { formatRelativeSpoken, useNow } from '@/utils/time';

/**
 * "Stale data" when the device's newest reading is more than 2 minutes old (the
 * ESP32 reports every 30 s). Owns a 5-second clock, so only this pill re-renders.
 */
export const StaleBadge = memo(function StaleBadge({ deviceId }: { deviceId: string }) {
  const ts = useLiveStore((s) => s.readings[deviceId]?.ts ?? null);
  const now = useNow(5000);
  if (ts === null || now - Date.parse(ts) <= STALE_READING_MS) return null;
  return (
    <StatusPill
      tone="warning"
      label="Stale data"
      icon="time-outline"
      accessibilityLabel={`Stale data: the newest reading is from ${formatRelativeSpoken(ts, now)}`}
    />
  );
});
