import 'reflect-metadata';

import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { Pkcs11LabError } from './pkcs11-lab.errors.js';
import { createMockPkcs11TokenClient } from './mock-pkcs11-token-client.js';
import { Pkcs11SigningLab, LAB_PERSON_SIGNER_CN } from './pkcs11-signing-lab.js';
import { createMinimalLabSourcePdf } from './pkcs11-lab-source-pdf.js';
import { PdfSignatureValidatorService } from '../validation/pdf-signature-validator.service.js';

describe('PKCS#11 lab failure matrix (mock token)', () => {
  const pin = `mock-${randomBytes(16).toString('hex')}`;

  it('maps wrong PIN to safe error without echoing supplied PIN', () => {
    const client = createMockPkcs11TokenClient({ pin });
    let error: Pkcs11LabError | undefined;
    try {
      client.login(`${pin}-bad`);
    } catch (caught) {
      error = caught as Pkcs11LabError;
    }
    expect(error?.code).toBe('PKCS11_LOGIN_FAILED');
    expect(String(error?.message)).not.toContain(pin);
  });

  it('maps missing private key to PKCS11_KEY_NOT_FOUND', async () => {
    const client = createMockPkcs11TokenClient({ pin });
    client.login(pin);
    const credential = client.provisionLabCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: LAB_PERSON_SIGNER_CN,
      privateKeyLabel: 'mock-person',
      certificateLabel: 'mock-person-cert',
    });
    const lab = new Pkcs11SigningLab(client);
    const sourcePdf = await createMinimalLabSourcePdf('mock-key-miss');
    const prepared = new (
      await import('../prepared-signing-artifact.service.js')
    ).PreparedSigningArtifactService();
    const preparedPdf = prepared.buildPreparedArtifact(sourcePdf);
    await expect(
      lab.signPreparedArtifact(preparedPdf, { ...credential, privateKeyLabel: 'missing' }),
    ).rejects.toMatchObject({ code: 'PKCS11_KEY_NOT_FOUND' });
  });

  it('rejects wrong trust anchor under Phase B validation', async () => {
    const client = createMockPkcs11TokenClient({ pin });
    client.login(pin);
    const credential = client.provisionLabCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: LAB_PERSON_SIGNER_CN,
      privateKeyLabel: 'mock-trust',
      certificateLabel: 'mock-trust-cert',
    });
    const lab = new Pkcs11SigningLab(client);
    const sourcePdf = await createMinimalLabSourcePdf('mock-trust');
    const decoy = createMockPkcs11TokenClient({ pin });
    decoy.login(pin);
    const decoyCredential = decoy.provisionLabCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: 'Decoy Trust Anchor',
      privateKeyLabel: 'decoy',
      certificateLabel: 'decoy-cert',
    });
    const proof = await lab.provePreparedPdfSigning({ sourcePdf, credential });
    const outcome = await new PdfSignatureValidatorService().validateSignedPdf({
      preparedArtifactPdf: proof.preparedPdf,
      signedPdf: proof.signedPdf,
      expectedCredentialFingerprintSha256: credential.certificateFingerprintSha256,
      trustAnchorPems: [decoyCredential.trustAnchorPem],
      trustStoreVersion: 'pkcs11-lab-mock-trust-v1',
    });
    decoy.dispose();
    expect(outcome.chainTrustResult).not.toBe('TRUSTED');
    expect(outcome.overallResult).not.toBe('VALID');
  });

  it('surfaces simulated sign failure code', () => {
    const client = createMockPkcs11TokenClient({
      pin,
      failures: [{ at: 'sign', code: 'PKCS11_SIGN_FAILED' }],
    });
    client.login(pin);
    const credential = client.provisionLabCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: LAB_PERSON_SIGNER_CN,
      privateKeyLabel: 'mock-sign-fail',
      certificateLabel: 'mock-sign-fail-cert',
    });
    const privateKey = client.findPrivateKeyByLabel(credential.privateKeyLabel);
    expect(() => client.signSha256RsaPkcs1(privateKey, Buffer.alloc(32, 1))).toThrow(
      Pkcs11LabError,
    );
  });
});
