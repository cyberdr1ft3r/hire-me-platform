import { createHash } from 'node:crypto';

import { SignPdf } from '@signpdf/signpdf';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { P12Signer } from '@signpdf/signer-p12';
import forge from 'node-forge';

export function createSyntheticSigningP12(commonName = 'Issue143 Test Signer'): {
  p12: Buffer;
  passphrase: string;
  certificateFingerprintSha256: string;
  trustAnchorPem: string;
} {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'countryName', value: 'MA' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const trustAnchorPem = forge.pki.certificateToPem(cert);
  const certificateFingerprintSha256 = createHash('sha256')
    .update(Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary'))
    .digest('hex');
  const passphrase = 'test-pass-143';
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, {
    algorithm: '3des',
  });
  return {
    p12: Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary'),
    passphrase,
    certificateFingerprintSha256,
    trustAnchorPem,
  };
}

export async function signPdfWithP12(
  sourcePdf: Buffer,
  p12: Buffer,
  passphrase: string,
): Promise<Buffer> {
  const withPlaceholder = plainAddPlaceholder({
    pdfBuffer: sourcePdf,
    reason: 'Synthetic test signature',
    contactInfo: 'signing143@test.local',
    name: 'Test',
    location: 'Test',
  });
  const signer = new P12Signer(p12, { passphrase });
  return Buffer.from(await new SignPdf().sign(withPlaceholder, signer));
}
