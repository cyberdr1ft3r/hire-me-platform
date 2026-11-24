import { apiDefaultJsonBodyLimit, publicApplicationDefaultJsonBodyLimit } from '@hire-me/contracts';
import { z } from 'zod';

const EnvironmentSchema = z.object({
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  API_CORS_ORIGIN: z.string().url(),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  AUTH_ACCESS_TOKEN_SECRET: z.string().min(32),
  AUTH_COOKIE_SECURE: z.coerce.boolean().optional(),
  AUTH_REFRESH_TOKEN_PEPPER: z.string().min(32),
  CANDIDATE_PORTAL_ENABLED: z.enum(['true', 'false']).default('false'),
  CANDIDATE_GOOGLE_CLIENT_ID: z.string().endsWith('.apps.googleusercontent.com').optional(),
  CANDIDATE_MAIL_OUTBOX: z.string().min(1).optional(),
  CANDIDATE_RESEND_API_KEY: z.string().min(1).optional(),
  CANDIDATE_MAIL_FROM: z.string().min(1).optional(),
  DATABASE_URL: z.string().url(),
  INVOICE_ISSUANCE_ENABLED: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PRIVATE_UPLOAD_STORAGE_ROOT: z.string().min(1).default('.tmp-runtime/private-uploads'),
  JSON_BODY_LIMIT: z.string().min(1).default(apiDefaultJsonBodyLimit),
  PUBLIC_APPLICATION_JSON_LIMIT: z.string().min(1).default(publicApplicationDefaultJsonBodyLimit),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(2592000).default(604800),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = EnvironmentSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const environment = parsed.data;

  if (environment.CANDIDATE_PORTAL_ENABLED === 'true') {
    if (environment.NODE_ENV === 'production') {
      throw new Error('Candidate Portal is approved for isolated development and test only');
    }
    if (
      !environment.CANDIDATE_MAIL_OUTBOX &&
      !(environment.CANDIDATE_RESEND_API_KEY && environment.CANDIDATE_MAIL_FROM)
    ) {
      throw new Error('Candidate Portal requires a verification email delivery configuration');
    }
  }

  if (environment.NODE_ENV === 'production') {
    if (environment.INVOICE_ISSUANCE_ENABLED === undefined) {
      throw new Error(
        'Invalid environment configuration: INVOICE_ISSUANCE_ENABLED must be explicitly set in production',
      );
    }
    for (const [key, value] of [
      ['AUTH_ACCESS_TOKEN_SECRET', environment.AUTH_ACCESS_TOKEN_SECRET],
      ['AUTH_REFRESH_TOKEN_PEPPER', environment.AUTH_REFRESH_TOKEN_PEPPER],
      ['DATABASE_URL', environment.DATABASE_URL],
    ] as const) {
      if (/change_me|development|example|placeholder|replace|url_encoded/i.test(value)) {
        throw new Error(`Invalid environment configuration: ${key} must be production-grade`);
      }
    }
  }

  return environment;
}
