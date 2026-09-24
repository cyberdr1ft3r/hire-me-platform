import { describe, expect, it } from 'vitest';

import {
  effectiveOptionalCategoryUploadRequirements,
  normalizeOptionalCategoryUploadForPersist,
} from './public-upload-requirements.js';

describe('optional category upload requirements', () => {
  it('clears required when a category is disabled', () => {
    expect(
      effectiveOptionalCategoryUploadRequirements({
        certificationsEnabled: false,
        certificationsRequired: true,
        diplomasEnabled: false,
        diplomasRequired: true,
      }),
    ).toEqual({
      certificationsEnabled: false,
      certificationsRequired: false,
      diplomasEnabled: false,
      diplomasRequired: false,
    });
  });

  it('preserves enabled required and enabled optional combinations', () => {
    expect(
      effectiveOptionalCategoryUploadRequirements({
        certificationsEnabled: true,
        certificationsRequired: true,
        diplomasEnabled: true,
        diplomasRequired: false,
      }),
    ).toEqual({
      certificationsEnabled: true,
      certificationsRequired: true,
      diplomasEnabled: true,
      diplomasRequired: false,
    });
  });

  it('normalizes persisted flags when staff disables a category', () => {
    expect(
      normalizeOptionalCategoryUploadForPersist(
        {
          certificationsEnabled: true,
          certificationsRequired: true,
          diplomasEnabled: true,
          diplomasRequired: true,
        },
        { certificationsEnabled: false },
      ),
    ).toEqual({
      certificationsEnabled: false,
      certificationsRequired: false,
      diplomasEnabled: true,
      diplomasRequired: true,
    });
  });

  it('repairs contradictory stored rows without an explicit required patch', () => {
    expect(
      normalizeOptionalCategoryUploadForPersist(
        {
          certificationsEnabled: false,
          certificationsRequired: true,
          diplomasEnabled: false,
          diplomasRequired: true,
        },
        {},
      ),
    ).toEqual({
      certificationsEnabled: false,
      certificationsRequired: false,
      diplomasEnabled: false,
      diplomasRequired: false,
    });
  });
});
