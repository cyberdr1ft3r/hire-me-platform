import { describe, expect, it } from 'vitest';

import {
  assertNoTrailingBytesAfterByteRange,
  assertV1SingleSignatureStructure,
} from './pdf-byte-range-policy.js';

function pdfWithByteRangeLiteral(literal: string, trailing = ''): Buffer {
  const body = `%PDF-1.4\n1 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [${literal}] /Contents <${'0'.repeat(64)}> >>\nendobj\nstartxref\n9\n%%EOF${trailing}`;
  return Buffer.from(body);
}

describe('pdf-byte-range-policy (V1)', () => {
  it('accepts a valid single ByteRange', () => {
    const pdf = pdfWithByteRangeLiteral('0 10 100 20');
    expect(() => assertV1SingleSignatureStructure(pdf)).not.toThrow();
  });

  it('rejects multiple signature fields', () => {
    const pdf = Buffer.from(
      '%PDF\n/ByteRange [0 1 2 3]\n/ByteRange [0 1 2 3]\n/Contents <00>\n%%EOF',
    );
    expect(() => assertV1SingleSignatureStructure(pdf)).toThrow('PDF_SIGNATURE_COUNT_INVALID');
  });

  it('rejects fewer than four ByteRange numbers', () => {
    const pdf = pdfWithByteRangeLiteral('0 10 100');
    expect(() => assertV1SingleSignatureStructure(pdf)).toThrow();
  });

  it('rejects negative ByteRange values', () => {
    const pdf = pdfWithByteRangeLiteral('0 -1 10 5');
    expect(() => assertV1SingleSignatureStructure(pdf)).toThrow();
  });

  it('rejects when first range does not start at 0', () => {
    const pdf = pdfWithByteRangeLiteral('5 10 100 20');
    expect(() => assertV1SingleSignatureStructure(pdf)).toThrow('PDF_BYTE_RANGE_MALFORMED');
  });

  it('rejects overlapping ranges', () => {
    const pdf = pdfWithByteRangeLiteral('0 50 40 20');
    expect(() => assertV1SingleSignatureStructure(pdf)).toThrow('PDF_BYTE_RANGE_OVERLAP');
  });

  it('rejects out-of-bounds offsets', () => {
    const pdf = pdfWithByteRangeLiteral('0 10 99999 20');
    expect(() => assertV1SingleSignatureStructure(pdf)).toThrow('PDF_BYTE_RANGE_OUT_OF_BOUNDS');
  });

  it('rejects unsigned trailing bytes', () => {
    const pdf = pdfWithByteRangeLiteral('0 10 100 20', 'EXTRA');
    const { byteRanges } = assertV1SingleSignatureStructure(pdf);
    expect(() => assertNoTrailingBytesAfterByteRange(pdf, byteRanges)).toThrow(
      'PDF_UNSIGNED_TRAILING_BYTES',
    );
  });

  it('rejects non-numeric ByteRange tokens', () => {
    const pdf = pdfWithByteRangeLiteral('0 abc 100 20');
    expect(() => assertV1SingleSignatureStructure(pdf)).toThrow();
  });

  it('rejects when second range starts before first range ends', () => {
    const pdf = pdfWithByteRangeLiteral('0 50 30 20');
    expect(() => assertV1SingleSignatureStructure(pdf)).toThrow('PDF_BYTE_RANGE_OVERLAP');
  });

  it('rejects length extending beyond file bounds', () => {
    const pdf = pdfWithByteRangeLiteral('0 10 100 99999');
    expect(() => assertV1SingleSignatureStructure(pdf)).toThrow('PDF_BYTE_RANGE_OUT_OF_BOUNDS');
  });
});
