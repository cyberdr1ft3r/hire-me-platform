import 'reflect-metadata';

import forge from 'node-forge';
import { describe, expect, it } from 'vitest';

import {
  createSyntheticIntermediateChainP12,
  createSyntheticSigningP12,
} from '../../../test/support/signing-synthetic-pdf.js';
import { evaluateCertificateTrust } from './signing-trust-policy.js';

function certDerFromPem(pem: string): Buffer {
  return Buffer.from(
    forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(pem))).getBytes(),
    'binary',
  );
}

describe('evaluateCertificateTrust (hireme-signing-trust-v2)', () => {
  it('trusts self-signed leaf when configured as anchor', async () => {
    const material = createSyntheticSigningP12('Self Anchor');
    const result = await evaluateCertificateTrust({
      signerCertDer: certDerFromPem(material.trustAnchorPem),
      untrustedCertDerCandidates: [],
      trustAnchorPems: [material.trustAnchorPem],
      trustStoreVersion: 'unit',
      referenceTime: new Date(),
    });
    expect(result.result).toBe('TRUSTED');
  });

  it('rejects unrelated self-signed signer against unrelated root', async () => {
    const chain = createSyntheticIntermediateChainP12();
    const unrelated = createSyntheticSigningP12('Unrelated');
    const result = await evaluateCertificateTrust({
      signerCertDer: certDerFromPem(unrelated.trustAnchorPem),
      untrustedCertDerCandidates: [],
      trustAnchorPems: [chain.rootTrustAnchorPem],
      trustStoreVersion: 'unit',
      referenceTime: new Date(),
    });
    expect(result.result).toBe('UNTRUSTED');
  });

  it('returns INDETERMINATE when trust store is empty', async () => {
    const material = createSyntheticSigningP12();
    const result = await evaluateCertificateTrust({
      signerCertDer: certDerFromPem(material.trustAnchorPem),
      untrustedCertDerCandidates: [],
      trustAnchorPems: [],
      trustStoreVersion: 'unit',
      referenceTime: new Date(),
    });
    expect(result.result).toBe('INDETERMINATE');
    expect(result.reasonCode).toBe('TRUST_STORE_EMPTY');
  });
});
