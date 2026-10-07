import { extractPdfSignature } from './pdf-signature-extract.js';

export type ValidatedByteRange = {
  byteRanges: number[][];
  signatureCount: number;
};

/** V1: exactly one PDF signature field / one ByteRange tuple pair. */
export function assertV1SingleSignatureStructure(pdf: Buffer): ValidatedByteRange {
  const extracted = extractPdfSignature(pdf);
  const signatureCount = extracted.signatureStr.length;
  if (signatureCount !== 1) {
    throw new Error('PDF_SIGNATURE_COUNT_INVALID');
  }
  const byteRanges = extracted.byteRanges;
  if (byteRanges.length !== 1) {
    throw new Error('PDF_BYTE_RANGE_COUNT_INVALID');
  }
  const range = byteRanges[0];
  if (!range || range.length !== 4) {
    throw new Error('PDF_BYTE_RANGE_MALFORMED');
  }
  const [start1, len1, start2, len2] = range;
  if (
    start1 === undefined ||
    len1 === undefined ||
    start2 === undefined ||
    len2 === undefined ||
    start1 < 0 ||
    len1 < 0 ||
    start2 < 0 ||
    len2 < 0 ||
    !Number.isInteger(start1) ||
    !Number.isInteger(len1) ||
    !Number.isInteger(start2) ||
    !Number.isInteger(len2)
  ) {
    throw new Error('PDF_BYTE_RANGE_MALFORMED');
  }
  const end1 = start1 + len1;
  const end2 = start2 + len2;
  if (end1 > pdf.length || end2 > pdf.length) {
    throw new Error('PDF_BYTE_RANGE_OUT_OF_BOUNDS');
  }
  if (start2 < end1) {
    throw new Error('PDF_BYTE_RANGE_OVERLAP');
  }
  const signedSpan = len1 + len2;
  if (signedSpan <= 0 || signedSpan > pdf.length) {
    throw new Error('PDF_BYTE_RANGE_INCOMPLETE');
  }
  return { byteRanges, signatureCount };
}

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
