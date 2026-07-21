import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ACCESS_TOKEN_PURPOSE } from './auth.constants.js';
import { loadEnvironment } from '../config/environment.js';

type AccessTokenPayload = {
  sub: string;
  typ: typeof ACCESS_TOKEN_PURPOSE;
  iat: number;
  exp: number;
};

@Injectable()
export class TokenService {
  private readonly environment = loadEnvironment();

  createAccessToken(userId: string): { token: string; expiresAt: Date } {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = issuedAt + this.environment.ACCESS_TOKEN_TTL_SECONDS;
    const payload: AccessTokenPayload = {
      sub: userId,
      typ: ACCESS_TOKEN_PURPOSE,
      iat: issuedAt,
      exp: expiresAtSeconds,
    };

    return {
      token: this.signJwt(payload),
      expiresAt: new Date(expiresAtSeconds * 1000),
    };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const [encodedHeader, encodedPayload, signature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !signature) {
      throw new Error('Malformed access token');
    }

    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);
    if (!this.safeEqual(signature, expectedSignature)) {
      throw new Error('Invalid access token signature');
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<AccessTokenPayload>;

    if (payload.typ !== ACCESS_TOKEN_PURPOSE || typeof payload.sub !== 'string') {
      throw new Error('Invalid access token purpose');
    }

    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error('Expired access token');
    }

    if (typeof payload.iat !== 'number') {
      throw new Error('Invalid access token issue time');
    }

    return payload as AccessTokenPayload;
  }

  createRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  createSessionFamilyId(): string {
    return randomUUID();
  }

  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.environment.AUTH_REFRESH_TOKEN_PEPPER)
      .update(token)
      .digest('base64url');
  }

  getRefreshExpiresAt(): Date {
    return new Date(Date.now() + this.environment.REFRESH_TOKEN_TTL_SECONDS * 1000);
  }

  private signJwt(payload: AccessTokenPayload): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.environment.AUTH_ACCESS_TOKEN_SECRET)
      .update(value)
      .digest('base64url');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
