import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const extractSignature = require('pdf-signature-reader/helpers/extractSignature') as (
  pdf: Buffer,
) => {
  byteRanges: number[][];
  signatureStr: string[];
  signedData: Buffer[];
};

export type PdfSignatureExtraction = ReturnType<typeof extractSignature>;

export function extractPdfSignature(pdf: Buffer): PdfSignatureExtraction {
  return extractSignature(pdf);
}

/** Rejects unsigned trailing bytes/revisions after the signed ByteRange envelope. */
export function assertNoTrailingBytesAfterByteRange(pdf: Buffer, byteRanges: number[][]): void {
  const last = byteRanges.at(-1);
  if (!last || last[2] === undefined || last[3] === undefined) {
    throw new Error('PDF_BYTE_RANGE_MISSING');
  }
  const end = last[2] + last[3];
  if (pdf.length > end) {
    throw new Error('PDF_UNSIGNED_TRAILING_BYTES');
  }
}

/**
 * V1 incremental-signature derivation: ByteRange-covered octets must preserve the exact
 * source PDF bytes as an unchanged prefix (placeholder/signing workflow requirement).
 */
export function assertSourcePrefixDerivation(
  sourcePdf: Buffer,
  signedPdf: Buffer,
  byteRanges: number[][],
): void {
  const range = byteRanges[0];
  if (
    !range ||
    range[0] === undefined ||
    range[1] === undefined ||
    range[2] === undefined ||
    range[3] === undefined
  ) {
    throw new Error('PDF_BYTE_RANGE_MISSING');
  }
  const signedData = Buffer.concat([
    signedPdf.subarray(range[0], range[0] + range[1]),
    signedPdf.subarray(range[2], range[2] + range[3]),
  ]);
  if (signedData.length < sourcePdf.length) {
    throw new Error('SOURCE_DERIVATION_TOO_SHORT');
  }
  if (!signedData.subarray(0, sourcePdf.length).equals(sourcePdf)) {
    throw new Error('SOURCE_DERIVATION_PREFIX_MISMATCH');
  }
}
