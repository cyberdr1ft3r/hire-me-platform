import { createHash } from 'node:crypto';

import forge from 'node-forge';
import {
  BasicConstraintsExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  X509Certificate as PeculiarX509Certificate,
} from '@peculiar/x509';
import { Certificate, CertificateChainValidationEngine, ChainValidationCode } from 'pkijs';

import { ensurePkijsCryptoEngine } from './signing-pkijs-crypto.js';

export const SIGNING_VALIDATION_POLICY_VERSION = 'hireme-signing-trust-v3';

export type TrustEvaluation = {
  result: 'TRUSTED' | 'UNTRUSTED' | 'INDETERMINATE';
  trustStoreVersion: string;
  reasonCode?: string;
};

export function certificateFingerprintSha256FromDer(certDer: Buffer): string {
  return createHash('sha256').update(certDer).digest('hex');
}

function pemToDer(pem: string): ArrayBuffer {
  const cert = forge.pki.certificateFromPem(pem);
  const bytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const buffer = Buffer.from(bytes, 'binary');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function certificateFromDer(der: Buffer): Certificate | null {
  try {
    ensurePkijsCryptoEngine();
    const ab = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength);
    return Certificate.fromBER(ab);
  } catch {
    return null;
  }
}

function certificateFromPem(pem: string): Certificate | null {
  try {
    return certificateFromDer(Buffer.from(pemToDer(pem)));
  } catch {
    return null;
  }
}

function certificateIdentity(cert: Certificate): string {
  const der = Buffer.from(cert.toSchema().toBER(false));
  return certificateFingerprintSha256FromDer(der);
}

function dedupeCertificates(certs: Certificate[]): Certificate[] {
  const seen = new Set<string>();
  const out: Certificate[] = [];
  for (const cert of certs) {
    const id = certificateIdentity(cert);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(cert);
  }
  return out;
}

function peculiarFromPkijs(cert: Certificate): PeculiarX509Certificate {
  return new PeculiarX509Certificate(new Uint8Array(cert.toSchema().toBER(false)));
}

function distinguishedNameKey(dn: string): string {
  return dn.replace(/\s+/g, '').toLowerCase();
}

function buildPathFromPool(
  leaf: Certificate,
  trustedCerts: Certificate[],
  pool: Certificate[],
): Certificate[] {
  const trustedIds = new Set(trustedCerts.map((cert) => certificateIdentity(cert)));
  const path: Certificate[] = [leaf];
  let current = leaf;
  for (let depth = 0; depth < pool.length + 1; depth += 1) {
    const issuerKey = distinguishedNameKey(peculiarFromPkijs(current).issuer);
    const next = pool.find((candidate) => {
      const id = certificateIdentity(candidate);
      if (path.some((existing) => certificateIdentity(existing) === id)) {
        return false;
      }
      return distinguishedNameKey(peculiarFromPkijs(candidate).subject) === issuerKey;
    });
    if (!next) {
      break;
    }
    path.push(next);
    if (trustedIds.has(certificateIdentity(next))) {
      break;
    }
    current = next;
  }
  return path;
}

function normalizePathLeafFirst(path: Certificate[], signerCert: Certificate): Certificate[] {
  if (path.length === 0) {
    return path;
  }
  const signerId = certificateIdentity(signerCert);
  const firstId = certificateIdentity(path[0]!);
  const lastId = certificateIdentity(path[path.length - 1]!);
  if (firstId === signerId) {
    return path;
  }
  if (lastId === signerId) {
    return [...path].reverse();
  }
  return path;
}

function pathTerminatesAtTrustedAnchor(
  certificatePath: Certificate[],
  trustedCerts: Certificate[],
): boolean {
  if (certificatePath.length < 2) {
    return false;
  }
  const trustedIds = new Set(trustedCerts.map((cert) => certificateIdentity(cert)));
  return trustedIds.has(certificateIdentity(certificatePath[certificatePath.length - 1]!));
}

function resolveValidatedPath(
  signerCert: Certificate,
  trustedCerts: Certificate[],
  pool: Certificate[],
  enginePath: Certificate[],
): Certificate[] {
  const fromEngine = normalizePathLeafFirst(enginePath, signerCert);
  if (
    fromEngine.length >= 2 &&
    certificateIdentity(fromEngine[0]!) === certificateIdentity(signerCert) &&
    pathTerminatesAtTrustedAnchor(fromEngine, trustedCerts)
  ) {
    const leaf = peculiarFromPkijs(signerCert);
    const leafIssuerKey = distinguishedNameKey(leaf.issuer);
    const directToRoot =
      distinguishedNameKey(peculiarFromPkijs(fromEngine[fromEngine.length - 1]!).subject) ===
      leafIssuerKey;
    if (directToRoot || fromEngine.length >= 3) {
      return fromEngine;
    }
  }
  return buildPathFromPool(signerCert, trustedCerts, pool);
}

