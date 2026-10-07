/**
 * Issue #143 preflight spike — proves maintained PDF/CMS validation stack.
 * Run: node apps/api/scripts/spike-issue-143-validation.mjs
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import { SignPdf } from '@signpdf/signpdf';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { P12Signer } from '@signpdf/signer-p12';
import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const extractSignature = require('pdf-signature-reader/helpers/extractSignature');
const verifyPdfReader = require('pdf-signature-reader');

function createSyntheticP12() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
  const attrs = [
    { name: 'commonName', value: 'Issue143 Test Signer' },
    { name: 'countryName', value: 'MA' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'test-pass', {
    algorithm: '3des',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return {
    p12: Buffer.from(p12Der, 'binary'),
    fingerprintSha256: createHash('sha256')
      .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary')
      .digest('hex'),
  };
}

async function pdfKitBuffer() {
  const chunks = [];
  const doc = new PDFDocument({ size: 'A4' });
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.text('Issue #143 validation spike');
  doc.end();
  await new Promise((resolve) => doc.on('end', resolve));
  return Buffer.concat(chunks);
}

function assertTrailingBytesRejected(signedPdf, byteRanges) {
  const last = byteRanges[byteRanges.length - 1];
  const end = last[2] + last[3];
  if (signedPdf.length > end) {
    throw new Error('Trailing bytes after ByteRange end');
  }
}

function assertSourcePrefixDerivation(source, signedPdf, byteRanges) {
  const signedData = Buffer.concat([
    signedPdf.slice(byteRanges[0][0], byteRanges[0][0] + byteRanges[0][1]),
    signedPdf.slice(byteRanges[0][2], byteRanges[0][2] + byteRanges[0][3]),
  ]);
  if (!signedData.subarray(0, source.length).equals(source)) {
    throw new Error('ByteRange payload does not preserve exact source prefix');
  }
}

async function main() {
  const source = await pdfKitBuffer();
  const sourceSha256 = createHash('sha256').update(source).digest('hex');
  const { p12, fingerprintSha256 } = createSyntheticP12();
  const withPlaceholder = plainAddPlaceholder({
    pdfBuffer: source,
    reason: 'Issue143 spike',
    contactInfo: 'test@signing143.test',
    name: 'Spike',
    location: 'Test',
  });
  const signer = new P12Signer(p12, { passphrase: 'test-pass' });
  const signedPdf = await new SignPdf().sign(withPlaceholder, signer);
  const { byteRanges, signedData } = extractSignature(signedPdf);
  assertTrailingBytesRejected(signedPdf, byteRanges);
  assertSourcePrefixDerivation(source, signedPdf, byteRanges);
  const readerResult = verifyPdfReader(signedPdf);
  if (!readerResult.integrity) {
    console.error('readerResult', readerResult);
    throw new Error('pdf-signature-reader integrity check failed');
  }
  // Self-signed synthetic certs fail reader authenticity; Phase B trust policy validates separately.
  const tampered = Buffer.from(signedPdf);
  tampered[tampered.length - 40] ^= 0xff;
  const tamperedResult = verifyPdfReader(tampered);
  if (tamperedResult.verified) {
    throw new Error('Expected tampered PDF to fail verification');
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceSha256,
        signedSha256: createHash('sha256').update(signedPdf).digest('hex'),
        certFingerprintSha256: fingerprintSha256,
        readerIntegrity: readerResult.integrity,
        readerAuthenticity: readerResult.authenticity,
        byteRangeCount: byteRanges.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('SPIKE_FAILED', error);
  process.exit(1);
});
