import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class RateLimitService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  assertAllowed(key: string, limit = 50, windowMs = 60_000): void {
    const now = Date.now();
    const current = this.attempts.get(key);

    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    if (current.count >= limit) {
      throw new HttpException(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many authentication attempts.',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
  }

  reset(): void {
    this.attempts.clear();
  }
}
