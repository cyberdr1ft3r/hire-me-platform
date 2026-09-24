import { describe, expect, it } from 'vitest';

import {
  apiDefaultJsonBodyLimit,
  estimatePublicApplicationSubmitJsonBytes,
  publicApplicationDefaultJsonBodyLimit,
  publicApplicationEncodedBase64Length,
  publicApplicationMaxFileSizeBytes,
  publicApplicationMaxTotalUploadBytes,
} from './public-application-upload-limits.js';

const EIGHT_MB_BYTES = 8 * 1024 * 1024;

describe('public application upload limits', () => {
  it('documents the per-file and aggregate raw caps', () => {
    expect(publicApplicationMaxFileSizeBytes).toBe(1_500_000);
    expect(publicApplicationMaxTotalUploadBytes).toBe(5_000_000);
    expect(apiDefaultJsonBodyLimit).toBe('6mb');
  });

  it('keeps the default JSON transport limit above max aggregate base64 plus metadata', () => {
    expect(publicApplicationDefaultJsonBodyLimit).toBe('8mb');
    const worstCase = estimatePublicApplicationSubmitJsonBytes({
      totalRawFileBytes: publicApplicationMaxTotalUploadBytes,
      fileCount: 8,
    });
    expect(worstCase).toBeLessThan(EIGHT_MB_BYTES);
  });

  it('covers the audit-reported ~4.8 MB aggregate case under the new transport limit', () => {
    const auditCase = estimatePublicApplicationSubmitJsonBytes({
      totalRawFileBytes: 4_800_000,
      fileCount: 3,
    });
    expect(auditCase).toBeGreaterThan(6 * 1024 * 1024);
    expect(auditCase).toBeLessThan(EIGHT_MB_BYTES);
  });

  it('matches standard base64 expansion sizing', () => {
    expect(publicApplicationEncodedBase64Length(3)).toBe(4);
    expect(publicApplicationEncodedBase64Length(5_000_000)).toBe(6_666_668);
  });
});
