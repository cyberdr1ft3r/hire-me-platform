import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiDefaultUrlencodedBodyLimit } from '@hire-me/contracts';
import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';

export const publicApplicationRequestTooLargeCode = 'PUBLIC_APPLICATION_REQUEST_TOO_LARGE';

const publicApplicationApplicationsPath = /^\/v1\/public\/opportunities\/[^/]+\/applications\/?$/;

export function isPublicApplicationSubmitPath(path: string): boolean {
  return publicApplicationApplicationsPath.test(path);
}

/** Path without query string, for transport scoping. */
export function requestPath(req: { path?: string; url?: string }): string {
  if (req.path) {
    return req.path;
  }
  const url = req.url ?? '';
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

export function isPublicApplicationSubmitRequest(req: {
  method?: string;
  path?: string;
  url?: string;
}): boolean {
  return req.method?.toUpperCase() === 'POST' && isPublicApplicationSubmitPath(requestPath(req));
}

type BodyParserPayloadTooLargeError = Error & { type: 'entity.too.large' };

function isBodyParserPayloadTooLarge(error: unknown): error is BodyParserPayloadTooLargeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  );
}

/**
 * Express body-parser emits `entity.too.large` before Nest route handlers run.
 * Typing is intentionally loose because Nest re-exports Express middleware signatures.
 */
export function publicApplicationPayloadTooLargeHandler(
  error: unknown,
  req: { method?: string; path?: string; url?: string },
  res: { headersSent?: boolean; status: (code: number) => { json: (body: unknown) => void } },
  next: (error?: unknown) => void,
): void {
  if (!isBodyParserPayloadTooLarge(error)) {
    next(error);
    return;
  }
  if (!isPublicApplicationSubmitRequest(req)) {
    next(error);
    return;
  }
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(413).json({
    error: {
      code: publicApplicationRequestTooLargeCode,
      message: 'Application payload exceeds the transport limit.',
    },
  });
}

export type ApiHttpBodyParserLimits = {
  /** JSON limit for authenticated/internal routes (default 6mb). */
  generalJsonLimit: string;
  /** JSON limit for public application submit only (default 8mb). */
  publicApplicationJsonLimit: string;
};

/**
 * Registers JSON body parsers in order:
 * 1. Public application submit POST (higher limit, path + method gated).
 * 2. General API JSON parser (lower limit; skips when body already parsed).
 * 3. URL-encoded parser (Nest prior default 100kb; not raised for public uploads).
 *
 * Nest's built-in body parser must be disabled (`bodyParser: false`) before calling this.
 */
export function registerApiHttpBodyParsers(
  app: NestExpressApplication,
  limits: ApiHttpBodyParserLimits,
): void {
  const expressApp: Express = app.getHttpAdapter().getInstance();
  const publicApplicationJson = express.json({ limit: limits.publicApplicationJsonLimit });
  const generalJson = express.json({ limit: limits.generalJsonLimit });
  const urlencoded = express.urlencoded({
    extended: true,
    limit: apiDefaultUrlencodedBodyLimit,
  });

  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    if (!isPublicApplicationSubmitRequest(req)) {
      next();
      return;
    }
    publicApplicationJson(req, res, next);
  });

  expressApp.use(generalJson);
  expressApp.use(urlencoded);
  expressApp.use(publicApplicationPayloadTooLargeHandler);
}
