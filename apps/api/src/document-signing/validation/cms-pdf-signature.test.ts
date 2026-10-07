import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { plainAddPlaceholder } from '@signpdf/placeholder-plain';

import {
  createSyntheticSigningP12,
  signPreparedPdfWithP12,
} from '../../../test/support/signing-synthetic-pdf.js';
import { rewriteSignedPdfCmsCertificateBag } from '../../../test/support/signing-cms-bag-fixture.js';
import { verifyPdfCmsSignature } from './cms-pdf-signature.js';

async function minimalPreparedPdf(): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: 'A4' });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.text('cms-bag-test');
  doc.end();
  await new Promise<void>((resolve) => doc.on('end', resolve));
  return plainAddPlaceholder({
    pdfBuffer: Buffer.concat(chunks),
    reason: 'test',
    contactInfo: 't',
    name: 't',
    location: 't',
  });
}

describe('verifyPdfCmsSignature signer identity vs certificate bag order', () => {
  it('resolves SignerInfo signer when an unrelated extra certificate precedes it in the bag', async () => {
    const signer = createSyntheticSigningP12('Primary Signer');
    const decoy = createSyntheticSigningP12('Decoy Cert');
    const prepared = await minimalPreparedPdf();
    const signed = await signPreparedPdfWithP12(prepared, signer.p12, signer.passphrase);
    const decoyDer = Buffer.from(
      (await import('node-forge')).default.asn1
        .toDer(
          (await import('node-forge')).default.pki.certificateToAsn1(
            (await import('node-forge')).default.pki.certificateFromPem(decoy.trustAnchorPem),
          ),
        )
        .getBytes(),
      'binary',
    );
    const withExtra = rewriteSignedPdfCmsCertificateBag(signed, (bag) => [decoyDer, ...bag]);
    const result = verifyPdfCmsSignature(withExtra);
    expect(result.cmsCryptoValid).toBe(true);
    expect(result.certificateFingerprintSha256).toBe(signer.certificateFingerprintSha256);
    expect(result.certificateFingerprintSha256).not.toBe(decoy.certificateFingerprintSha256);
  });

  it('resolves the same signer when certificate bag order is reversed', async () => {
    const signer = createSyntheticSigningP12('Order Signer');
    const chain = createSyntheticSigningP12('Bag Extra');
    const prepared = await minimalPreparedPdf();
    let signed = await signPreparedPdfWithP12(prepared, signer.p12, signer.passphrase);
    const extraDer = Buffer.from(
      (await import('node-forge')).default.asn1
        .toDer(
          (await import('node-forge')).default.pki.certificateToAsn1(
            (await import('node-forge')).default.pki.certificateFromPem(chain.trustAnchorPem),
          ),
        )
        .getBytes(),
      'binary',
    );
    signed = rewriteSignedPdfCmsCertificateBag(signed, (bag) => [...bag, extraDer]);
    const original = verifyPdfCmsSignature(signed);
    const reordered = verifyPdfCmsSignature(
      rewriteSignedPdfCmsCertificateBag(signed, (bag) => [...bag].reverse()),
    );
    expect(reordered.certificateFingerprintSha256).toBe(original.certificateFingerprintSha256);
    expect(reordered.subjectSummary).toBe(original.subjectSummary);
    expect(reordered.issuerSummary).toBe(original.issuerSummary);
    expect(reordered.cmsCryptoValid).toBe(true);
  });

  it('does not treat a decoy bag certificate as the signer when its fingerprint matches another credential', async () => {
    const signer = createSyntheticSigningP12('True Signer');
    const decoy = createSyntheticSigningP12('Decoy Registered');
    const prepared = await minimalPreparedPdf();
    const signed = await signPreparedPdfWithP12(prepared, signer.p12, signer.passphrase);
    const decoyDer = Buffer.from(
      (await import('node-forge')).default.asn1
        .toDer(
          (await import('node-forge')).default.pki.certificateToAsn1(
            (await import('node-forge')).default.pki.certificateFromPem(decoy.trustAnchorPem),
          ),
        )
        .getBytes(),
      'binary',
    );
    const bagFirstDecoy = rewriteSignedPdfCmsCertificateBag(signed, (bag) => [decoyDer, ...bag]);
    const cms = verifyPdfCmsSignature(bagFirstDecoy);
    expect(cms.certificateFingerprintSha256).toBe(signer.certificateFingerprintSha256);
    expect(cms.certificateFingerprintSha256).not.toBe(decoy.certificateFingerprintSha256);
    expect(createHash('sha256').update(decoyDer).digest('hex')).toBe(
      decoy.certificateFingerprintSha256,
    );
  });
});
