export const GENERATION_PERMISSIONS = {
  /** Dedicated capability for producing an official business output file. */
  DOCUMENTS_GENERATE: 'documents:generate',
} as const;

export type GenerationPermission =
  (typeof GENERATION_PERMISSIONS)[keyof typeof GENERATION_PERMISSIONS];
