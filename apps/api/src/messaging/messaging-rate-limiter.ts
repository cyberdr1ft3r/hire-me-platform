import { Inject, Injectable } from '@nestjs/common';

import { MESSAGING_CLOCK, type MessagingClock } from './messaging-clock.js';
import { messagingRateLimited } from './messaging.errors.js';

export type MessagingRateLimitAction = 'user-search' | 'conversation-create' | 'message-write';

export type MessagingRateLimits = Record<
  MessagingRateLimitAction,
  { limit: number; windowMs: number }
>;

/** D-087 abuse-control targets (preflight §5 and §10). */
export const DEFAULT_MESSAGING_RATE_LIMITS: MessagingRateLimits = {
  'user-search': { limit: 60, windowMs: 60_000 },
  'conversation-create': { limit: 10, windowMs: 60 * 60_000 },
  'message-write': { limit: 30, windowMs: 60_000 },
};

export const MESSAGING_RATE_LIMITS = Symbol('MESSAGING_RATE_LIMITS');

const PRUNE_THRESHOLD = 10_000;

/**
 * Per-actor fixed-window limiter, the same in-process pattern as the auth
 * `RateLimitService`. It is abuse mitigation for one API process only: counters
 * are not shared between instances and reset on restart. It runs after the
 * permission guard and the internal-actor check and never takes part in an
 * authorization or confidentiality decision.
 */
@Injectable()
export class MessagingRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @Inject(MESSAGING_RATE_LIMITS) private readonly limits: MessagingRateLimits,
    @Inject(MESSAGING_CLOCK) private readonly clock: MessagingClock,
  ) {}

  consume(action: MessagingRateLimitAction, actorUserId: string): void {
    const { limit, windowMs } = this.limits[action];
    const now = this.clock.now().getTime();
    const key = `${action}:${actorUserId}`;
    const current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      if (this.windows.size >= PRUNE_THRESHOLD) {
        this.prune(now);
      }
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= limit) {
      throw messagingRateLimited();
    }
    current.count += 1;
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
