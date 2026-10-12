import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import type { Pkcs11LabError } from './pkcs11-lab.errors.js';
import { isPkcs11LabRuntimeAvailable } from './pkcs11-module-path.js';
import {
  createEphemeralSofthsmEnvironment,
  destroyEphemeralSofthsmEnvironment,
  type SofthsmEphemeralEnvironment,
} from './softhsm-ephemeral-environment.js';
import { createPkcs11TokenClient } from './pkcs11-token-client.js';
import type {
  LabTokenCertificateMaterial,
  Pkcs11TokenClient,
} from './pkcs11-token-client.types.js';
import { Pkcs11SigningLab, LAB_ORG_SEAL_CN, LAB_PERSON_SIGNER_CN } from './pkcs11-signing-lab.js';
import { createAlternateLabSourcePdf, createMinimalLabSourcePdf } from './pkcs11-lab-source-pdf.js';
import { PreparedSigningArtifactService } from '../prepared-signing-artifact.service.js';
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

describe.runIf(labAvailable)('PKCS#11 SoftHSM signing lab (Issue #183)', () => {
  let env: SofthsmEphemeralEnvironment;
  let userPin: string;
  let tokenClient: Pkcs11TokenClient;

  beforeAll(() => {
    env = createEphemeralSofthsmEnvironment(TOKEN_LABEL);
    userPin = env.userPin;
    tokenClient = createPkcs11TokenClient({ tokenLabel: TOKEN_LABEL });
    tokenClient.login(userPin);
  });

  afterAll(() => {
    tokenClient.dispose();
    destroyEphemeralSofthsmEnvironment(env);
  });

  function provisionCredential(spec: {
    kind: 'PERSON_SIGNATURE' | 'ORGANIZATION_SEAL';
    commonName: string;
    privateKeyLabel: string;
    certificateLabel: string;
  }): LabTokenCertificateMaterial {
    return tokenClient.provisionLabCredential(spec);
  }

  it('initializes ephemeral SoftHSM token without committed PIN material', () => {
    expect(env.rootDir).toContain('hireme-pkcs11-lab-');
    expect(userPin.length).toBeGreaterThan(16);
    expect(userPin).not.toMatch(/1234|password|secret/i);
  });

  it('signs exact prepared PDF through PKCS#11 and passes Phase B with test-only trust anchor', async () => {
    const sourcePdf = await createMinimalLabSourcePdf('person-proof');
    const credential = provisionCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: LAB_PERSON_SIGNER_CN,
      privateKeyLabel: 'hireme-lab-person-proof',
      certificateLabel: 'hireme-lab-person-proof-cert',
    });
    const proof = await new Pkcs11SigningLab(tokenClient).provePreparedPdfSigning({
      sourcePdf,
      credential,
    });
    expect(proof.validation.overallResult).toBe('VALID');
    expect(proof.validation.certificateFingerprintSha256).toBe(
      credential.certificateFingerprintSha256,
    );
    expect(proof.validation.certificateSubjectSummary).toContain('NOT QUALIFIED');
  });

  it('keeps ORGANIZATION_SEAL synthetic credential distinct from person signature', async () => {
    const sourcePdf = await createMinimalLabSourcePdf('seal-proof');
    const person = provisionCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: LAB_PERSON_SIGNER_CN,
      privateKeyLabel: 'hireme-lab-person-distinct',
      certificateLabel: 'hireme-lab-person-distinct-cert',
    });
    const seal = provisionCredential({
      kind: 'ORGANIZATION_SEAL',
      commonName: LAB_ORG_SEAL_CN,
      privateKeyLabel: 'hireme-lab-org-distinct',
      certificateLabel: 'hireme-lab-org-distinct-cert',
    });
    const lab = new Pkcs11SigningLab(tokenClient);
    const personProof = await lab.provePreparedPdfSigning({ sourcePdf, credential: person });
    const sealProof = await lab.provePreparedPdfSigning({ sourcePdf, credential: seal });
    expect(personProof.validation.overallResult).toBe('VALID');
    expect(sealProof.validation.overallResult).toBe('VALID');
    expect(seal.certificateFingerprintSha256).not.toBe(person.certificateFingerprintSha256);
  });

  it('fails validation when signed bytes are tampered', async () => {
    const sourcePdf = await createMinimalLabSourcePdf('tamper');
    const credential = provisionCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: LAB_PERSON_SIGNER_CN,
      privateKeyLabel: 'hireme-lab-tamper-key',
      certificateLabel: 'hireme-lab-tamper-cert',
    });
    const proof = await new Pkcs11SigningLab(tokenClient).provePreparedPdfSigning({
      sourcePdf,
      credential,
    });
    const tampered = Buffer.from(proof.signedPdf);
    const tamperIndex = Math.max(0, tampered.length - 40);
    tampered[tamperIndex] = (tampered[tamperIndex] ?? 0) ^ 0xff;
    const outcome = await new PdfSignatureValidatorService().validateSignedPdf({
      preparedArtifactPdf: proof.preparedPdf,
      signedPdf: tampered,
      expectedCredentialFingerprintSha256: credential.certificateFingerprintSha256,
      trustAnchorPems: [credential.trustAnchorPem],
      trustStoreVersion: 'pkcs11-lab-test-trust-v1',
    });
    expect(outcome.overallResult).not.toBe('VALID');
  });

  it('fails prepared-artifact binding for a different source PDF', async () => {
    const sourcePdf = await createMinimalLabSourcePdf('binding-a');
    const otherSource = await createAlternateLabSourcePdf();
    const credential = provisionCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: LAB_PERSON_SIGNER_CN,
      privateKeyLabel: 'hireme-lab-binding-key',
      certificateLabel: 'hireme-lab-binding-cert',
    });
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

  it('fails closed on wrong PIN without leaking PIN in error text', () => {
    tokenClient.logout();
    let thrown: Pkcs11LabError | undefined;
    try {
      tokenClient.login(`${userPin}-wrong`);
    } catch (error) {
      thrown = error as Pkcs11LabError;
    }
    expect(thrown?.code).toBe('PKCS11_LOGIN_FAILED');
    expect(String(thrown?.message)).not.toContain(userPin);
    tokenClient.login(userPin);
  });

  it('does not accept wrong expected credential fingerprint silently', async () => {
    const sourcePdf = await createMinimalLabSourcePdf('fp-mismatch');
    const credential = provisionCredential({
      kind: 'PERSON_SIGNATURE',
      commonName: LAB_PERSON_SIGNER_CN,
      privateKeyLabel: 'hireme-lab-fp-key',
      certificateLabel: 'hireme-lab-fp-cert',
    });
    const proof = await new Pkcs11SigningLab(tokenClient).provePreparedPdfSigning({
      sourcePdf,
      credential,
    });
    const outcome = await new PdfSignatureValidatorService().validateSignedPdf({
      preparedArtifactPdf: proof.preparedPdf,
      signedPdf: proof.signedPdf,
      expectedCredentialFingerprintSha256: createHash('sha256').update('decoy').digest('hex'),
      trustAnchorPems: [credential.trustAnchorPem],
      trustStoreVersion: 'pkcs11-lab-test-trust-v1',
    });
    expect(outcome.overallResult).not.toBe('VALID');
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
