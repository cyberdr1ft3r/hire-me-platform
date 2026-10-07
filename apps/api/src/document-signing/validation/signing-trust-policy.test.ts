import 'reflect-metadata';

import forge from 'node-forge';
import { describe, expect, it } from 'vitest';

import {
  createSyntheticIntermediateChainP12,
  createSyntheticSigningP12,
} from '../../../test/support/signing-synthetic-pdf.js';
import { evaluateCertificateTrust } from './signing-trust-policy.js';

const REFERENCE_TIME = new Date('2026-06-01T12:00:00.000Z');

function certDerFromPem(pem: string): Buffer {
  return Buffer.from(
    forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(pem))).getBytes(),
    'binary',
  );
}

function pemFromForgeCert(cert: forge.pki.Certificate): string {
  return forge.pki.certificateToPem(cert);
}

function issueCertificate(input: {
  subjectCn: string;
  issuerCn: string;
  subjectKeys: forge.pki.rsa.KeyPair;
  issuerPrivateKey: forge.pki.rsa.PrivateKey;
  notBefore: Date;
  notAfter: Date;
  isCa?: boolean;
}): forge.pki.Certificate {
  const cert = forge.pki.createCertificate();
  cert.publicKey = input.subjectKeys.publicKey;
  cert.serialNumber = String(Math.floor(Math.random() * 1_000_000));
  cert.validity.notBefore = input.notBefore;
  cert.validity.notAfter = input.notAfter;
  cert.setSubject([{ name: 'commonName', value: input.subjectCn }]);
  cert.setIssuer([{ name: 'commonName', value: input.issuerCn }]);
  if (input.isCa) {
    cert.setExtensions([{ name: 'basicConstraints', cA: true, critical: true }]);
  }
  cert.sign(input.issuerPrivateKey, forge.md.sha256.create());
  return cert;
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
      referenceTime: REFERENCE_TIME,
    });
    expect(result.result).toBe('INDETERMINATE');
    expect(result.reasonCode).toBe('TRUST_STORE_EMPTY');
  });

  it('trusts leaf through intermediate to configured root anchor', async () => {
    const chain = createSyntheticIntermediateChainP12();
    const leafDer = certDerFromPem(chain.leafCertPem);
    const intermediateDer = certDerFromPem(chain.intermediateCertPem);
    const result = await evaluateCertificateTrust({
      signerCertDer: leafDer,
      untrustedCertDerCandidates: [intermediateDer],
      trustAnchorPems: [chain.rootTrustAnchorPem],
      trustStoreVersion: 'unit',
      referenceTime: new Date(),
    });
    expect(result.result).toBe('TRUSTED');
  });

  it('rejects same leaf/intermediate when configured root is wrong', async () => {
    const chain = createSyntheticIntermediateChainP12();
    const leafDer = certDerFromPem(chain.leafCertPem);
    const intermediateDer = certDerFromPem(chain.intermediateCertPem);
    const result = await evaluateCertificateTrust({
      signerCertDer: leafDer,
      untrustedCertDerCandidates: [intermediateDer],
      trustAnchorPems: [chain.wrongRootTrustAnchorPem],
      trustStoreVersion: 'unit',
      referenceTime: REFERENCE_TIME,
    });
    expect(result.result).toBe('UNTRUSTED');
  });

  it('rejects expired leaf at reference time', async () => {
    const rootKeys = forge.pki.rsa.generateKeyPair(2048);
    const leafKeys = forge.pki.rsa.generateKeyPair(2048);
    const root = issueCertificate({
      subjectCn: 'Root',
      issuerCn: 'Root',
      subjectKeys: rootKeys,
      issuerPrivateKey: rootKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2030-01-01'),
      isCa: true,
    });
    const leaf = issueCertificate({
      subjectCn: 'Leaf',
      issuerCn: 'Root',
      subjectKeys: leafKeys,
      issuerPrivateKey: rootKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2025-01-01'),
    });
    const result = await evaluateCertificateTrust({
      signerCertDer: certDerFromPem(pemFromForgeCert(leaf)),
      untrustedCertDerCandidates: [],
      trustAnchorPems: [pemFromForgeCert(root)],
      trustStoreVersion: 'unit',
      referenceTime: REFERENCE_TIME,
    });
    expect(result.result).toBe('UNTRUSTED');
    expect(result.reasonCode).toBe('CERTIFICATE_NOT_VALID_AT_REFERENCE_TIME');
  });

  it('rejects not-yet-valid leaf at reference time', async () => {
    const rootKeys = forge.pki.rsa.generateKeyPair(2048);
    const leafKeys = forge.pki.rsa.generateKeyPair(2048);
    const root = issueCertificate({
      subjectCn: 'Root',
      issuerCn: 'Root',
      subjectKeys: rootKeys,
      issuerPrivateKey: rootKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2030-01-01'),
      isCa: true,
    });
    const leaf = issueCertificate({
      subjectCn: 'Leaf',
      issuerCn: 'Root',
      subjectKeys: leafKeys,
      issuerPrivateKey: rootKeys.privateKey,
      notBefore: new Date('2027-01-01'),
      notAfter: new Date('2030-01-01'),
    });
    const result = await evaluateCertificateTrust({
      signerCertDer: certDerFromPem(pemFromForgeCert(leaf)),
      untrustedCertDerCandidates: [],
      trustAnchorPems: [pemFromForgeCert(root)],
      trustStoreVersion: 'unit',
      referenceTime: REFERENCE_TIME,
    });
    expect(result.result).toBe('UNTRUSTED');
    expect(result.reasonCode).toBe('CERTIFICATE_NOT_VALID_AT_REFERENCE_TIME');
  });

  it('rejects expired intermediate in chain (never TRUSTED)', async () => {
    const rootKeys = forge.pki.rsa.generateKeyPair(2048);
    const intermediateKeys = forge.pki.rsa.generateKeyPair(2048);
    const leafKeys = forge.pki.rsa.generateKeyPair(2048);
    const root = issueCertificate({
      subjectCn: 'Root',
      issuerCn: 'Root',
      subjectKeys: rootKeys,
      issuerPrivateKey: rootKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2030-01-01'),
      isCa: true,
    });
    const intermediate = issueCertificate({
      subjectCn: 'Intermediate',
      issuerCn: 'Root',
      subjectKeys: intermediateKeys,
      issuerPrivateKey: rootKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2025-01-01'),
      isCa: true,
    });
    const leaf = issueCertificate({
      subjectCn: 'Leaf',
      issuerCn: 'Intermediate',
      subjectKeys: leafKeys,
      issuerPrivateKey: intermediateKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2030-01-01'),
    });
    const result = await evaluateCertificateTrust({
      signerCertDer: certDerFromPem(pemFromForgeCert(leaf)),
      untrustedCertDerCandidates: [certDerFromPem(pemFromForgeCert(intermediate))],
      trustAnchorPems: [pemFromForgeCert(root)],
      trustStoreVersion: 'unit',
      referenceTime: REFERENCE_TIME,
    });
    expect(result.result).toBe('UNTRUSTED');
    expect(result.reasonCode).toBe('CHAIN_CERTIFICATE_NOT_VALID_AT_REFERENCE_TIME');
  });

  it('rejects not-yet-valid intermediate in chain (never TRUSTED)', async () => {
    const rootKeys = forge.pki.rsa.generateKeyPair(2048);
    const intermediateKeys = forge.pki.rsa.generateKeyPair(2048);
    const leafKeys = forge.pki.rsa.generateKeyPair(2048);
    const root = issueCertificate({
      subjectCn: 'Root',
      issuerCn: 'Root',
      subjectKeys: rootKeys,
      issuerPrivateKey: rootKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2030-01-01'),
      isCa: true,
    });
    const intermediate = issueCertificate({
      subjectCn: 'Intermediate',
      issuerCn: 'Root',
      subjectKeys: intermediateKeys,
      issuerPrivateKey: rootKeys.privateKey,
      notBefore: new Date('2027-01-01'),
      notAfter: new Date('2030-01-01'),
      isCa: true,
    });
    const leaf = issueCertificate({
      subjectCn: 'Leaf',
      issuerCn: 'Intermediate',
      subjectKeys: leafKeys,
      issuerPrivateKey: intermediateKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2030-01-01'),
    });
    const result = await evaluateCertificateTrust({
      signerCertDer: certDerFromPem(pemFromForgeCert(leaf)),
      untrustedCertDerCandidates: [certDerFromPem(pemFromForgeCert(intermediate))],
      trustAnchorPems: [pemFromForgeCert(root)],
      trustStoreVersion: 'unit',
      referenceTime: REFERENCE_TIME,
    });
    expect(result.result).toBe('UNTRUSTED');
    expect(result.reasonCode).toBe('CHAIN_CERTIFICATE_NOT_VALID_AT_REFERENCE_TIME');
  });

  it('rejects configured root anchor that is expired at reference time when terminating chain', async () => {
    const rootKeys = forge.pki.rsa.generateKeyPair(2048);
    const intermediateKeys = forge.pki.rsa.generateKeyPair(2048);
    const leafKeys = forge.pki.rsa.generateKeyPair(2048);
    const expiredRoot = issueCertificate({
      subjectCn: 'Expired Root',
      issuerCn: 'Expired Root',
      subjectKeys: rootKeys,
      issuerPrivateKey: rootKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2025-01-01'),
      isCa: true,
    });
    const intermediate = issueCertificate({
      subjectCn: 'Intermediate',
      issuerCn: 'Expired Root',
      subjectKeys: intermediateKeys,
      issuerPrivateKey: rootKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2030-01-01'),
      isCa: true,
    });
    const leaf = issueCertificate({
      subjectCn: 'Leaf',
      issuerCn: 'Intermediate',
      subjectKeys: leafKeys,
      issuerPrivateKey: intermediateKeys.privateKey,
      notBefore: new Date('2020-01-01'),
      notAfter: new Date('2030-01-01'),
    });
    const result = await evaluateCertificateTrust({
      signerCertDer: certDerFromPem(pemFromForgeCert(leaf)),
      untrustedCertDerCandidates: [certDerFromPem(pemFromForgeCert(intermediate))],
      trustAnchorPems: [pemFromForgeCert(expiredRoot)],
      trustStoreVersion: 'unit',
      referenceTime: REFERENCE_TIME,
    });
    expect(result.result).toBe('UNTRUSTED');
    expect([
      'CHAIN_CERTIFICATE_NOT_VALID_AT_REFERENCE_TIME',
      'CERTIFICATE_CHAIN_UNTRUSTED',
    ]).toContain(result.reasonCode);
  });
});
