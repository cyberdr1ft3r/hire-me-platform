import type { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MESSAGING_RATE_LIMITS,
  MessagingRateLimiter,
  type MessagingRateLimits,
} from './messaging-rate-limiter.js';

function limiterAt(limits: MessagingRateLimits = DEFAULT_MESSAGING_RATE_LIMITS) {
  const clock = { current: Date.parse('2026-10-12T10:00:00.000Z') };
  const limiter = new MessagingRateLimiter(limits, { now: () => new Date(clock.current) });
  return { limiter, clock };
}

function rejection(run: () => void): { status: number; code?: string } | null {
  try {
    run();
    return null;
  } catch (error) {
    const exception = error as HttpException;
    const body = exception.getResponse() as { error?: { code?: string } };
    return { status: exception.getStatus(), code: body.error?.code };
  }
}

describe('MessagingRateLimiter (Issue #179)', () => {
  it('pins the D-087 abuse-control targets', () => {
    expect(DEFAULT_MESSAGING_RATE_LIMITS).toEqual({
      'user-search': { limit: 60, windowMs: 60_000 },
      'conversation-create': { limit: 10, windowMs: 3_600_000 },
      'message-write': { limit: 30, windowMs: 60_000 },
    });
  });

  it('refuses the request after the limit with a stable 429 code', () => {
    const { limiter } = limiterAt();
    for (let index = 0; index < 30; index += 1) {
      limiter.consume('message-write', 'actor-a');
    }
    expect(rejection(() => limiter.consume('message-write', 'actor-a'))).toEqual({
      status: 429,
      code: 'MESSAGING_RATE_LIMITED',
    });
  });

  it('keeps separate windows per actor and per action', () => {
    const { limiter } = limiterAt();
    for (let index = 0; index < 10; index += 1) {
      limiter.consume('conversation-create', 'actor-a');
    }
    expect(rejection(() => limiter.consume('conversation-create', 'actor-a'))).not.toBeNull();
    expect(rejection(() => limiter.consume('conversation-create', 'actor-b'))).toBeNull();
    expect(rejection(() => limiter.consume('message-write', 'actor-a'))).toBeNull();
  });

  it('opens a new window once the old one expires', () => {
    const { limiter, clock } = limiterAt();
    for (let index = 0; index < 60; index += 1) {
      limiter.consume('user-search', 'actor-a');
    }
    expect(rejection(() => limiter.consume('user-search', 'actor-a'))).not.toBeNull();
    clock.current += 60_000;
    expect(rejection(() => limiter.consume('user-search', 'actor-a'))).toBeNull();
  });
});
