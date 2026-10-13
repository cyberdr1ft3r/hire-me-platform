import { SignPdf } from '@signpdf/signpdf';
import forge from 'node-forge';

import { PreparedSigningArtifactService } from '../prepared-signing-artifact.service.js';
import { PdfSignatureValidatorService } from '../validation/pdf-signature-validator.service.js';
import { Pkcs11CmsPdfSigner } from './pkcs11-cms-pdf-signer.js';
import { ForgeMemoryPdfSigner, isForgePrivateKey } from './forge-memory-pdf-signer.js';
import type {
  LabTokenCredentialReference,
  LabTokenResolvedCredential,
  Pkcs11TokenClient,
} from './pkcs11-token-client.types.js';

export const LAB_PERSON_SIGNER_CN = 'Hire-Me PKCS11 Test Signer - NOT QUALIFIED';
export const LAB_ORG_SEAL_CN = 'Hire-Me PKCS11 Test Seal - NOT QUALIFIED';

export type Pkcs11SigningLabProof = {
  preparedPdf: Buffer;
  preparedArtifactSha256: string;
  signedPdf: Buffer;
  credential: LabTokenResolvedCredential;
  validation: Awaited<ReturnType<PdfSignatureValidatorService['validateSignedPdf']>>;
};

export class Pkcs11SigningLab {
  private readonly preparedArtifact = new PreparedSigningArtifactService();
  private readonly validator = new PdfSignatureValidatorService();

  constructor(private readonly tokenClient: Pkcs11TokenClient) {}

  /** Resolves certificate and key from token objects; nothing is taken from provisioning output. */
  async provePreparedPdfSigning(input: {
    sourcePdf: Buffer;
    credential: LabTokenCredentialReference;
  }): Promise<Pkcs11SigningLabProof> {
    const credential = this.tokenClient.resolveLabCredential(input.credential);
    const preparedPdf = this.preparedArtifact.buildPreparedArtifact(input.sourcePdf);
    const preparedArtifactSha256 = this.preparedArtifact.preparedArtifactSha256(preparedPdf);
    const signedPdf = await this.signPreparedArtifact(preparedPdf, credential);
    const validation = await this.validator.validateSignedPdf({
      preparedArtifactPdf: preparedPdf,
      signedPdf,
      expectedCredentialFingerprintSha256: credential.certificateFingerprintSha256,
      trustAnchorPems: [credential.trustAnchorPem],
      trustStoreVersion: 'pkcs11-lab-test-trust-v1',
    });
    return {
      preparedPdf,
      preparedArtifactSha256,
      signedPdf,
      credential,
      validation,
    };
  }

  async signPreparedArtifact(
    preparedPdf: Buffer,
    credential: LabTokenResolvedCredential,
  ): Promise<Buffer> {
    const certificate = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(credential.certificateDer.toString('binary')),
    );
    const privateKey = credential.privateKeyHandle;
    const signer = isForgePrivateKey(privateKey)
      ? new ForgeMemoryPdfSigner(certificate, privateKey)
      : new Pkcs11CmsPdfSigner(certificate, (digest) =>
          this.tokenClient.signSha256RsaPkcs1(credential, digest),
        );
    return Buffer.from(await new SignPdf().sign(preparedPdf, signer));
  }
}
