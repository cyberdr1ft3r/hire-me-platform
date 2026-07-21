import { describe, expect, it } from 'vitest';

import { ARGON2ID_PARAMETERS } from './auth.constants.js';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes passwords with Argon2id parameters and verifies without exposing plaintext', async () => {
    const hash = await service.hashPassword('Synthetic-password-123!');

    expect(hash).toContain('$argon2id$');
    expect(hash).toContain(`m=${ARGON2ID_PARAMETERS.memoryCost}`);
    expect(hash).toContain(`t=${ARGON2ID_PARAMETERS.timeCost}`);
    expect(hash).toContain(`p=${ARGON2ID_PARAMETERS.parallelism}`);
    expect(hash).not.toContain('Synthetic-password-123!');
    await expect(service.verifyPassword(hash, 'Synthetic-password-123!')).resolves.toBe(true);
    await expect(service.verifyPassword(hash, 'Wrong-password-123!')).resolves.toBe(false);
  });

  it('enforces the bootstrap password policy', () => {
    expect(service.validatePasswordPolicy('short')).toBe(false);
    expect(service.validatePasswordPolicy('synthetic-password-123')).toBe(false);
    expect(service.validatePasswordPolicy('Synthetic-password-123!')).toBe(true);
  });
});
