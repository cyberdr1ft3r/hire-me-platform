import type { Pkcs11LabErrorCode } from './pkcs11-lab.errors.js';

export type LabCredentialKind = 'PERSON_SIGNATURE' | 'ORGANIZATION_SEAL';

export type LabTokenKeyReference = {
  kind: LabCredentialKind;
  privateKeyLabel: string;
  certificateLabel: string;
};

export type LabTokenCertificateMaterial = {
  kind: LabCredentialKind;
  subjectCommonName: string;
  certificateDer: Buffer;
  certificatePem: string;
  trustAnchorPem: string;
  certificateFingerprintSha256: string;
  privateKeyLabel: string;
};

export type Pkcs11TokenClient = {
  login(pin: string): void;
  logout(): void;
  provisionLabCredential(material: {
    kind: LabCredentialKind;
    commonName: string;
    privateKeyLabel: string;
    certificateLabel: string;
  }): LabTokenCertificateMaterial;
  findPrivateKeyByLabel(label: string): unknown;
  signSha256RsaPkcs1(privateKey: unknown, digest: Buffer): Buffer;
  close(): void;
  dispose(): void;
};

export type SimulatedPkcs11Failure = {
  at: 'login' | 'findKey' | 'sign';
  code: Pkcs11LabErrorCode;
};
