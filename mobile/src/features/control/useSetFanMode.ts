import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useToast } from '@/components/ui';
import { api, describeError, HttpError } from '@/services/api';
import { useLiveStore } from '@/store/liveStore';
import type { FanMode } from '@/types/api';

/** How long we wait for telemetry to confirm a fan command. */
export const FAN_CONFIRM_TIMEOUT_MS = 10_000;

export const FAN_MODE_LABEL: Record<FanMode, string> = {
  auto: 'Auto',
  on: 'Forced on',
  off: 'Forced off',
};

interface Pending {
  mode: FanMode;
  /** Distinguishes two sends of the same mode (restarts the timeout). */
  id: number;
}

export function sendErrorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.code === 'DEVICE_OFFLINE')
      return 'The greenhouse is offline. Try again when it is back.';
    if (err.status === 503) return 'The server is not connected to the MQTT broker.';
  }
  return describeError(err);
}

/**
 * Fan mode command with confirmation:
 * 1. pending is set before the request (UI shows "Waiting for device…"),
 * 2. POST /fan (202 = sent, not applied),
 * 3. confirmed only when the device's telemetry reports the new mode,
 * 4. no confirmation within 10 s → pending is dropped and an error is shown.
 * The UI always shows the confirmed mode from the live store, never the request.
 */
export function useSetFanMode(deviceId: string | undefined) {
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: FanMode }) => api.setFanMode(id, { mode }),
  });
  const { mutate } = mutation;

  useEffect(() => {
    if (!pending || !deviceId) return;

    const finish = (ok: boolean, message: string) => {
      setPending((p) => (p?.id === pending.id ? null : p));
      toast.show(message, ok ? 'success' : 'error');
    };

    const unsubscribe = useLiveStore.subscribe((s) => {
      const reading = s.readings[deviceId];
      if (reading?.fanMode === pending.mode) {
        finish(true, `Fan mode confirmed: ${FAN_MODE_LABEL[pending.mode]}`);
      } else if (s.devices[deviceId]?.online === false) {
        finish(false, 'The greenhouse went offline before confirming the fan mode.');
      }
    });

    const timer = setTimeout(() => {
      const current = useLiveStore.getState().readings[deviceId]?.fanMode;
      finish(
        false,
        `No confirmation from the greenhouse within ${FAN_CONFIRM_TIMEOUT_MS / 1000} s.` +
          (current ? ` The fan stays in ${FAN_MODE_LABEL[current]}.` : ''),
      );
    }, FAN_CONFIRM_TIMEOUT_MS);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [pending, deviceId, toast]);

  const send = (mode: FanMode) => {
    if (!deviceId || pending) return;
    const next: Pending = { mode, id: Date.now() };
    // Pending first: a confirmation could arrive before the HTTP response.
    setPending(next);
    mutate(
      { id: deviceId, mode },
      {
        onError: (err) => {
          setPending((p) => (p?.id === next.id ? null : p));
          toast.show(sendErrorMessage(err), 'error');
        },
      },
    );
  };

  return { send, pendingMode: pending?.mode ?? null };
}
