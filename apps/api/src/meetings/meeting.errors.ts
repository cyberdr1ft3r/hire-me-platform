import { HttpException, HttpStatus } from '@nestjs/common';

export function badRequest(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.BAD_REQUEST);
}

export function forbidden(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.FORBIDDEN);
}

export function notFound(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.NOT_FOUND);
}

export function conflict(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.CONFLICT);
}
