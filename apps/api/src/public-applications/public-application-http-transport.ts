import type { NestExpressApplication } from '@nestjs/platform-express';

export const publicApplicationRequestTooLargeCode = 'PUBLIC_APPLICATION_REQUEST_TOO_LARGE';

const publicApplicationApplicationsPath = /^\/v1\/public\/opportunities\/[^/]+\/applications\/?$/;

export function isPublicApplicationSubmitPath(path: string): boolean {
  return publicApplicationApplicationsPath.test(path);
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
  req: { path?: string; url?: string },
  res: { headersSent?: boolean; status: (code: number) => { json: (body: unknown) => void } },
  next: (error?: unknown) => void,
): void {
  if (!isBodyParserPayloadTooLarge(error)) {
    next(error);
    return;
  }
  const path = req.path ?? req.url ?? '';
  if (!isPublicApplicationSubmitPath(path)) {
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

export function registerPublicApplicationHttpTransport(
  app: NestExpressApplication,
  jsonBodyLimit: string,
): void {
  app.useBodyParser('json', { limit: jsonBodyLimit });
  app.use(publicApplicationPayloadTooLargeHandler);
}
