import { HttpException, HttpStatus } from '@nestjs/common';

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
