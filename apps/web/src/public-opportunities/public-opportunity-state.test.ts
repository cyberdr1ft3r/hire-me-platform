import { describe, expect, it } from 'vitest';

import { PublicRequestError } from '../api.js';
import { classifySubmissionFailure } from './public-opportunity-state.js';

describe('classifySubmissionFailure', () => {
  it('maps transport oversize to payloadTooLarge without reading response bodies', () => {
    expect(
      classifySubmissionFailure(new PublicRequestError('Public application request failed', 413)),
    ).toBe('payloadTooLarge');
  });

  it('keeps existing status mappings', () => {
    expect(classifySubmissionFailure(new PublicRequestError('x', 400))).toBe('invalid');
    expect(classifySubmissionFailure(new PublicRequestError('x', 404))).toBe('unavailable');
    expect(classifySubmissionFailure(new PublicRequestError('x', 429))).toBe('rateLimited');
    expect(classifySubmissionFailure(new PublicRequestError('x', 503))).toBe('failed');
  });
});
