import { memo } from 'react';

import { FanHero, FanModeControl } from '@/components/greenhouse';
import { useIsLive } from '@/features/dashboard/useLiveness';
import { useLiveStore } from '@/store/liveStore';
import { formatRelative, useNow } from '@/utils/time';

import { useSetFanMode } from './useSetFanMode';

/**
 * The big spinning fan + "Fan is running" + Auto / On / Off. Shows the *confirmed*
 * state from telemetry; a tap waits for the greenhouse to confirm (10 s timeout).
 */
export const ControlFanHero = memo(function ControlFanHero({ deviceId }: { deviceId: string }) {
  const fanOn = useLiveStore((s) => s.readings[deviceId]?.fanOn ?? null);
  const mode = useLiveStore((s) => s.readings[deviceId]?.fanMode ?? null);
  const changedAt = useLiveStore((s) => s.fanChangedAt[deviceId] ?? null);
  const live = useIsLive(deviceId);
  const { send, pendingMode } = useSetFanMode(deviceId);
  const now = useNow(15_000);

  const title = fanOn === null ? 'Fan state unknown' : fanOn ? 'Fan is running' : 'Fan is off';
  const caption = pendingMode
    ? 'Waiting for device…'
    : !live
      ? 'Greenhouse offline: the fan keeps following its own rules'
      : changedAt
        ? `Last changed ${formatRelative(changedAt, now)}`
        : 'No changes recorded yet';

  return (
    <FanHero running={fanOn === true} title={title} caption={caption}>
      <FanModeControl mode={mode} pendingMode={pendingMode} live={live} onSelect={send} />
    </FanHero>
  );
});
