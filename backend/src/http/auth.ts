import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ApiError } from './errors.js';

/**
 * Constant-time comparison of a presented key with the expected one. Both are
 * hashed first, so different lengths don't leak through timing either.
 */
export function keysMatch(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Requires header `header` to equal `expected` (401 otherwise). When the server
 * has no key configured the route is unusable: 503 NOT_CONFIGURED names the
 * missing environment variable (never its value).
 */
export function requireKey(
  header: 'X-Device-Key' | 'X-Admin-Key',
  expected: string | undefined,
  envName: string,
): RequestHandler {
  return (req, _res, next) => {
    if (expected === undefined) {
      next(new ApiError(503, 'NOT_CONFIGURED', `${envName} is not set on the server`));
      return;
    }
    if (!keysMatch(req.get(header), expected)) {
      next(new ApiError(401, 'UNAUTHORIZED', `Missing or wrong ${header} header`));
      return;
    }
    next();
  };
}
