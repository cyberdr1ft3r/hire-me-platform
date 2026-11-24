import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';

const claims = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().email().max(254),
  email_verified: z.literal(true),
  nonce: z.string(),
  exp: z.number().int(),
  hd: z.string().min(1).optional(),
});

@Injectable()
export class CandidateGoogle {
  private readonly verifier = new OAuth2Client();

  async verify(credential: string, audience: string, nonce: string) {
    try {
      const ticket = await this.verifier.verifyIdToken({ idToken: credential, audience });
      const identity = claims.parse(ticket.getPayload());
      if (identity.nonce !== nonce || identity.exp <= Date.now() / 1000) throw new Error();
      return identity;
    } catch {
      throw new UnauthorizedException('Google sign-in could not be verified.');
    }
  }
}
