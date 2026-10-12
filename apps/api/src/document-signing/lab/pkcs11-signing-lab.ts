import { SignPdf } from '@signpdf/signpdf';
import forge from 'node-forge';

import { PreparedSigningArtifactService } from '../prepared-signing-artifact.service.js';
import { PdfSignatureValidatorService } from '../validation/pdf-signature-validator.service.js';
import { Pkcs11CmsPdfSigner } from './pkcs11-cms-pdf-signer.js';
import { ForgeMemoryPdfSigner, isForgePrivateKey } from './forge-memory-pdf-signer.js';
import type {
  LabTokenCertificateMaterial,
  Pkcs11TokenClient,
} from './pkcs11-token-client.types.js';

export const LAB_PERSON_SIGNER_CN = 'Hire-Me PKCS11 Test Signer - NOT QUALIFIED';
export const LAB_ORG_SEAL_CN = 'Hire-Me PKCS11 Test Seal - NOT QUALIFIED';

export type Pkcs11SigningLabProof = {
  preparedPdf: Buffer;
  preparedArtifactSha256: string;
  signedPdf: Buffer;
  credential: LabTokenCertificateMaterial;
  validation: Awaited<ReturnType<PdfSignatureValidatorService['validateSignedPdf']>>;
};

export class Pkcs11SigningLab {
  private readonly preparedArtifact = new PreparedSigningArtifactService();
  private readonly validator = new PdfSignatureValidatorService();

  constructor(private readonly tokenClient: Pkcs11TokenClient) {}

  async provePreparedPdfSigning(input: {
    sourcePdf: Buffer;
    credential: LabTokenCertificateMaterial;
  }): Promise<Pkcs11SigningLabProof> {
    const preparedPdf = this.preparedArtifact.buildPreparedArtifact(input.sourcePdf);
    const preparedArtifactSha256 = this.preparedArtifact.preparedArtifactSha256(preparedPdf);
    const signedPdf = await this.signPreparedArtifact(preparedPdf, input.credential);
    const validation = await this.validator.validateSignedPdf({
      preparedArtifactPdf: preparedPdf,
      signedPdf,
      expectedCredentialFingerprintSha256: input.credential.certificateFingerprintSha256,
      trustAnchorPems: [input.credential.trustAnchorPem],
      trustStoreVersion: 'pkcs11-lab-test-trust-v1',
    });
    return {
      preparedPdf,
      preparedArtifactSha256,
      signedPdf,
      credential: input.credential,
      validation,
    };
  }

  async signPreparedArtifact(
    preparedPdf: Buffer,
    credential: LabTokenCertificateMaterial,
  ): Promise<Buffer> {
    const privateKey = this.tokenClient.findPrivateKeyByLabel(credential.privateKeyLabel);
    const certificate = forge.pki.certificateFromPem(credential.certificatePem);
    const signer = isForgePrivateKey(privateKey)
      ? new ForgeMemoryPdfSigner(certificate, privateKey)
      : new Pkcs11CmsPdfSigner(certificate, (digest) =>
          this.tokenClient.signSha256RsaPkcs1(privateKey, digest),
        );
    return Buffer.from(await new SignPdf().sign(preparedPdf, signer));
  }
}
