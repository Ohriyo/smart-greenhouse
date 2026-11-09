import { memo } from 'react';

import { SegmentedControl, type SegmentOption } from '@/components/ui';
import type { FanMode } from '@/types/api';

const OPTIONS: readonly SegmentOption<FanMode>[] = [
  { value: 'auto', label: 'Auto', accessibilityLabel: 'Automatic' },
  { value: 'on', label: 'On', accessibilityLabel: 'Always on' },
  { value: 'off', label: 'Off', accessibilityLabel: 'Always off' },
];

interface FanModeControlProps {
  /** The *confirmed* mode from telemetry (never the requested one). */
  mode: FanMode | null;
  /** Requested but not yet confirmed: that segment shows as pending. */
  pendingMode: FanMode | null;
  /** Greenhouse reachable. When false the control is disabled and says why to TalkBack. */
  live: boolean;
  onSelect: (mode: FanMode) => void;
}

/** Auto / On / Off with the confirm-before-commit look (Home fan card, Control fan hero). */
export const FanModeControl = memo(function FanModeControl({
  mode,
  pendingMode,
  live,
  onSelect,
}: FanModeControlProps) {
  return (
    <SegmentedControl
      options={OPTIONS}
      value={mode ?? 'auto'}
      pendingValue={pendingMode}
      onChange={(m) => {
        if (m !== mode) onSelect(m);
      }}
      disabled={!live || pendingMode !== null}
      accessibilityLabel={
        live ? 'Fan mode' : 'Fan mode, unavailable while the greenhouse is offline'
      }
    />
  );
});
