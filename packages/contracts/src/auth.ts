import { z } from 'zod';

export const AuthenticatedUserSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email(),
  permissions: z.array(z.string()).default([]),
});

export const LoginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(256),
});

export const AuthResponseSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.string().datetime(),
  user: AuthenticatedUserSchema,
});

export const MeResponseSchema = z.object({
  user: AuthenticatedUserSchema,
});

export const AuthErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
export type AuthErrorResponse = z.infer<typeof AuthErrorResponseSchema>;
