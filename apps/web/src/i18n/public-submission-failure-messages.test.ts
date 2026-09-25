import { describe, expect, it } from 'vitest';

import { enMessages } from './messages/en.js';
import { frMessages } from './messages/fr.js';

describe('public submission failure messages', () => {
  it('localizes transport oversize feedback in EN and FR', () => {
    expect(enMessages.publicOpportunity.feedback.failure.payloadTooLarge).toMatch(/size limit/i);
    expect(frMessages.publicOpportunity.feedback.failure.payloadTooLarge).toMatch(
      /taille maximale/i,
    );
  });
});
