import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

function body(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

export function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException(body(code, message));
}

export function conflict(code: string, message: string): ConflictException {
  return new ConflictException(body(code, message));
}

export function forbidden(code: string, message: string): ForbiddenException {
  return new ForbiddenException(body(code, message));
}

export function notFound(code = 'PUBLIC_OPPORTUNITY_NOT_AVAILABLE'): NotFoundException {
  return new NotFoundException(
    body(code, 'This opportunity is not available for public applications.'),
  );
}
