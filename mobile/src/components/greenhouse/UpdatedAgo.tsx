import { memo } from 'react';

import { Text } from '@/components/ui';
import { useLiveStore } from '@/store/liveStore';
import { formatRelative, formatRelativeSpoken, useNow } from '@/utils/time';

interface UpdatedAgoProps {
  deviceId: string;
  /** Text before the time, e.g. "Updated" or "Live · updated". */
  prefix?: string;
  color?: 'secondary' | 'tertiary';
}

/**
 * Self-updating "Updated 3 s ago" for a device's newest reading. It owns the
 * 1-second clock, so only this text re-renders each second, not the cards.
 */
export const UpdatedAgo = memo(function UpdatedAgo({
  deviceId,
  prefix = 'Updated',
  color = 'tertiary',
}: UpdatedAgoProps) {
  const ts = useLiveStore((s) => s.readings[deviceId]?.ts ?? null);
  const now = useNow(1000);
  return (
    <Text
      variant="caption"
      color={color}
      numberOfLines={1}
      accessibilityLabel={`${prefix} ${formatRelativeSpoken(ts, now)}`}
    >
      {prefix} {formatRelative(ts, now)}
    </Text>
  );
});
