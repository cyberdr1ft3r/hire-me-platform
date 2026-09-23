import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
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

/** Generic retryable failure: never reveal mission staffing or applicant state. */
export function temporarilyUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    body(
      'PUBLIC_APPLICATION_TEMPORARILY_UNAVAILABLE',
      'Application could not be submitted. Please try again later.',
    ),
  );
}

export function notFound(code = 'PUBLIC_OPPORTUNITY_NOT_AVAILABLE'): NotFoundException {
  return new NotFoundException(
    body(code, 'This opportunity is not available for public applications.'),
  );
}
