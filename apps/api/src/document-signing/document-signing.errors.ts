import { HttpException, HttpStatus } from '@nestjs/common';

import { Prisma } from '../persistence/prisma/generated-client.js';

export function isSigningPublicationSerializationConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2034') {
      return true;
    }
    if (error.code === 'P2010') {
      const meta = error.meta as { code?: string; message?: string } | undefined;
      if (meta?.code === '40001') {
        return true;
      }
      const metaMessage = meta?.message?.toLowerCase() ?? '';
      if (metaMessage.includes('could not serialize access')) {
        return true;
      }
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('could not serialize access') || message.includes('serialization failure')
  );
}

export function signingNotFound(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.NOT_FOUND);
}

export function signingForbidden(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.FORBIDDEN);
}

export function signingConflict(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.CONFLICT);
}

export function signingBadRequest(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.BAD_REQUEST);
}
