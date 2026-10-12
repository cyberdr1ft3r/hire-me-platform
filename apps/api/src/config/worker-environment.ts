import { z } from 'zod';

/** Narrow environment for background workers (no HTTP auth, CORS, or storage). */
const WorkerEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
});

export type WorkerEnvironment = z.infer<typeof WorkerEnvironmentSchema>;

export function loadWorkerEnvironment(source: NodeJS.ProcessEnv = process.env): WorkerEnvironment {
  const parsed = WorkerEnvironmentSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new WorkerEnvironmentError(`Invalid worker environment: ${details}`);
  }
  return parsed.data;
}

export class WorkerEnvironmentError extends Error {
  readonly code = 'WORKER_ENVIRONMENT_INVALID' as const;

  constructor(message: string) {
    super(message);
    this.name = 'WorkerEnvironmentError';
  }
}
