import forge from 'node-forge';
import { Signer } from '@signpdf/signpdf';

/** Lab-only CMS signer using an in-memory forge private key (mock token matrix). */
export class ForgeMemoryPdfSigner extends Signer {
  constructor(
    private readonly certificate: forge.pki.Certificate,
    private readonly privateKey: forge.pki.rsa.PrivateKey,
  ) {
    super();
  }

  override sign(
    pdfBuffer: Buffer,
    signingTime: Date | undefined = undefined,
  ): Promise<Buffer> {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));
    p7.addCertificate(this.certificate);
    p7.addSigner({
      key: this.privateKey,
      certificate: this.certificate,
      digestAlgorithm: forge.pki.oids.sha256 ?? '2.16.840.1.101.3.4.2.1',
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType ?? '', value: forge.pki.oids.data },
        { type: forge.pki.oids.signingTime ?? '', value: signingTime ?? new Date() },
        { type: forge.pki.oids.messageDigest ?? '' },
      ] as never,
    });
    p7.sign({ detached: true });
    return Promise.resolve(
      Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary'),
    );
  }
}

export function isForgePrivateKey(value: unknown): value is forge.pki.rsa.PrivateKey {
  return Boolean(value && typeof value === 'object' && 'sign' in value && 'n' in value);
}
