import { createHash, randomBytes } from 'node:crypto';

import type { SigningKind } from '@hire-me/contracts';

export const SIGNING_POLICY_VERSION = 'signing-policy-v1';
export const SIGNING_METHOD_NEUTRAL = 'PROVIDER_NEUTRAL_V1';
export const SIGNING_REQUEST_TTL_MS = 15 * 60 * 1000;

export function createNonceHash(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex');
}

export function computeSigningBindingHash(input: {
  documentId: string;
  sourceVersionId: string;
  sourceSha256: string;
  sourceSnapshotSha256: string | null;
  kind: SigningKind;
  intendedSignerUserId: string | null;
  signingOrganizationId: string | null;
  credentialFingerprintSha256: string;
  methodIdentifier: string;
  policyVersion: string;
  nonceHash: string;
}): string {
  const payload = {
    credentialFingerprintSha256: input.credentialFingerprintSha256,
    documentId: input.documentId,
    intendedSignerUserId: input.intendedSignerUserId,
    kind: input.kind,
    methodIdentifier: input.methodIdentifier,
    nonceHash: input.nonceHash,
    policyVersion: input.policyVersion,
    signingOrganizationId: input.signingOrganizationId,
    sourceSha256: input.sourceSha256,
    sourceSnapshotSha256: input.sourceSnapshotSha256,
    sourceVersionId: input.sourceVersionId,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
