import { z } from 'zod';

const EnvironmentSchema = z.object({
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  API_CORS_ORIGIN: z.string().url(),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  AUTH_ACCESS_TOKEN_SECRET: z.string().min(32),
  AUTH_COOKIE_SECURE: z.coerce.boolean().optional(),
  AUTH_REFRESH_TOKEN_PEPPER: z.string().min(32),
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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

  if (environment.NODE_ENV === 'production') {
    for (const [key, value] of [
      ['AUTH_ACCESS_TOKEN_SECRET', environment.AUTH_ACCESS_TOKEN_SECRET],
      ['AUTH_REFRESH_TOKEN_PEPPER', environment.AUTH_REFRESH_TOKEN_PEPPER],
    ] as const) {
      if (/change_me|development|example|placeholder/i.test(value)) {
        throw new Error(`Invalid environment configuration: ${key} must be production-grade`);
      }
    }
  }

  return environment;
}
