import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';

import type { MessagingErrorCode } from '@hire-me/contracts';

type ErrorBody = {
  error: {
    code: MessagingErrorCode;
    message: string;
  };
};

function body(code: MessagingErrorCode, message: string): ErrorBody {
  return { error: { code, message } };
}

export function messagingBadRequest(
  code: MessagingErrorCode,
  message: string,
): BadRequestException {
  return new BadRequestException(body(code, message));
}

export function invalidMessagingRequest(): BadRequestException {
  return messagingBadRequest('INVALID_MESSAGING_REQUEST', 'Invalid messaging request.');
}

/** Abuse mitigation only: never decides whether an actor may see or change a record. */
export function messagingRateLimited(): HttpException {
  return new HttpException(
    body('MESSAGING_RATE_LIMITED', 'Too many messaging requests. Try again shortly.'),
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

export function messagingConflict(code: MessagingErrorCode, message: string): ConflictException {
  return new ConflictException(body(code, message));
}

export function messagingForbidden(code: MessagingErrorCode, message: string): ForbiddenException {
  return new ForbiddenException(body(code, message));
}

export function messagingNotFound(code: MessagingErrorCode, message: string): NotFoundException {
  return new NotFoundException(body(code, message));
}

/**
 * The one response for a conversation the actor may not see: missing, foreign,
 * left, removed, and every other reason look identical (D-087).
 */
export function conversationNotFound(): NotFoundException {
  return messagingNotFound('CONVERSATION_NOT_FOUND', 'Conversation was not found.');
}

export function messageNotFound(): NotFoundException {
  return messagingNotFound('MESSAGE_NOT_FOUND', 'Message was not found.');
}
