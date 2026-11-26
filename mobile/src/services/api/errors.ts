import type { z } from 'zod';

import { useNetworkStore } from '@/store/networkStore';

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'validation';

/** Message of the NetworkError thrown when the build has no server address. */
export const NO_SERVER_ADDRESS = 'This build has no server address (EXPO_PUBLIC_API_URL)';

/** Base class for every error thrown by the API client. */
export abstract class ApiError extends Error {
  abstract readonly kind: ApiErrorKind;
}

/** No connection: no internet, server down, wrong address, or no address in the build. */
export class NetworkError extends ApiError {
  readonly kind = 'network';
  constructor(message = "Can't reach the server") {
    super(message);
    this.name = 'NetworkError';
  }
}

/** The server didn't answer in time (e.g. still waking up). */
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
  NOT_FOUND: 'Not found on the server. It may have been removed.',
  VALIDATION_ERROR: 'Some values aren’t valid.',
  INVALID_JSON: 'The app sent a malformed request. Please update the app.',
  UNAUTHORIZED: 'The server refused the request: a key is missing or wrong.',
  NOT_CONFIGURED: 'This isn’t set up on the server yet.',
  SMS_NOT_CONFIGURED: 'No SMS numbers are set on the server (ALERT_PHONE_NUMBERS).',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
  NOT_SIMULATED: 'Scenarios only work with the simulator, never with the real greenhouse.',
};

/** Short, user-facing explanation of any error (no stack traces, no jargon). */
export function describeError(err: unknown): string {
  if (err instanceof NetworkError || err instanceof TimeoutError) {
    if (err.message === NO_SERVER_ADDRESS) {
      return 'This build has no server address. Set EXPO_PUBLIC_API_URL and build the app again.';
    }
    if (useNetworkStore.getState().connected === false) {
      return 'You’re offline. Connect to the internet and try again.';
    }
    if (err instanceof TimeoutError) {
      return 'The server didn’t answer in time. If it was asleep (the free server sleeps when idle), starting takes up to a minute: tap Retry.';
    }
    return 'Can’t reach the server. Check your internet connection, then tap Retry.';
  }
  if (err instanceof HttpError) {
    const known = HTTP_MESSAGES[err.code];
    if (known)
      return err.code === 'VALIDATION_ERROR' && err.details[0]
        ? `${known} ${err.details[0].message}.`
        : known;
    if (err.status >= 500) return 'The server had a problem. Try again in a moment.';
    return `The server refused the request (${err.status}): ${err.message}`;
  }
  if (err instanceof ValidationError)
    return 'The server answered with unexpected data. The app and the server may be different versions.';
  return 'Something went wrong. Please try again.';
}

/** Short title for an error screen. */
export function errorTitle(err: unknown): string {
  if (err instanceof NetworkError || err instanceof TimeoutError) {
    if (err.message === NO_SERVER_ADDRESS) return 'No server address';
    if (useNetworkStore.getState().connected === false) return 'You’re offline';
    return err instanceof TimeoutError ? 'The server is slow to answer' : 'Can’t reach the server';
  }
  if (err instanceof HttpError && err.status >= 500) return 'Server problem';
  return 'Something went wrong';
}
