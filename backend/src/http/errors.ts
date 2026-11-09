import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import { createLogger } from '../lib/logger.js';

const log = createLogger('http');

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'DEVICE_OFFLINE'
  | 'BROKER_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  path: string;
  message: string;
}

/** Every error response: { "error": { code, message, details? } } */
export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetail[] };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function zodDetails(err: z.ZodError): ErrorDetail[] {
  return err.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}

const BodyParserErrorSchema = z.object({ type: z.string(), status: z.number() });

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  let status = 500;
  let body: ErrorBody = { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } };

  if (err instanceof ApiError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message } };
    if (err.details) body.error.details = err.details;
  } else if (err instanceof z.ZodError) {
    status = 400;
    body = {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: zodDetails(err) },
    };
  } else {
    const bp = BodyParserErrorSchema.safeParse(err);
    if (bp.success && bp.data.type === 'entity.parse.failed') {
      status = 400;
      body = { error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } };
    } else if (bp.success && bp.data.status >= 400 && bp.data.status < 500) {
      status = bp.data.status;
      body = {
        error: {
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Bad request',
        },
      };
    } else {
      log.error('unhandled error', err);
    }
  }

  res.status(status).json(body);
};
