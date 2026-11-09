import type { z } from 'zod';

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

/** Short, user-facing explanation of any error. */
export function describeError(err: unknown): string {
  if (err instanceof NetworkError)
    return `${err.message}. Check the address and that the laptop is on the same Wi-Fi.`;
  if (err instanceof TimeoutError)
    return `${err.message}. The laptop may be asleep or blocked by the firewall.`;
  if (err instanceof HttpError) return `Server error ${err.status}: ${err.message}`;
  if (err instanceof ValidationError)
    return `${err.message}. The app and backend versions may not match.`;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
