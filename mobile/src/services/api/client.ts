import type { z } from 'zod';

import { API_URL } from '@/constants/config';
import { ApiErrorBodySchema } from '@/types/api';

import {
  HttpError,
  NetworkError,
  NO_SERVER_ADDRESS,
  TimeoutError,
  ValidationError,
} from './errors';

/** A sleeping free-tier server can take longer: the screens then offer "Retry". */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Another server than the build's EXPO_PUBLIC_API_URL (unregistering an old push token). */
  baseUrl?: string;
  timeoutMs?: number;
  /** Caller's abort signal (e.g. from TanStack Query). */
  signal?: AbortSignal;
}

/**
 * Fetch wrapper: base URL from the build (EXPO_PUBLIC_API_URL), timeout via
 * AbortController, JSON body, Zod-validated response, and typed errors
 * (Network, Timeout, Http, Validation). A caller abort (signal) is re-thrown
 * as-is so TanStack Query can ignore it.
 */
export async function apiRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.infer<S>> {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const baseUrl = options.baseUrl ?? API_URL;
  if (!baseUrl) throw new NetworkError(NO_SERVER_ADDRESS);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) throw new TimeoutError(timeoutMs);
    if (signal?.aborted) throw err; // cancelled by the caller
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  let json: unknown;
  try {
    // 204 No Content has no body: validate `undefined` (schema z.undefined()).
    json = res.status === 204 ? undefined : await res.json();
  } catch {
    if (!res.ok) throw new HttpError(res.status, 'UNKNOWN', res.statusText || 'Request failed');
    throw new ValidationError(path);
  }

  if (!res.ok) {
    const parsedError = ApiErrorBodySchema.safeParse(json);
    if (parsedError.success) {
      const { code, message, details } = parsedError.data.error;
      throw new HttpError(res.status, code, message, details);
    }
    throw new HttpError(res.status, 'UNKNOWN', res.statusText || 'Request failed');
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ValidationError(path, parsed.error.issues);
  return parsed.data;
}
