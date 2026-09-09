import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

type ErrorBody = { error: { code: string; message: string } };

function body(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

export function generationBadRequest(code: string, message: string): BadRequestException {
  return new BadRequestException(body(code, message));
}

export function generationConflict(code: string, message: string): ConflictException {
  return new ConflictException(body(code, message));
}

export function generationForbidden(code: string, message: string): ForbiddenException {
  return new ForbiddenException(body(code, message));
}

/**
 * Every hidden, out-of-scope, and nonexistent generation source collapses into this one
 * envelope, so a caller can never probe for a commercial record or training enrollment
 * it is not allowed to see.
 */
export function generationSourceNotFound(): NotFoundException {
  return new NotFoundException(
    body('GENERATION_SOURCE_NOT_FOUND', 'Generation source record was not found.'),
  );
}
