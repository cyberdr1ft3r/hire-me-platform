import 'reflect-metadata';

import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import { Pkcs11LabError } from './pkcs11-lab.errors.js';
import { isPkcs11LabRuntimeAvailable } from './pkcs11-module-path.js';
import {
  createEphemeralSofthsmEnvironment,
  destroyEphemeralSofthsmEnvironment,
  type SofthsmEphemeralEnvironment,
} from './softhsm-ephemeral-environment.js';
import { createPkcs11TokenClient } from './pkcs11-token-client.js';
import type {
  LabTokenCredentialReference,
  Pkcs11TokenClient,
} from './pkcs11-token-client.types.js';
import { Pkcs11SigningLab, LAB_ORG_SEAL_CN, LAB_PERSON_SIGNER_CN } from './pkcs11-signing-lab.js';
import { createAlternateLabSourcePdf, createMinimalLabSourcePdf } from './pkcs11-lab-source-pdf.js';
import { PreparedSigningArtifactService } from '../prepared-signing-artifact.service.js';
import { verifyPdfCmsSignature } from '../validation/cms-pdf-signature.js';
import { PdfSignatureValidatorService } from '../validation/pdf-signature-validator.service.js';

const TOKEN_LABEL = 'HireMePKCS11Lab183';

function softhsmCliAvailable(): boolean {
  try {
    execFileSync('softhsm2-util', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const labAvailable = isPkcs11LabRuntimeAvailable() && softhsmCliAvailable();

function captureLabError(fn: () => unknown): Pkcs11LabError {
  try {
    fn();
  } catch (error) {
    if (error instanceof Pkcs11LabError) {
      return error;
    }
    throw new Error('Expected Pkcs11LabError');
  }
  throw new Error('Expected Pkcs11LabError');
}

function expectFixedSafeError(error: Pkcs11LabError, code: Pkcs11LabError['code'], pin?: string) {
  expect(error.code).toBe(code);
  expect(error.message).toBe(code);
  if (pin) {
    expect(error.message).not.toContain(pin);
    expect(String(error.stack)).not.toContain(pin);
  }
}

describe('PKCS#11 lab module resolution (native load, no SoftHSM token)', () => {
  it('maps a missing module file to PKCS11_MODULE_UNAVAILABLE', () => {
    const previous = process.env.HIREME_PKCS11_LAB_MODULE_PATH;
    process.env.HIREME_PKCS11_LAB_MODULE_PATH = join(tmpdir(), 'hireme-no-such-pkcs11-module.so');
    try {
      const error = captureLabError(() => createPkcs11TokenClient({ tokenLabel: TOKEN_LABEL }));
      expectFixedSafeError(error, 'PKCS11_MODULE_UNAVAILABLE');
    } finally {
      if (previous === undefined) {
        delete process.env.HIREME_PKCS11_LAB_MODULE_PATH;
      } else {
        process.env.HIREME_PKCS11_LAB_MODULE_PATH = previous;
      }
    }
  });

  it('maps a non-PKCS#11 file to PKCS11_MODULE_LOAD_FAILED without native error text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hireme-pkcs11-bogus-'));
    const bogus = join(dir, 'not-a-module.so');
    writeFileSync(bogus, 'not a shared object');
    try {
      const error = captureLabError(() =>
        createPkcs11TokenClient({ modulePath: bogus, tokenLabel: TOKEN_LABEL }),
      );
      expectFixedSafeError(error, 'PKCS11_MODULE_LOAD_FAILED');
      expect(error.message).not.toContain(bogus);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.runIf(labAvailable)('PKCS#11 SoftHSM signing lab (Issue #183)', () => {
  let env: SofthsmEphemeralEnvironment;
  let userPin: string;
  let tokenClient: Pkcs11TokenClient;

  function openClient(): Pkcs11TokenClient {
    const client = createPkcs11TokenClient({ tokenLabel: TOKEN_LABEL });
    client.login(userPin);
    return client;
  }

  beforeAll(() => {
    env = createEphemeralSofthsmEnvironment(TOKEN_LABEL);
    userPin = env.userPin;
    tokenClient = openClient();
  });

  afterAll(() => {
    tokenClient.dispose();
    destroyEphemeralSofthsmEnvironment(env);
  });

  function provision(
    name: string,
    kind: LabTokenCredentialReference['kind'] = 'PERSON_SIGNATURE',
  ): LabTokenCredentialReference {
    return tokenClient.provisionLabCredential({
      kind,
      commonName: kind === 'PERSON_SIGNATURE' ? LAB_PERSON_SIGNER_CN : LAB_ORG_SEAL_CN,
      privateKeyLabel: `hireme-lab-${name}-key`,
      certificateLabel: `hireme-lab-${name}-cert`,
    });
  }

  it('initializes ephemeral SoftHSM token without committed PIN material', () => {
    expect(env.rootDir).toContain('hireme-pkcs11-lab-');
    expect(userPin).toMatch(/^hm-user-[0-9a-f]{32}$/);
    expect(env.soPin).toMatch(/^hm-so-[0-9a-f]{32}$/);
    expect(env.soPin).not.toBe(userPin);
  });

  it('stores the certificate as a CKO_CERTIFICATE sharing CKA_ID with the key pair and resolves it from a fresh module session', () => {
    const reference = provision('discovery');
    expect(Object.keys(reference).sort()).toEqual(['certificateLabel', 'kind', 'privateKeyLabel']);

    tokenClient.dispose();
    tokenClient = openClient();

    const resolved = tokenClient.resolveLabCredential(reference);
    expect(resolved.certificateLabel).toBe('hireme-lab-discovery-cert');
    expect(resolved.privateKeyLabel).toBe('hireme-lab-discovery-key');
    expect(resolved.objectIdHex).toMatch(/^[0-9a-f]{32}$/);
    expect(resolved.publicKeyObjectMatched).toBe(true);
    expect(resolved.privateKeyProtection).toEqual({ sensitive: true, extractable: false });
    expect(resolved.subjectCommonName).toBe(LAB_PERSON_SIGNER_CN);

    const tokenCert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(resolved.certificateDer.toString('binary')),
    );
    const tokenCertKey = tokenCert.publicKey as forge.pki.rsa.PublicKey;
    expect(tokenCertKey.n.toString(16)).toBe(resolved.tokenPublicKey.modulusHex);
    expect(tokenCertKey.e.toString(16)).toBe(resolved.tokenPublicKey.publicExponentHex);
    expect(tokenCertKey.n.bitLength()).toBe(2048);
    expect(tokenCert.verify(tokenCert)).toBe(true);
    expect(resolved.certificateFingerprintSha256).toBe(
      createHash('sha256').update(resolved.certificateDer).digest('hex'),
    );
  });

  it('signs exact prepared PDF with the token-resolved credential and passes Phase B with test-only trust anchor', async () => {
    const sourcePdf = await createMinimalLabSourcePdf('person-proof');
    const reference = provision('person-proof');
    const proof = await new Pkcs11SigningLab(tokenClient).provePreparedPdfSigning({
      sourcePdf,
      credential: reference,
    });
    const tokenCredential = tokenClient.resolveLabCredential(reference);

    expect(proof.validation.overallResult).toBe('VALID');
    expect(proof.validation.certificateFingerprintSha256).toBe(
      tokenCredential.certificateFingerprintSha256,
    );
    expect(proof.validation.certificateSubjectSummary).toContain('NOT QUALIFIED');

    const cms = verifyPdfCmsSignature(proof.signedPdf);
    expect(cms.cmsCryptoValid).toBe(true);
    expect(cms.signerCertDer.equals(tokenCredential.certificateDer)).toBe(true);
    const signerCert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(cms.signerCertDer.toString('binary')),
    );
    expect((signerCert.publicKey as forge.pki.rsa.PublicKey).n.toString(16)).toBe(
      tokenCredential.tokenPublicKey.modulusHex,
    );
  });

  it('keeps ORGANIZATION_SEAL synthetic credential distinct from person signature', async () => {
    const sourcePdf = await createMinimalLabSourcePdf('seal-proof');
    const person = provision('person-distinct');
    const seal = provision('org-distinct', 'ORGANIZATION_SEAL');
    const lab = new Pkcs11SigningLab(tokenClient);
    const personProof = await lab.provePreparedPdfSigning({ sourcePdf, credential: person });
    const sealProof = await lab.provePreparedPdfSigning({ sourcePdf, credential: seal });
    expect(personProof.validation.overallResult).toBe('VALID');
    expect(sealProof.validation.overallResult).toBe('VALID');
    expect(sealProof.credential.kind).toBe('ORGANIZATION_SEAL');
    expect(sealProof.credential.subjectCommonName).toBe(LAB_ORG_SEAL_CN);
    expect(sealProof.credential.objectIdHex).not.toBe(personProof.credential.objectIdHex);
    expect(sealProof.credential.certificateFingerprintSha256).not.toBe(
      personProof.credential.certificateFingerprintSha256,
    );
  });

  it('fails validation when signed bytes are tampered', async () => {
    const sourcePdf = await createMinimalLabSourcePdf('tamper');
    const proof = await new Pkcs11SigningLab(tokenClient).provePreparedPdfSigning({
      sourcePdf,
      credential: provision('tamper'),
    });
    const tampered = Buffer.from(proof.signedPdf);
    const tamperIndex = Math.max(0, tampered.length - 40);
    tampered[tamperIndex] = (tampered[tamperIndex] ?? 0) ^ 0xff;
    const outcome = await new PdfSignatureValidatorService().validateSignedPdf({
      preparedArtifactPdf: proof.preparedPdf,
      signedPdf: tampered,
      expectedCredentialFingerprintSha256: proof.credential.certificateFingerprintSha256,
      trustAnchorPems: [proof.credential.trustAnchorPem],
      trustStoreVersion: 'pkcs11-lab-test-trust-v1',
    });
    expect(outcome.overallResult).not.toBe('VALID');
  });

  it('fails prepared-artifact binding for a different source PDF', async () => {
    const sourcePdf = await createMinimalLabSourcePdf('binding-a');
    const otherSource = await createAlternateLabSourcePdf();
    const credential = tokenClient.resolveLabCredential(provision('binding'));
    const prepared = new PreparedSigningArtifactService();
    const preparedA = prepared.buildPreparedArtifact(sourcePdf);
    const preparedB = prepared.buildPreparedArtifact(otherSource);
    const signed = await new Pkcs11SigningLab(tokenClient).signPreparedArtifact(
      preparedA,
      credential,
    );
    const outcome = await new PdfSignatureValidatorService().validateSignedPdf({
      preparedArtifactPdf: preparedB,
      signedPdf: signed,
      expectedCredentialFingerprintSha256: credential.certificateFingerprintSha256,
      trustAnchorPems: [credential.trustAnchorPem],
      trustStoreVersion: 'pkcs11-lab-test-trust-v1',
    });
    expect(outcome.overallResult).toBe('INVALID');
    expect(outcome.sourceBindingResult).toBe('INVALID');
  });

  it('does not accept wrong expected credential fingerprint silently', async () => {
    const sourcePdf = await createMinimalLabSourcePdf('fp-mismatch');
    const proof = await new Pkcs11SigningLab(tokenClient).provePreparedPdfSigning({
      sourcePdf,
      credential: provision('fp'),
    });
    const outcome = await new PdfSignatureValidatorService().validateSignedPdf({
      preparedArtifactPdf: proof.preparedPdf,
      signedPdf: proof.signedPdf,
      expectedCredentialFingerprintSha256: createHash('sha256').update('decoy').digest('hex'),
      trustAnchorPems: [proof.credential.trustAnchorPem],
      trustStoreVersion: 'pkcs11-lab-test-trust-v1',
    });
    expect(outcome.overallResult).not.toBe('VALID');
  });

  it('fails closed on wrong PIN without leaking PIN in error text', () => {
    tokenClient.logout();
    const error = captureLabError(() => tokenClient.login(`${userPin}-wrong`));
    expectFixedSafeError(error, 'PKCS11_LOGIN_FAILED', userPin);
    tokenClient.login(userPin);
  });

  it('maps a missing certificate object to PKCS11_CERT_NOT_FOUND', () => {
    const reference = provision('cert-missing');
    const error = captureLabError(() =>
      tokenClient.resolveLabCredential({
        ...reference,
        certificateLabel: 'hireme-lab-no-such-cert',
      }),
    );
    expectFixedSafeError(error, 'PKCS11_CERT_NOT_FOUND', userPin);
  });

  it('maps a missing private key object to PKCS11_KEY_NOT_FOUND', () => {
    const reference = provision('key-missing');
    const error = captureLabError(() =>
      tokenClient.resolveLabCredential({ ...reference, privateKeyLabel: 'hireme-lab-no-such-key' }),
    );
    expectFixedSafeError(error, 'PKCS11_KEY_NOT_FOUND', userPin);
  });

  it('maps a certificate whose CKA_ID belongs to a different key pair to PKCS11_CERT_KEY_MISMATCH', () => {
    const first = provision('id-mismatch-a');
    const second = provision('id-mismatch-b');
    const error = captureLabError(() =>
      tokenClient.resolveLabCredential({
        ...second,
        certificateLabel: first.certificateLabel,
      }),
    );
    expectFixedSafeError(error, 'PKCS11_CERT_KEY_MISMATCH', userPin);
  });

  it('maps the matching certificate stored under a different CKA_ID to PKCS11_CERT_KEY_MISMATCH', () => {
    const resolved = tokenClient.resolveLabCredential(provision('id-only-mismatch'));
    tokenClient.storeLabCertificate({
      certificateDer: resolved.certificateDer,
      certificateLabel: 'hireme-lab-id-only-mismatch-relabelled-cert',
      objectIdHex: randomBytes(16).toString('hex'),
    });
    const error = captureLabError(() =>
      tokenClient.resolveLabCredential({
        kind: 'PERSON_SIGNATURE',
        privateKeyLabel: resolved.privateKeyLabel,
        certificateLabel: 'hireme-lab-id-only-mismatch-relabelled-cert',
      }),
    );
    expectFixedSafeError(error, 'PKCS11_CERT_KEY_MISMATCH', userPin);
  });

  it('maps a certificate sharing the key CKA_ID but carrying another public key to PKCS11_CERT_KEY_MISMATCH', () => {
    const donor = tokenClient.resolveLabCredential(provision('modulus-donor'));
    const target = tokenClient.resolveLabCredential(provision('modulus-target'));
    tokenClient.storeLabCertificate({
      certificateDer: donor.certificateDer,
      certificateLabel: 'hireme-lab-modulus-forged-cert',
      objectIdHex: target.objectIdHex,
    });
    const error = captureLabError(() =>
      tokenClient.resolveLabCredential({
        kind: 'PERSON_SIGNATURE',
        privateKeyLabel: target.privateKeyLabel,
        certificateLabel: 'hireme-lab-modulus-forged-cert',
      }),
    );
    expectFixedSafeError(error, 'PKCS11_CERT_KEY_MISMATCH', userPin);
  });

  it('maps duplicate certificate labels to PKCS11_OBJECT_AMBIGUOUS instead of picking one', () => {
    const reference = provision('ambiguous');
    const resolved = tokenClient.resolveLabCredential(reference);
    tokenClient.storeLabCertificate({
      certificateDer: resolved.certificateDer,
      certificateLabel: reference.certificateLabel,
      objectIdHex: resolved.objectIdHex,
    });
    const error = captureLabError(() => tokenClient.resolveLabCredential(reference));
    expectFixedSafeError(error, 'PKCS11_OBJECT_AMBIGUOUS', userPin);
  });

  it('maps signing after logout to PKCS11_SIGN_FAILED', () => {
    const resolved = tokenClient.resolveLabCredential(provision('sign-logged-out'));
    tokenClient.logout();
    try {
      const error = captureLabError(() =>
        tokenClient.signSha256RsaPkcs1(resolved, Buffer.alloc(32, 7)),
      );
      expectFixedSafeError(error, 'PKCS11_SIGN_FAILED', userPin);
    } finally {
      tokenClient.login(userPin);
    }
  });

  it('maps private key generation without a user login to PKCS11_PROVISIONING_FAILED', () => {
    tokenClient.logout();
    try {
      const error = captureLabError(() => provision('provision-logged-out'));
      expectFixedSafeError(error, 'PKCS11_PROVISIONING_FAILED', userPin);
    } finally {
      tokenClient.login(userPin);
    }
  });

  it('maps an unknown token label to PKCS11_SLOT_NOT_FOUND', () => {
    tokenClient.dispose();
    try {
      const error = captureLabError(() =>
        createPkcs11TokenClient({ tokenLabel: 'HireMeNoSuchLabToken' }),
      );
      expectFixedSafeError(error, 'PKCS11_SLOT_NOT_FOUND');
    } finally {
      tokenClient = openClient();
    }
  });

  it('does not mutate production SIGNING_TRUST_ANCHOR_PEMS', () => {
    expect(process.env.SIGNING_TRUST_ANCHOR_PEMS ?? '').not.toContain('NOT QUALIFIED');
  });
});

describe.runIf(!labAvailable)('PKCS#11 SoftHSM signing lab — skipped', () => {
  it('records skip when SoftHSM/module unavailable', () => {
    expect(labAvailable).toBe(false);
  });
});
