import { createHash } from 'node:crypto';

import { X509Certificate } from '@peculiar/x509';

export const SIGNING_VALIDATION_POLICY_VERSION = 'hireme-signing-trust-v2';

export type TrustEvaluation = {
  result: 'TRUSTED' | 'UNTRUSTED' | 'INDETERMINATE';
  trustStoreVersion: string;
  reasonCode?: string;
};

export function certificateFingerprintSha256FromDer(certDer: Buffer): string {
  return createHash('sha256').update(certDer).digest('hex');
}

function isCertValidAt(cert: X509Certificate, referenceTime: Date): boolean {
  return cert.notBefore <= referenceTime && cert.notAfter >= referenceTime;
}

function anchorFingerprints(trustAnchorPems: string[]): Set<string> {
  const set = new Set<string>();
  for (const pem of trustAnchorPems) {
    const der = Buffer.from(new X509Certificate(pem).rawData);
    set.add(certificateFingerprintSha256FromDer(der));
  }
  return set;
}

async function verifySignedBy(child: X509Certificate, issuer: X509Certificate): Promise<boolean> {
  try {
    return await child.verify({ publicKey: issuer.publicKey });
  } catch {
    return false;
  }
}

/**
 * Path validation: leaf must chain to an explicitly configured trust anchor.
 * CMS certificate bag entries are untrusted path-building candidates only.
 */
export async function evaluateCertificateTrust(input: {
  signerCertDer: Buffer;
  untrustedCertDerCandidates: Buffer[];
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

  const anchors = anchorFingerprints(input.trustAnchorPems);
  const pool = new Map<string, X509Certificate>();
  for (const pem of input.trustAnchorPems) {
    try {
      const cert = new X509Certificate(pem);
      pool.set(certificateFingerprintSha256FromDer(Buffer.from(cert.rawData)), cert);
    } catch {
      // skip malformed anchor entries
    }
  }
  for (const der of [input.signerCertDer, ...input.untrustedCertDerCandidates]) {
    try {
      const cert = new X509Certificate(der);
      pool.set(certificateFingerprintSha256FromDer(der), cert);
    } catch {
      // skip malformed bag entries
    }
  }

  const signer = new X509Certificate(input.signerCertDer);
  if (!isCertValidAt(signer, input.referenceTime)) {
    return {
      result: 'UNTRUSTED',
      trustStoreVersion: input.trustStoreVersion,
      reasonCode: 'CERTIFICATE_NOT_VALID_AT_REFERENCE_TIME',
    };
  }

  const signerFp = certificateFingerprintSha256FromDer(input.signerCertDer);
  if (anchors.has(signerFp)) {
    return { result: 'TRUSTED', trustStoreVersion: input.trustStoreVersion };
  }

  const visited = new Set<string>([signerFp]);
  let current = signer;

  for (let depth = 0; depth < pool.size + 1; depth += 1) {
    let advanced = false;
    for (const candidate of pool.values()) {
      const candidateFp = certificateFingerprintSha256FromDer(Buffer.from(candidate.rawData));
      if (visited.has(candidateFp)) {
        continue;
      }
      if (candidate.subject !== current.issuer) {
        continue;
      }
      if (!(await verifySignedBy(current, candidate))) {
        continue;
      }
      if (!isCertValidAt(candidate, input.referenceTime)) {
        return {
          result: 'UNTRUSTED',
          trustStoreVersion: input.trustStoreVersion,
          reasonCode: 'CHAIN_CERTIFICATE_NOT_VALID_AT_REFERENCE_TIME',
        };
      }
      if (anchors.has(candidateFp)) {
        return { result: 'TRUSTED', trustStoreVersion: input.trustStoreVersion };
      }
      visited.add(candidateFp);
      current = candidate;
      advanced = true;
      break;
    }
    if (!advanced) {
      break;
    }
  }

  return {
    result: 'UNTRUSTED',
    trustStoreVersion: input.trustStoreVersion,
    reasonCode: 'CERTIFICATE_CHAIN_UNTRUSTED',
  };
}