/** Hire Me path policy on top of PKI.js path validation (basicConstraints, keyCertSign, pathLen). */
function validatePathExtensionPolicy(certificatePath: Certificate[]): string | null {
  if (certificatePath.length < 2) {
    return 'CHAIN_PATH_INCOMPLETE';
  }
  const chain = certificatePath.map(peculiarFromPkijs);
  for (let i = 1; i < chain.length - 1; i += 1) {
    const intermediate = chain[i]!;
    const basic = intermediate.getExtension(BasicConstraintsExtension);
    if (!basic?.ca) {
      return 'NON_CA_INTERMEDIATE';
    }
  }

  for (let i = 0; i < chain.length - 1; i += 1) {
    const issuer = chain[i + 1]!;
    const keyUsage = issuer.getExtension(KeyUsagesExtension);
    if (keyUsage && (keyUsage.usages & KeyUsageFlags.keyCertSign) === 0) {
      return 'ISSUER_KEY_CERT_SIGN_MISSING';
    }
  }

  const root = chain[chain.length - 1]!;
  const rootBasic = root.getExtension(BasicConstraintsExtension);
  const intermediateCount = chain.length - 2;
  if (rootBasic?.pathLength !== undefined && intermediateCount > rootBasic.pathLength) {
    return 'PATH_LEN_CONSTRAINT_VIOLATION';
  }
  for (let i = 1; i < chain.length - 1; i += 1) {
    const basic = chain[i]!.getExtension(BasicConstraintsExtension);
    if (basic?.pathLength === undefined) {
      continue;
    }
    const intermediatesBelow = chain.length - 2 - i;
    if (intermediatesBelow > basic.pathLength) {
      return 'PATH_LEN_CONSTRAINT_VIOLATION';
    }
  }
  return null;
}

function mapChainFailure(
  verifyResult: Awaited<ReturnType<CertificateChainValidationEngine['verify']>>,
  trustStoreVersion: string,
): TrustEvaluation {
  const chainError = verifyResult.error;
  if (chainError && 'code' in chainError) {
    const code = (chainError as { code: ChainValidationCode }).code;
    if (code === ChainValidationCode.noPath || code === ChainValidationCode.noValidPath) {
      return {
        result: 'UNTRUSTED',
        trustStoreVersion,
        reasonCode: 'CERTIFICATE_CHAIN_UNTRUSTED',
      };
    }
  }
  const message = verifyResult.resultMessage?.toLowerCase() ?? '';
  if (message.includes('date') || message.includes('expired') || message.includes('valid')) {
    return {
      result: 'UNTRUSTED',
      trustStoreVersion,
      reasonCode: 'CERTIFICATE_NOT_VALID_AT_REFERENCE_TIME',
    };
  }
  return {
    result: 'UNTRUSTED',
    trustStoreVersion,
    reasonCode: 'CERTIFICATE_CHAIN_VALIDATION_FAILED',
  };
}

/**
 * PKIX path validation via PKI.js `CertificateChainValidationEngine`.
 * Trust anchors: explicit `SIGNING_TRUST_ANCHOR_PEMS` only (never OS roots).
 * CMS bag certificates are untrusted path candidates only; SignerInfo leaf is the end entity.
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

  ensurePkijsCryptoEngine();

  const trustedCerts: Certificate[] = [];
  for (const pem of input.trustAnchorPems) {
    const anchor = certificateFromPem(pem);
    if (anchor) {
      trustedCerts.push(anchor);
    }
  }
  if (trustedCerts.length === 0) {
    return {
      result: 'INDETERMINATE',
      trustStoreVersion: input.trustStoreVersion,
      reasonCode: 'TRUST_STORE_MALFORMED',
    };
  }

  const signerCert = certificateFromDer(input.signerCertDer);
  if (!signerCert) {
    return {
      result: 'UNTRUSTED',
      trustStoreVersion: input.trustStoreVersion,
      reasonCode: 'SIGNER_CERTIFICATE_MALFORMED',
    };
  }

  const anchorFingerprints = new Set(
    trustedCerts.map((cert) =>
      certificateFingerprintSha256FromDer(Buffer.from(cert.toSchema().toBER(false))),
    ),
  );
  const signerFp = certificateFingerprintSha256FromDer(input.signerCertDer);

  const pool: Certificate[] = [signerCert];
  for (const der of input.untrustedCertDerCandidates) {
    const candidate = certificateFromDer(der);
    if (candidate) {
      pool.push(candidate);
    }
  }
  pool.push(...trustedCerts);

  const certs = dedupeCertificates(pool);

  if (anchorFingerprints.has(signerFp)) {
    const anchorX509 = peculiarFromPkijs(signerCert);
    if (anchorX509.notBefore <= input.referenceTime && anchorX509.notAfter >= input.referenceTime) {
      return { result: 'TRUSTED', trustStoreVersion: input.trustStoreVersion };
    }
    return {
      result: 'UNTRUSTED',
      trustStoreVersion: input.trustStoreVersion,
      reasonCode: 'CERTIFICATE_NOT_VALID_AT_REFERENCE_TIME',
    };
  }

  const engine = new CertificateChainValidationEngine({
    trustedCerts,
    certs,
    crls: [],
    ocsps: [],
    checkDate: input.referenceTime,
  });

  const verifyResult = await engine.verify({ passedWhenNotRevValues: true });
  if (!verifyResult.result) {
    return mapChainFailure(verifyResult, input.trustStoreVersion);
  }

  const path = resolveValidatedPath(
    signerCert,
    trustedCerts,
    certs,
    verifyResult.certificatePath ?? [],
  );
  if (
    path.length < 2 ||
    certificateIdentity(path[0]!) !== certificateIdentity(signerCert) ||
    !pathTerminatesAtTrustedAnchor(path, trustedCerts)
  ) {
    return {
      result: 'UNTRUSTED',
      trustStoreVersion: input.trustStoreVersion,
      reasonCode: 'CHAIN_PATH_INCOMPLETE',
    };
  }
  const policyFailure = validatePathExtensionPolicy(path);
  if (policyFailure) {
    return {
      result: 'UNTRUSTED',
      trustStoreVersion: input.trustStoreVersion,
      reasonCode: policyFailure,
    };
  }

  return { result: 'TRUSTED', trustStoreVersion: input.trustStoreVersion };
}
