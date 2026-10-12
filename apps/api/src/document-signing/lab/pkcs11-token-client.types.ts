import type { Pkcs11LabErrorCode } from './pkcs11-lab.errors.js';

export type LabCredentialKind = 'PERSON_SIGNATURE' | 'ORGANIZATION_SEAL';

/** Labels used to locate a credential on the token; carries no certificate or key material. */
export type LabTokenCredentialReference = {
  kind: LabCredentialKind;
  privateKeyLabel: string;
  certificateLabel: string;
};

export type LabTokenPublicKey = {
  modulusHex: string;
  publicExponentHex: string;
};

export type LabTokenPrivateKeyAttributes = {
  token: boolean;
  private: boolean;
  sensitive: boolean;
  extractable: boolean;
  local: boolean;
  alwaysSensitive: boolean;
  neverExtractable: boolean;
};

/**
 * Credential resolved from token objects: one `CKO_CERTIFICATE` (`CKC_X_509`) found by
 * `CKA_LABEL`, and one `CKO_PRIVATE_KEY` found by `CKA_LABEL` whose `CKA_ID` and RSA public
 * components match the certificate.
 */
export type LabTokenResolvedCredential = LabTokenCredentialReference & {
  objectIdHex: string;
  subjectCommonName: string;
  certificateDer: Buffer;
  certificatePem: string;
  trustAnchorPem: string;
  certificateFingerprintSha256: string;
  tokenPublicKey: LabTokenPublicKey;
  publicKeyObjectMatched: boolean;
  certificateObjectOnToken: boolean;
  /** Read back from the token object (CKA_TOKEN, CKA_PRIVATE, CKA_SENSITIVE, ...). */
  privateKeyAttributes: LabTokenPrivateKeyAttributes;
  /** Opaque token-side handle; never private key material. */
  privateKeyHandle: unknown;
};

export type Pkcs11TokenClient = {
  login(pin: string): void;
  logout(): void;
  /** Generates the key pair on-token, signs a synthetic certificate, and stores it on-token. */
  provisionLabCredential(
    spec: LabTokenCredentialReference & { commonName: string },
  ): LabTokenCredentialReference;
  storeLabCertificate(input: {
    certificateDer: Buffer;
    certificateLabel: string;
    objectIdHex: string;
  }): void;
  resolveLabCredential(reference: LabTokenCredentialReference): LabTokenResolvedCredential;
  signSha256RsaPkcs1(credential: LabTokenResolvedCredential, digest: Buffer): Buffer;
  close(): void;
  dispose(): void;
};

export type SimulatedPkcs11Failure = {
  at: 'login' | 'resolve' | 'sign';
  code: Pkcs11LabErrorCode;
};
