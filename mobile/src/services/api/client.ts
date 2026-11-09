import type { z } from 'zod';

import { useSettingsStore } from '@/store/settingsStore';
import { ApiErrorBodySchema } from '@/types/api';

import { HttpError, NetworkError, TimeoutError, ValidationError } from './errors';

export const DEFAULT_TIMEOUT_MS = 8000;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  /** Overrides the saved server URL (used by "Test connection"). */
  baseUrl?: string;
  timeoutMs?: number;
  /** Caller's abort signal (e.g. from TanStack Query). */
  signal?: AbortSignal;
}

/**
 * Fetch wrapper: base URL from settings, timeout via AbortController, JSON body,
 * Zod-validated response, and typed errors (Network, Timeout, Http, Validation).
 * A caller abort (signal) is re-thrown as-is so TanStack Query can ignore it.
 */
export async function apiRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.infer<S>> {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const baseUrl = options.baseUrl ?? useSettingsStore.getState().apiUrl;
  if (!baseUrl) throw new NetworkError('No server address set (Settings)');

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
    json = await res.json();
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
