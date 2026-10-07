import * as asn1js from 'asn1js';
import { Certificate, ContentInfo, SignedData } from 'pkijs';

import { extractPdfSignature } from '../../src/document-signing/validation/pdf-signature-extract.js';

function cmsDerFromSignedPdf(signedPdf: Buffer): Buffer {
  const extracted = extractPdfSignature(signedPdf);
  return Buffer.from(extracted.signatureStr[0] ?? '', 'latin1');
}

function replaceCmsHexInSignedPdf(signedPdf: Buffer, newCmsDer: Buffer): Buffer {
  const extracted = extractPdfSignature(signedPdf);
  const range = extracted.byteRanges[0];
  if (!range) {
    throw new Error('ByteRange missing');
  }
  const start1 = range[0];
  const len1 = range[1];
  const hexEndIdx = range[2];
  if (start1 === undefined || len1 === undefined || hexEndIdx === undefined) {
    throw new Error('ByteRange incomplete');
  }
  const hexStartIdx = start1 + len1 + 1;
  const slotLength = hexEndIdx - hexStartIdx;
  const newHex = newCmsDer.toString('hex').toUpperCase();
  if (newHex.length > slotLength) {
    throw new Error('CMS DER does not fit signature placeholder slot');
  }
  const paddedHex = newHex.padEnd(slotLength, '0');
  const out = Buffer.from(signedPdf);
  out.write(paddedHex, hexStartIdx, 'latin1');
  return out;
}

function reencodeSignedData(signedData: SignedData): Buffer {
  const contentInfo = new ContentInfo({
    contentType: '1.2.840.113549.1.7.2',
    content: signedData.toSchema(),
  });
  return Buffer.from(contentInfo.toSchema().toBER(false));
}

/** Reorder or prepend certificates in detached CMS without changing SignerInfo. */
export function rewriteSignedPdfCmsCertificateBag(
  signedPdf: Buffer,
  mutate: (certDers: Buffer[]) => Buffer[],
): Buffer {
  const cmsDer = cmsDerFromSignedPdf(signedPdf);
  const p7Asn1 = asn1js.fromBER(cmsDer);
  const contentInfo = new ContentInfo({ schema: p7Asn1.result });
  const signedData = new SignedData({ schema: contentInfo.content });
  const bagDer = (signedData.certificates ?? [])
    .filter((cert): cert is Certificate => cert instanceof Certificate)
    .map((cert) => Buffer.from(cert.toSchema().toBER(false)));
  const nextBagDer = mutate(bagDer);
  signedData.certificates = nextBagDer.map(
    (der) => new Certificate({ schema: asn1js.fromBER(der).result }),
  );
  return replaceCmsHexInSignedPdf(signedPdf, reencodeSignedData(signedData));
}
