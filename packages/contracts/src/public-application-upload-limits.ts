/**
 * Public application upload size policy (Issue #84 / A-75-03).
 *
 * Limits are expressed in decimal bytes (SI) for product messaging and enforcement.
 * JSON transport uses base64 file payloads; the HTTP JSON body limit must cover
 * encoded content plus bounded metadata.
 */

/** Maximum raw bytes for one uploaded file (unchanged since Issue #27). */
export const publicApplicationMaxFileSizeBytes = 1_500_000;

/** Maximum combined raw bytes across all files in one submission. */
export const publicApplicationMaxTotalUploadBytes = 5_000_000;

/**
 * Default Express/Nest JSON body parser limit for public application POST bodies.
 * Chosen above worst-case base64 expansion of {@link publicApplicationMaxTotalUploadBytes}
 * plus schema-bounded metadata (see {@link estimatePublicApplicationSubmitJsonBytes}).
 */
export const publicApplicationDefaultJsonBodyLimit = '8mb';

/** Default JSON body parser limit for authenticated and internal API routes. */
export const apiDefaultJsonBodyLimit = '6mb';

/** Base64 length for a given raw byte length (no padding edge cases for large buffers). */
export function publicApplicationEncodedBase64Length(rawBytes: number): number {
  if (rawBytes <= 0) {
    return 0;
  }
  return Math.ceil(rawBytes / 3) * 4;
}

/**
 * Conservative estimate of the UTF-8 JSON body size for a submit request whose
 * files total `totalRawFileBytes` across `fileCount` entries, with optional
 * metadata at schema maximums.
 */
export function estimatePublicApplicationSubmitJsonBytes(options: {
  totalRawFileBytes: number;
  fileCount: number;
  /** Override when tests pin an exact metadata payload size. */
  metadataOverheadBytes?: number;
}): number {
  const metadataOverheadBytes = options.metadataOverheadBytes ?? 40_000;
  const perFileJsonOverhead = options.fileCount * 160;
  return (
    metadataOverheadBytes +
    perFileJsonOverhead +
    publicApplicationEncodedBase64Length(options.totalRawFileBytes)
  );
}
