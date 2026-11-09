import { memo, useMemo } from 'react';

import { useLiveStore } from '@/store/liveStore';
import type { Thresholds } from '@/types/api';

import { greenhouseSummary } from './greenhouseStatus';
import { StatusCard } from './StatusCard';
import { useLiveness } from './useLiveness';

/**
 * The status card bound to the live store. It subscribes to the newest reading
 * itself, so a telemetry message re-renders only this card, not the whole Home screen.
 */
export const LiveStatusCard = memo(function LiveStatusCard({
  deviceId,
  thresholds,
}: {
  deviceId: string;
  thresholds: Thresholds | undefined;
}) {
  const reading = useLiveStore((s) => s.readings[deviceId]);
  const lastSeen = useLiveStore((s) => s.devices[deviceId]?.lastSeen ?? null);
  const liveness = useLiveness(deviceId);

  const summary = useMemo(
    () => greenhouseSummary(reading, thresholds, liveness, lastSeen),
    [reading, thresholds, liveness, lastSeen],
  );

  return (
    <StatusCard
      summary={summary}
      fanOn={reading?.fanOn ?? null}
      fanMode={reading?.fanMode ?? null}
    />
  );
});
