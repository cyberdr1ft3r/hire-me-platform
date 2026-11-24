import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadEnvironment } from '../config/environment.js';

@Injectable()
export class CandidateMail {
  async send(email: string, purpose: 'VERIFY' | 'RESET', link: string): Promise<void> {
    const config = loadEnvironment();
    const subject =
      purpose === 'VERIFY'
        ? 'Verify your HireMe candidate email'
        : 'Reset your HireMe candidate password';
    if (config.CANDIDATE_MAIL_OUTBOX) {
      // This adapter is only reachable in the explicitly enabled dev/test portal.
      await mkdir(config.CANDIDATE_MAIL_OUTBOX, { recursive: true, mode: 0o700 });
      await writeFile(
        join(config.CANDIDATE_MAIL_OUTBOX, randomUUID() + '.json'),
        JSON.stringify({ email, purpose, link }),
        { flag: 'wx', mode: 0o600 },
      );
      return;
    }
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + config.CANDIDATE_RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.CANDIDATE_MAIL_FROM,
          to: [email],
          subject,
          text: link,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error();
    } catch {
      throw new ServiceUnavailableException('Candidate email delivery is temporarily unavailable.');
    }
  }
}
