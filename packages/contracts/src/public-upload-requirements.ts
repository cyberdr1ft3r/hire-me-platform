/**
 * Optional public upload categories (certifications, diplomas) follow one
 * invariant: a disabled category cannot be required (Issue #82 / A-75-01).
 */

export type OptionalCategoryUploadFlags = {
  certificationsEnabled: boolean;
  certificationsRequired: boolean;
  diplomasEnabled: boolean;
  diplomasRequired: boolean;
};

/** Effective requirements exposed to candidates and enforced on submit. */
export function effectiveOptionalCategoryUploadRequirements(
  flags: OptionalCategoryUploadFlags,
): OptionalCategoryUploadFlags {
  return {
    certificationsEnabled: flags.certificationsEnabled,
    certificationsRequired: flags.certificationsEnabled && flags.certificationsRequired,
    diplomasEnabled: flags.diplomasEnabled,
    diplomasRequired: flags.diplomasEnabled && flags.diplomasRequired,
  };
}

/**
 * Merge a partial staff update with stored flags, then enforce the invariant
 * before persisting.
 */
export function normalizeOptionalCategoryUploadForPersist(
  stored: OptionalCategoryUploadFlags,
  patch: Partial<OptionalCategoryUploadFlags>,
): OptionalCategoryUploadFlags {
  const merged: OptionalCategoryUploadFlags = {
    certificationsEnabled: patch.certificationsEnabled ?? stored.certificationsEnabled,
    certificationsRequired: patch.certificationsRequired ?? stored.certificationsRequired,
    diplomasEnabled: patch.diplomasEnabled ?? stored.diplomasEnabled,
    diplomasRequired: patch.diplomasRequired ?? stored.diplomasRequired,
  };
  return effectiveOptionalCategoryUploadRequirements(merged);
}
