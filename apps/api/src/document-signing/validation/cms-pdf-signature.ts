import { createHash } from 'node:crypto';

import * as asn1js from 'asn1js';
import forge from 'node-forge';
import { Certificate, ContentInfo, IssuerAndSerialNumber, SignedData } from 'pkijs';

import { extractPdfSignature } from './pdf-signature-extract.js';
import {
  assertNoTrailingBytesAfterByteRange,
  assertV1SingleSignatureStructure,
} from './pdf-byte-range-policy.js';

export type CmsVerificationResult = {
  signerCertDer: Buffer;
  certificateBagDer: Buffer[];
  cmsCryptoValid: boolean;
  subjectSummary: string;
  issuerSummary: string;
  certificateFingerprintSha256: string;
};

function certificateFingerprintSha256FromDer(certDer: Buffer): string {
  return createHash('sha256').update(certDer).digest('hex');
}

function formatForgeName(attrs: forge.pki.CertificateField[]): string {
  const record: Record<string, string> = {};
  for (const attr of attrs) {
    if (attr.shortName) {
      record[attr.shortName] = String(attr.value);
    }
  }
  return JSON.stringify(record).slice(0, 500);
}

function certDerFromPkijsCertificate(cert: Certificate): Buffer {
  return Buffer.from(cert.toSchema().toBER(false));
}

function resolveSignerCertificateDer(signedData: SignedData, bagDer: Buffer[]): Buffer {
  const signerInfo = signedData.signerInfos[0];
  if (!signerInfo) {
    throw new Error('CMS_SIGNER_INFO_MISSING');
  }
  const sid = signerInfo.sid as IssuerAndSerialNumber | { subjectsKeyIdentifier?: ArrayBuffer };
  for (const candidateDer of bagDer) {
    const asn1 = asn1js.fromBER(candidateDer);
    const cert = new Certificate({ schema: asn1.result });
    if (sid instanceof IssuerAndSerialNumber) {
      if (cert.issuer.isEqual(sid.issuer) && cert.serialNumber.isEqual(sid.serialNumber)) {
        return candidateDer;
      }
      continue;
    }
    const skiExtension = cert.extensions?.find((extension) => extension.extnID === '2.5.29.14');
    const skiValue = (skiExtension?.parsedValue as { valueBlock?: { valueHex?: ArrayBuffer } })
      ?.valueBlock?.valueHex;
    const signerSki = 'subjectsKeyIdentifier' in sid ? sid.subjectsKeyIdentifier : undefined;
    if (skiValue && signerSki) {
      if (Buffer.from(skiValue).equals(Buffer.from(signerSki))) {
        return candidateDer;
      }
    }
  }
  throw new Error('CMS_SIGNER_CERTIFICATE_NOT_FOUND');
}

/**
 * PDF detached CMS integrity: messageDigest over ByteRange-covered data and
 * authenticatedAttributes signature (same algorithm as pdf-signature-reader verify(),
 * but signer public key comes from pkijs SignerInfo resolution, not cert-bag order).
 */
function verifyDetachedPdfCmsIntegrity(
  cmsDer: Buffer,
  byteRangeSignedData: Buffer,
  signerCertDer: Buffer,
): boolean {
  try {
    const message = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(cmsDer.toString('binary'), {
        parseAllBytes: false,
      } as unknown as Parameters<typeof forge.asn1.fromDer>[1]),
    );
    const signerCert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(signerCertDer.toString('binary')),
    );
    const rawCapture = message.rawCapture as {
      signature: string;
      authenticatedAttributes: forge.asn1.Asn1[];
      digestAlgorithm: string;
    };
    if (!rawCapture?.authenticatedAttributes?.length) {
      return false;
    }
    const hashAlgorithmOid = forge.asn1.derToOid(rawCapture.digestAlgorithm);
    const hashAlgorithm = String(forge.pki.oids[hashAlgorithmOid] ?? '').toLowerCase();
    const mdFactory = (forge.md as unknown as Record<string, { create(): forge.md.MessageDigest }>)[
      hashAlgorithm
    ];
    if (!hashAlgorithm || !mdFactory) {
      return false;
    }
    const attrSet = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      rawCapture.authenticatedAttributes,
    );
    const attrsDigest = mdFactory
      .create()
      .update(forge.asn1.toDer(attrSet).getBytes())
      .digest()
      .getBytes();
    const publicKey = signerCert.publicKey as forge.pki.rsa.PublicKey;
    if (!publicKey.verify(attrsDigest, rawCapture.signature)) {
      return false;
    }
    const messageDigestOid = forge.pki.oids.messageDigest;
    const fullAttrDigest = rawCapture.authenticatedAttributes.find((attr) => {
      const first = attr.value[0] as forge.asn1.Asn1;
      return forge.asn1.derToOid(first.value as string) === messageDigestOid;
    });
    if (!fullAttrDigest) {
      return false;
    }
    const digestAttr = fullAttrDigest.value[1] as forge.asn1.Asn1;
    const attrDigest = (digestAttr.value[0] as forge.asn1.Asn1).value as string;
    const dataDigest = mdFactory
      .create()
      .update(byteRangeSignedData.toString('latin1'))
      .digest()
      .getBytes();
    return dataDigest === attrDigest;
  } catch {
    return false;
  }
}

/**
 * Signer identity from pkijs SignerInfo; CMS integrity via detached PDF ByteRange policy.
 * PDF ByteRange extraction: pdf-signature-reader helper.
 */
export function verifyPdfCmsSignature(signedPdf: Buffer): CmsVerificationResult {
  const { byteRanges } = assertV1SingleSignatureStructure(signedPdf);
  assertNoTrailingBytesAfterByteRange(signedPdf, byteRanges);
  const extracted = extractPdfSignature(signedPdf);
  const cmsDer = Buffer.from(extracted.signatureStr[0] ?? '', 'latin1');
  if (cmsDer.length === 0) {
    throw new Error('CMS_SIGNATURE_MISSING');
  }
  const byteRangeSignedData = extracted.signedData[0];
  if (!byteRangeSignedData) {
    throw new Error('CMS_SIGNED_DATA_MISSING');
  }

  const p7Asn1 = asn1js.fromBER(cmsDer);
  const contentInfo = new ContentInfo({ schema: p7Asn1.result });
  const signedData = new SignedData({ schema: contentInfo.content });
  if (signedData.signerInfos.length !== 1) {
    throw new Error('CMS_SIGNER_COUNT_INVALID');
  }

  const bagDer: Buffer[] = [];
  for (const cert of signedData.certificates ?? []) {
    if (cert instanceof Certificate) {
      bagDer.push(certDerFromPkijsCertificate(cert));
    }
  }

  const signerCertDer = resolveSignerCertificateDer(signedData, bagDer);
  const cmsCryptoValid = verifyDetachedPdfCmsIntegrity(cmsDer, byteRangeSignedData, signerCertDer);
  const forgeCert = forge.pki.certificateFromAsn1(
    forge.asn1.fromDer(signerCertDer.toString('binary')),
  );

  return {
    signerCertDer,
    certificateBagDer: bagDer,
    cmsCryptoValid,
    subjectSummary: formatForgeName(forgeCert.subject.attributes),
    issuerSummary: formatForgeName(forgeCert.issuer.attributes),
    certificateFingerprintSha256: certificateFingerprintSha256FromDer(signerCertDer),
  };
}
