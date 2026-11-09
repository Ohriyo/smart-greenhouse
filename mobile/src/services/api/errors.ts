import type { z } from 'zod';

import { useNetworkStore } from '@/store/networkStore';

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'validation';

/** Base class for every error thrown by the API client. */
export abstract class ApiError extends Error {
  abstract readonly kind: ApiErrorKind;
}

/** No connection: wrong IP, laptop off, other Wi-Fi, firewall, or no URL set. */
export class NetworkError extends ApiError {
  readonly kind = 'network';
  constructor(message = "Can't reach the server") {
    super(message);
    this.name = 'NetworkError';
  }
}

/** The server didn't answer in time. */
export class TimeoutError extends ApiError {
  readonly kind = 'timeout';
  constructor(readonly timeoutMs: number) {
    super(`The server didn't answer within ${Math.round(timeoutMs / 1000)} s`);
    this.name = 'TimeoutError';
  }
}

/** Non-2xx response; `code` comes from the backend error body (contract §1 Error). */
export class HttpError extends ApiError {
  readonly kind = 'http';
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** The response wasn't valid JSON or didn't match the contract schema. */
export class ValidationError extends ApiError {
  readonly kind = 'validation';
  constructor(
    readonly path: string,
    readonly issues: z.core.$ZodIssue[] = [],
  ) {
    super(`Unexpected response from ${path}`);
    this.name = 'ValidationError';
  }
}

/** Messages for the backend's error codes (contract §1 Error). */
const HTTP_MESSAGES: Record<string, string> = {
  DEVICE_OFFLINE: 'The greenhouse is offline, so it can’t receive commands right now.',
  BROKER_UNAVAILABLE:
    'The backend can’t reach the MQTT broker (Mosquitto). Check that it’s running on the laptop.',
  NOT_FOUND: 'Not found on the server. It may have been removed.',
  VALIDATION_ERROR: 'Some values aren’t valid.',
  INVALID_JSON: 'The app sent a malformed request. Please update the app.',
};

/** Short, user-facing explanation of any error (no stack traces, no jargon). */
export function describeError(err: unknown): string {
  if (err instanceof NetworkError || err instanceof TimeoutError) {
    const network = useNetworkStore.getState();
    if (network.connected === false)
      return 'Your phone is offline. Connect to Wi-Fi and try again.';
    if (network.type === 'cellular')
      return 'You’re on mobile data. The backend is only reachable on your home Wi-Fi.';
    if (err instanceof TimeoutError)
      return 'The laptop didn’t answer in time. It may be asleep, or the firewall is blocking port 4000.';
    if (err.message.startsWith('No server address')) return `${err.message}.`;
    return 'Can’t reach the backend. Check that it’s running and the phone is on the same Wi-Fi as the laptop.';
  }
  if (err instanceof HttpError) {
    const known = HTTP_MESSAGES[err.code];
    if (known)
      return err.code === 'VALIDATION_ERROR' && err.details[0]
        ? `${known} ${err.details[0].message}.`
        : known;
    if (err.status >= 500)
      return 'The backend had a problem. Check its terminal for details, then try again.';
    return `The server refused the request (${err.status}): ${err.message}`;
  }
  if (err instanceof ValidationError)
    return 'The backend answered with unexpected data. Are the app and backend on the same version?';
  return 'Something went wrong. Please try again.';
}

/** Short title for an error screen. */
export function errorTitle(err: unknown): string {
  if (err instanceof NetworkError || err instanceof TimeoutError) {
    return useNetworkStore.getState().connected === false
      ? 'You’re offline'
      : 'Can’t reach the backend';
  }
  if (err instanceof HttpError && err.status >= 500) return 'Server problem';
  return 'Something went wrong';
}
