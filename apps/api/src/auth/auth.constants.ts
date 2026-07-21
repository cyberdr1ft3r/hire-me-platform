export const ACCESS_TOKEN_PURPOSE = 'access';
export const REFRESH_COOKIE_NAME = 'hire_me_refresh';
export const AUTH_ERROR = {
  code: 'AUTHENTICATION_FAILED',
  message: 'Authentication failed.',
} as const;

export const ARGON2ID_PARAMETERS = {
  algorithm: 'argon2id',
  parametersVersion: 'argon2id-v1',
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export const PASSWORD_POLICY_DESCRIPTION =
  'At least 12 characters, with at least one lowercase letter, one uppercase letter, one number, and one symbol.';
