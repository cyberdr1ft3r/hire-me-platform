import { BadRequestException } from '@nestjs/common';

export function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ error: { code, message } });
}
