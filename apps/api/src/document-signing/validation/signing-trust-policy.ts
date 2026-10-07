import { createHash } from 'node:crypto';

import { X509Certificate, X509ChainBuilder } from '@peculiar/x509';

export const SIGNING_VALIDATION_POLICY_VERSION = 'hireme-signing-trust-v1';

export type TrustEvaluation = {
  result: 'TRUSTED' | 'UNTRUSTED' | 'INDETERMINATE';
  trustStoreVersion: string;
  reasonCode?: string;
};

export function certificateFingerprintSha256FromDer(certDer: Buffer): string {
  return createHash('sha256').update(certDer).digest('hex');
}

/**
 * Provider-neutral trust evaluation against explicit configured anchors only.
 * Does not imply qualified/legal Moroccan signature status.
 */
export async function evaluateCertificateTrust(input: {
  signerCertDer: Buffer;
  trustAnchorPems: string[];
  trustStoreVersion: string;
  referenceTime: Date;
}): Promise<TrustEvaluation> {
  if (input.trustAnchorPems.length === 0) {
    return {
      result: 'INDETERMINATE',
      trustStoreVersion: input.trustStoreVersion,
      reasonCode: 'TRUST_STORE_EMPTY',
    };
  }
  try {
    const signer = new X509Certificate(input.signerCertDer);
    if (signer.notBefore > input.referenceTime || signer.notAfter < input.referenceTime) {
      return {
        result: 'UNTRUSTED',
        trustStoreVersion: input.trustStoreVersion,
        reasonCode: 'CERTIFICATE_NOT_VALID_AT_REFERENCE_TIME',
      };
    }
    const signerFingerprint = certificateFingerprintSha256FromDer(input.signerCertDer);
    for (const pem of input.trustAnchorPems) {
      const anchorDer = Buffer.from(new X509Certificate(pem).rawData);
      if (certificateFingerprintSha256FromDer(anchorDer) === signerFingerprint) {
        return { result: 'TRUSTED', trustStoreVersion: input.trustStoreVersion };
      }
    }
    const anchors = input.trustAnchorPems.map((pem) => new X509Certificate(pem));
    const builder = new X509ChainBuilder({ certificates: anchors });
    const chain = await builder.build(signer);
    if (chain.length === 0) {
      return {
        result: 'UNTRUSTED',
        trustStoreVersion: input.trustStoreVersion,
        reasonCode: 'CERTIFICATE_CHAIN_UNTRUSTED',
      };
    }
    return { result: 'TRUSTED', trustStoreVersion: input.trustStoreVersion };
  } catch {
    return {
      result: 'INDETERMINATE',
      trustStoreVersion: input.trustStoreVersion,
      reasonCode: 'CERTIFICATE_CHAIN_INDETERMINATE',
    };
  }
}
