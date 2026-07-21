import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

import { ARGON2ID_PARAMETERS } from './auth.constants.js';

@Injectable()
export class PasswordService {
  private readonly dummyHash = this.hashPassword('synthetic-never-valid-password-1!');

  async hashPassword(password: string): Promise<string> {
    const hash = (await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: ARGON2ID_PARAMETERS.memoryCost,
      timeCost: ARGON2ID_PARAMETERS.timeCost,
      parallelism: ARGON2ID_PARAMETERS.parallelism,
      hashLength: ARGON2ID_PARAMETERS.hashLength,
    })) as string;

    return hash;
  }

  async verifyPassword(
    passwordHash: string | null | undefined,
    password: string,
  ): Promise<boolean> {
    const hashToVerify = passwordHash ?? (await this.dummyHash);
    return argon2.verify(hashToVerify, password);
  }

  validatePasswordPolicy(password: string): boolean {
    return (
      password.length >= 12 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password)
    );
  }
}
