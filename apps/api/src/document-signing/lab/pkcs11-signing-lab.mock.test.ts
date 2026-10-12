import 'reflect-metadata';

import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { Pkcs11LabError } from './pkcs11-lab.errors.js';
import { createMockPkcs11TokenClient } from './mock-pkcs11-token-client.js';
import { Pkcs11SigningLab, LAB_PERSON_SIGNER_CN } from './pkcs11-signing-lab.js';
import { createMinimalLabSourcePdf } from './pkcs11-lab-source-pdf.js';
import { PdfSignatureValidatorService } from '../validation/pdf-signature-validator.service.js';

/** Mock-only evidence: none of these cases exercise SoftHSM or a native PKCS#11 module. */
describe('PKCS#11 lab failure matrix (mock token, not SoftHSM evidence)', () => {
  const pin = `mock-${randomBytes(16).toString('hex')}`;

  function provisionedClient(
    failures?: Parameters<typeof createMockPkcs11TokenClient>[0]['failures'],
  ) {
    const client = createMockPkcs11TokenClient({ pin, failures });
    client.login(pin);
    const reference = client.provisionLabCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: LAB_PERSON_SIGNER_CN,
      privateKeyLabel: 'mock-person',
      certificateLabel: 'mock-person-cert',
    });
    return { client, reference };
  }

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

  it('maps missing private key to PKCS11_KEY_NOT_FOUND', () => {
    const { client, reference } = provisionedClient();
    expect(() => client.resolveLabCredential({ ...reference, privateKeyLabel: 'missing' })).toThrow(
      expect.objectContaining({ code: 'PKCS11_KEY_NOT_FOUND' }) as Error,
    );
  });

  it('mirrors certificate-not-found and CKA_ID mismatch resolution rules', () => {
    const { client, reference } = provisionedClient();
    const other = client.provisionLabCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: LAB_PERSON_SIGNER_CN,
      privateKeyLabel: 'mock-other',
      certificateLabel: 'mock-other-cert',
    });
    expect(() =>
      client.resolveLabCredential({ ...reference, certificateLabel: 'missing-cert' }),
    ).toThrow(expect.objectContaining({ code: 'PKCS11_CERT_NOT_FOUND' }) as Error);
    expect(() =>
      client.resolveLabCredential({ ...reference, certificateLabel: other.certificateLabel }),
    ).toThrow(expect.objectContaining({ code: 'PKCS11_CERT_KEY_MISMATCH' }) as Error);
  });

  it('rejects wrong trust anchor under Phase B validation', async () => {
    const { client, reference } = provisionedClient();
    const lab = new Pkcs11SigningLab(client);
    const sourcePdf = await createMinimalLabSourcePdf('mock-trust');
    const decoy = createMockPkcs11TokenClient({ pin });
    decoy.login(pin);
    const decoyCredential = decoy.resolveLabCredential(
      decoy.provisionLabCredential({
        kind: 'PERSON_SIGNATURE',
        commonName: 'Decoy Trust Anchor',
        privateKeyLabel: 'decoy',
        certificateLabel: 'decoy-cert',
      }),
    );
    const proof = await lab.provePreparedPdfSigning({ sourcePdf, credential: reference });
    const outcome = await new PdfSignatureValidatorService().validateSignedPdf({
      preparedArtifactPdf: proof.preparedPdf,
      signedPdf: proof.signedPdf,
      expectedCredentialFingerprintSha256: proof.credential.certificateFingerprintSha256,
      trustAnchorPems: [decoyCredential.trustAnchorPem],
      trustStoreVersion: 'pkcs11-lab-mock-trust-v1',
    });
    decoy.dispose();
    expect(outcome.chainTrustResult).not.toBe('TRUSTED');
    expect(outcome.overallResult).not.toBe('VALID');
  });

  it.each(['PKCS11_SIGN_FAILED', 'PKCS11_SIGN_MECHANISM_UNSUPPORTED'] as const)(
    'surfaces simulated %s at the sign boundary',
    (code) => {
      const { client, reference } = provisionedClient([{ at: 'sign', code }]);
      const credential = client.resolveLabCredential(reference);
      expect(() => client.signSha256RsaPkcs1(credential, Buffer.alloc(32, 1))).toThrow(
        expect.objectContaining({ code, message: code }) as Error,
      );
    },
  );

  it('surfaces simulated PKCS11_SESSION_FAILED at the resolve boundary', () => {
    const { client, reference } = provisionedClient([
      { at: 'resolve', code: 'PKCS11_SESSION_FAILED' },
    ]);
    expect(() => client.resolveLabCredential(reference)).toThrow(
      expect.objectContaining({ code: 'PKCS11_SESSION_FAILED' }) as Error,
    );
  });
});
