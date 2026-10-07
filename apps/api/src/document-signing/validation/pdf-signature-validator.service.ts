import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { Injectable } from '@nestjs/common';
import forge from 'node-forge';

import {
  assertNoTrailingBytesAfterByteRange,
  assertSourcePrefixDerivation,
  extractPdfSignature,
} from './pdf-signature-extract.js';
import {
  SIGNING_VALIDATION_POLICY_VERSION,
  certificateFingerprintSha256FromDer,
  evaluateCertificateTrust,
  type TrustEvaluation,
} from './signing-trust-policy.js';

const require = createRequire(import.meta.url);
const { getCertificatesInfoFromPDF } = require('pdf-signature-reader/certificateDetails') as {
  getCertificatesInfoFromPDF: (
    pdf: Buffer,
  ) => Array<Array<{ pemCertificate?: string; issuedTo?: Record<string, string> }>>;
};

const verifyPdfReader = require('pdf-signature-reader') as (pdf: Buffer) => {
  verified: boolean;
  integrity: boolean;
  authenticity: boolean;
  expired: boolean;
  signatures?: Array<{
    integrity: boolean;
    meta?: { certs?: Array<{ pem?: string; subject?: string; issuer?: string }> };
  }>;
  message?: string;
};

export const PDF_SIGNATURE_VALIDATOR_NAME = 'hireme-pdf-signature-validator';
export const PDF_SIGNATURE_VALIDATOR_VERSION = '1.0.0';

export type PdfSignatureValidationOutcome = {
  overallResult: 'VALID' | 'INVALID' | 'INDETERMINATE';
  inputSourceSha256: string;
  inputResultSha256: string;
  cmsCryptoResult: string;
  byteRangeResult: string;
  sourceBindingResult: string;
  certificateValidityResult: string;
  chainTrustResult: string;
  timestampResult: string | null;
  reasonCode: string | null;
  certificateFingerprintSha256: string | null;
  certificateSubjectSummary: string | null;
  certificateIssuerSummary: string | null;
  trustStoreVersion: string;
  policyVersion: string;
  boundedEvidenceJson: string;
};

