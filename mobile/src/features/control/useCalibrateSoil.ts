import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useToast } from '@/components/ui';
import { api } from '@/services/api';
import { useLiveStore } from '@/store/liveStore';
import type { SoilPoint } from '@/types/api';

import { sendErrorMessage } from './useSetFanMode';

/** How long we wait for the greenhouse to report its new calibration. */
export const CALIBRATION_CONFIRM_TIMEOUT_MS = 10_000;

const NAME: Record<SoilPoint, string> = { dry: 'Dry', wet: 'Wet' };

interface Pending {
  point: SoilPoint;
  /** Value the device reported when we sent the command (null = never reported). */
  before: number | null;
  id: number;
}

/**
 * "Capture dry/wet value": the greenhouse stores its *current* soil reading.
 * Confirmed only when the device reports a different soilDryMv/soilWetMv
 * (device:status). No change within 10 s → told to the user, nothing is assumed.
 */
export function useCalibrateSoil(deviceId: string | undefined) {
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, point }: { id: string; point: SoilPoint }) => api.calibrateSoil(id, point),
  });
  const { mutate } = mutation;

  useEffect(() => {
    if (!pending || !deviceId) return;
    let done = false;

    const finish = (ok: boolean, message: string) => {
      if (done) return;
      done = true;
      setPending((p) => (p?.id === pending.id ? null : p));
      toast.show(message, ok ? 'success' : 'error');
    };
    const reported = (point: SoilPoint) => {
      const d = useLiveStore.getState().devices[deviceId];
      return (point === 'dry' ? d?.soilDryMv : d?.soilWetMv) ?? null;
    };

    const unsubscribe = useLiveStore.subscribe((s) => {
      const d = s.devices[deviceId];
      const now = (pending.point === 'dry' ? d?.soilDryMv : d?.soilWetMv) ?? null;
      if (now !== null && now !== pending.before) {
        finish(true, `${NAME[pending.point]} value saved: ${now} mV`);
      } else if (d?.online === false) {
        finish(false, 'The greenhouse went offline before confirming the calibration.');
      }
    });

    const timer = setTimeout(() => {
      const current = reported(pending.point);
      finish(
        false,
        `No change from the greenhouse within ${CALIBRATION_CONFIRM_TIMEOUT_MS / 1000} s.` +
          (current === null
            ? ''
            : ` The ${pending.point} value stays ${current} mV (expected if the sensor already read that, or if its reading is invalid).`),
      );
    }, CALIBRATION_CONFIRM_TIMEOUT_MS);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [pending, deviceId, toast]);

  const capture = (point: SoilPoint) => {
    if (!deviceId || pending) return;
    const d = useLiveStore.getState().devices[deviceId];
    const next: Pending = {
      point,
      before: (point === 'dry' ? d?.soilDryMv : d?.soilWetMv) ?? null,
      id: Date.now(),
    };
    // Pending first: the confirmation could arrive before the HTTP response.
    setPending(next);
    mutate(
      { id: deviceId, point },
      {
        onError: (err) => {
          setPending((p) => (p?.id === next.id ? null : p));
          toast.show(sendErrorMessage(err), 'error');
        },
      },
    );
  };

  return { capture, pendingPoint: pending?.point ?? null };
}
