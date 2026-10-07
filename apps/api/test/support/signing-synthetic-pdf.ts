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

export async function signPreparedPdfWithP12(
  preparedPdf: Buffer,
  p12: Buffer,
  passphrase: string,
): Promise<Buffer> {
  const signer = new P12Signer(p12, { passphrase });
  return Buffer.from(await new SignPdf().sign(preparedPdf, signer));
}

/** Legacy helper: adds placeholder then signs (prefer prepared artifact flow in Phase B tests). */
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
  return signPreparedPdfWithP12(withPlaceholder, p12, passphrase);
}

export function createSyntheticIntermediateChainP12(): {
  p12: Buffer;
  passphrase: string;
  leafFingerprintSha256: string;
  rootTrustAnchorPem: string;
  wrongRootTrustAnchorPem: string;
} {
  const rootKeys = forge.pki.rsa.generateKeyPair(2048);
  const rootCert = forge.pki.createCertificate();
  rootCert.publicKey = rootKeys.publicKey;
  rootCert.serialNumber = '10';
  rootCert.validity.notBefore = new Date(Date.now() - 86_400_000);
  rootCert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
  const caAttrs = [
    { name: 'commonName', value: 'Issue143 Test Root' },
    { name: 'countryName', value: 'MA' },
  ];
  rootCert.setSubject(caAttrs);
  rootCert.setIssuer(caAttrs);
  rootCert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, critical: true },
  ]);
  rootCert.sign(rootKeys.privateKey, forge.md.sha256.create());

  const intermediateKeys = forge.pki.rsa.generateKeyPair(2048);
  const intermediateCert = forge.pki.createCertificate();
  intermediateCert.publicKey = intermediateKeys.publicKey;
  intermediateCert.serialNumber = '11';
  intermediateCert.validity.notBefore = new Date(Date.now() - 86_400_000);
  intermediateCert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
  intermediateCert.setSubject([{ name: 'commonName', value: 'Issue143 Intermediate' }]);
  intermediateCert.setIssuer(caAttrs);
  intermediateCert.setExtensions([{ name: 'basicConstraints', cA: true, critical: true }]);
  intermediateCert.sign(rootKeys.privateKey, forge.md.sha256.create());

  const leafKeys = forge.pki.rsa.generateKeyPair(2048);
  const leafCert = forge.pki.createCertificate();
  leafCert.publicKey = leafKeys.publicKey;
  leafCert.serialNumber = '12';
  leafCert.validity.notBefore = new Date(Date.now() - 86_400_000);
  leafCert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
  leafCert.setSubject([{ name: 'commonName', value: 'Issue143 Leaf Signer' }]);
  leafCert.setIssuer([{ name: 'commonName', value: 'Issue143 Intermediate' }]);
  leafCert.sign(intermediateKeys.privateKey, forge.md.sha256.create());

  const leafFingerprintSha256 = createHash('sha256')
    .update(
      Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(leafCert)).getBytes(), 'binary'),
    )
    .digest('hex');
  const passphrase = 'test-pass-chain-143';
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    leafKeys.privateKey,
    [leafCert, intermediateCert],
    passphrase,
    { algorithm: '3des' },
  );

  const wrongRootKeys = forge.pki.rsa.generateKeyPair(2048);
  const wrongRoot = forge.pki.createCertificate();
  wrongRoot.publicKey = wrongRootKeys.publicKey;
  wrongRoot.serialNumber = '99';
  wrongRoot.validity.notBefore = new Date(Date.now() - 86_400_000);
  wrongRoot.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
  wrongRoot.setSubject([{ name: 'commonName', value: 'Wrong Root' }]);
  wrongRoot.setIssuer([{ name: 'commonName', value: 'Wrong Root' }]);
  wrongRoot.sign(wrongRootKeys.privateKey, forge.md.sha256.create());

  return {
    p12: Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary'),
    passphrase,
    leafFingerprintSha256,
    rootTrustAnchorPem: forge.pki.certificateToPem(rootCert),
    wrongRootTrustAnchorPem: forge.pki.certificateToPem(wrongRoot),
  };
}