@Injectable()
export class PdfSignatureValidatorService {
  async validateSignedPdf(input: {
    sourcePdf: Buffer;
    signedPdf: Buffer;
    expectedCredentialFingerprintSha256: string;
    trustAnchorPems: string[];
    trustStoreVersion: string;
    referenceTime?: Date;
  }): Promise<PdfSignatureValidationOutcome> {
    const referenceTime = input.referenceTime ?? new Date();
    const inputSourceSha256 = createHash('sha256').update(input.sourcePdf).digest('hex');
    const inputResultSha256 = createHash('sha256').update(input.signedPdf).digest('hex');
    const base = {
      inputSourceSha256,
      inputResultSha256,
      cmsCryptoResult: 'NOT_RUN',
      byteRangeResult: 'NOT_RUN',
      sourceBindingResult: 'NOT_RUN',
      certificateValidityResult: 'NOT_RUN',
      chainTrustResult: 'NOT_RUN',
      timestampResult: null as string | null,
      reasonCode: null as string | null,
      certificateFingerprintSha256: null as string | null,
      certificateSubjectSummary: null as string | null,
      certificateIssuerSummary: null as string | null,
      trustStoreVersion: input.trustStoreVersion,
      policyVersion: SIGNING_VALIDATION_POLICY_VERSION,
      boundedEvidenceJson: '{}',
    };

    if (input.signedPdf.subarray(0, 5).toString() !== '%PDF-') {
      return {
        ...base,
        overallResult: 'INVALID',
        reasonCode: 'RESULT_NOT_PDF',
        cmsCryptoResult: 'SKIPPED',
        byteRangeResult: 'SKIPPED',
        sourceBindingResult: 'SKIPPED',
        certificateValidityResult: 'SKIPPED',
        chainTrustResult: 'SKIPPED',
      };
    }

    let byteRanges: number[][];
    try {
      ({ byteRanges } = extractPdfSignature(input.signedPdf));
      assertNoTrailingBytesAfterByteRange(input.signedPdf, byteRanges);
      assertSourcePrefixDerivation(input.sourcePdf, input.signedPdf, byteRanges);
      base.byteRangeResult = 'VALID';
      base.sourceBindingResult = 'VALID';
    } catch (error) {
      const code = error instanceof Error ? error.message : 'PDF_STRUCTURE_INVALID';
      return {
        ...base,
        overallResult: 'INVALID',
        reasonCode: code,
        byteRangeResult: code.startsWith('PDF_') ? 'INVALID' : 'NOT_RUN',
        sourceBindingResult: code.startsWith('SOURCE_') ? 'INVALID' : 'NOT_RUN',
        cmsCryptoResult: 'SKIPPED',
        certificateValidityResult: 'SKIPPED',
        chainTrustResult: 'SKIPPED',
      };
    }

    const readerResult = verifyPdfReader(input.signedPdf);
    if (!readerResult.integrity) {
      return {
        ...base,
        overallResult: 'INVALID',
        reasonCode: 'CMS_INTEGRITY_FAILED',
        cmsCryptoResult: 'INVALID',
        certificateValidityResult: 'SKIPPED',
        chainTrustResult: 'SKIPPED',
        boundedEvidenceJson: JSON.stringify({
          readerMessage: readerResult.message ?? null,
        }).slice(0, 4000),
      };
    }
    base.cmsCryptoResult = 'VALID';

    const certGroups = getCertificatesInfoFromPDF(input.signedPdf);
    const clientCert = certGroups[0]?.find((entry) => entry.pemCertificate)?.pemCertificate;
    if (!clientCert) {
      return {
        ...base,
        overallResult: 'INVALID',
        reasonCode: 'SIGNER_CERTIFICATE_MISSING',
        certificateValidityResult: 'INVALID',
        chainTrustResult: 'SKIPPED',
      };
    }
    const certAsn1 = forge.pki.certificateToAsn1(forge.pki.certificateFromPem(clientCert));
    const certDer = Buffer.from(forge.asn1.toDer(certAsn1).getBytes(), 'binary');
    const fingerprint = certificateFingerprintSha256FromDer(certDer);
    base.certificateFingerprintSha256 = fingerprint;
    const issuedTo = certGroups[0]?.[0]?.issuedTo ?? {};
    base.certificateSubjectSummary = JSON.stringify(issuedTo).slice(0, 500);
    base.certificateIssuerSummary = base.certificateSubjectSummary;

    if (fingerprint !== input.expectedCredentialFingerprintSha256.toLowerCase()) {
      return {
        ...base,
        overallResult: 'INVALID',
        reasonCode: 'CREDENTIAL_FINGERPRINT_MISMATCH',
        certificateValidityResult: 'VALID',
        chainTrustResult: 'SKIPPED',
      };
    }
    base.certificateValidityResult = readerResult.expired ? 'EXPIRED' : 'VALID';

    const trust: TrustEvaluation = await evaluateCertificateTrust({
      signerCertDer: certDer,
      trustAnchorPems: input.trustAnchorPems,
      trustStoreVersion: input.trustStoreVersion,
      referenceTime,
    });
    base.chainTrustResult = trust.result;
    if (trust.result !== 'TRUSTED') {
      return {
        ...base,
        overallResult: trust.result === 'INDETERMINATE' ? 'INDETERMINATE' : 'INVALID',
        reasonCode: trust.reasonCode ?? 'TRUST_POLICY_FAILED',
      };
    }

    if (readerResult.expired) {
      return {
        ...base,
        overallResult: 'INVALID',
        reasonCode: 'CERTIFICATE_EXPIRED',
      };
    }

    return {
      ...base,
      overallResult: 'VALID',
      reasonCode: null,
      boundedEvidenceJson: JSON.stringify({
        readerAuthenticity: readerResult.authenticity,
        byteRangeCount: byteRanges.length,
      }).slice(0, 4000),
    };
  }
}
