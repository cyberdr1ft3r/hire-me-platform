import forge from 'node-forge';
import { Signer } from '@signpdf/signpdf';

import { createForgePrivateKeyFromPkcs11 } from './forge-pkcs11-private-key.js';

/** CMS detached signer for @signpdf using a PKCS#11-backed private key (lab only). */
export class Pkcs11CmsPdfSigner extends Signer {
  constructor(
    private readonly certificate: forge.pki.Certificate,
    private readonly signDigest: (digest: Buffer) => Buffer,
  ) {
    super();
  }

  override sign(
    pdfBuffer: Buffer,
    signingTime: Date | undefined = undefined,
  ): Promise<Buffer> {
    if (!(pdfBuffer instanceof Buffer)) {
      throw new Error('PDF expected as Buffer.');
    }
    const privateKey = createForgePrivateKeyFromPkcs11(
      this.certificate.publicKey as forge.pki.rsa.PublicKey,
      this.signDigest,
    );
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));
    p7.addCertificate(this.certificate);
    p7.addSigner({
      key: privateKey,
      certificate: this.certificate,
      digestAlgorithm: forge.pki.oids.sha256 ?? '2.16.840.1.101.3.4.2.1',
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType ?? '', value: forge.pki.oids.data },
        {
          type: forge.pki.oids.signingTime ?? '',
          value: signingTime ?? new Date(),
        },
        { type: forge.pki.oids.messageDigest ?? '' },
      ] as never,
    });
    p7.sign({ detached: true });
    return Promise.resolve(
      Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary'),
    );
  }
}
