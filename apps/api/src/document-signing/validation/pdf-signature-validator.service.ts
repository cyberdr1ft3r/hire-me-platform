import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { verifyPdfCmsSignature } from './cms-pdf-signature.js';
import { assertPreparedArtifactBinding } from './prepared-artifact-binding.js';
import {
  assertNoTrailingBytesAfterByteRange,
  assertV1SingleSignatureStructure,
} from './pdf-byte-range-policy.js';
import {
  SIGNING_VALIDATION_POLICY_VERSION,
  evaluateCertificateTrust,
} from './signing-trust-policy.js';

export const PDF_SIGNATURE_VALIDATOR_NAME = 'hireme-pdf-signature-validator';
export const PDF_SIGNATURE_VALIDATOR_VERSION = '2.0.0';

export type PdfSignatureValidationOutcome = {
  overallResult: 'VALID' | 'INVALID' | 'INDETERMINATE';
  inputSourceSha256: string;
  inputPreparedArtifactSha256: string;
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
    preparedArtifactPdf: Buffer;
    signedPdf: Buffer;
    expectedCredentialFingerprintSha256: string;
    trustAnchorPems: string[];
    trustStoreVersion: string;
    referenceTime?: Date;
  }): Promise<PdfSignatureValidationOutcome> {
    const referenceTime = input.referenceTime ?? new Date();
    const inputPreparedArtifactSha256 = createHash('sha256')
      .update(input.preparedArtifactPdf)
      .digest('hex');
    const inputResultSha256 = createHash('sha256').update(input.signedPdf).digest('hex');
    const base = {
      inputSourceSha256: inputPreparedArtifactSha256,
      inputPreparedArtifactSha256,
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

    try {
      const { byteRanges } = assertV1SingleSignatureStructure(input.signedPdf);
      assertNoTrailingBytesAfterByteRange(input.signedPdf, byteRanges);
      assertPreparedArtifactBinding(input.preparedArtifactPdf, input.signedPdf);
      base.byteRangeResult = 'VALID';
      base.sourceBindingResult = 'VALID';
    } catch (error) {
      const code = error instanceof Error ? error.message : 'PDF_STRUCTURE_INVALID';
      return {
        ...base,
        overallResult: 'INVALID',
        reasonCode: code,
        byteRangeResult: code.startsWith('PDF_') ? 'INVALID' : 'NOT_RUN',
        sourceBindingResult: code.startsWith('PREPARED_') ? 'INVALID' : 'NOT_RUN',
        cmsCryptoResult: 'SKIPPED',
        certificateValidityResult: 'SKIPPED',
        chainTrustResult: 'SKIPPED',
      };
    }

    let cms;
    try {
      cms = verifyPdfCmsSignature(input.signedPdf);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'CMS_PARSE_FAILED';
      return {
        ...base,
        overallResult: 'INVALID',
        reasonCode: code,
        cmsCryptoResult: 'INVALID',
        certificateValidityResult: 'SKIPPED',
        chainTrustResult: 'SKIPPED',
      };
    }

    if (!cms.cmsCryptoValid) {
      return {
        ...base,
        overallResult: 'INVALID',
        reasonCode: 'CMS_INTEGRITY_FAILED',
        cmsCryptoResult: 'INVALID',
        certificateValidityResult: 'SKIPPED',
        chainTrustResult: 'SKIPPED',
      };
    }
    base.cmsCryptoResult = 'VALID';
    base.certificateFingerprintSha256 = cms.certificateFingerprintSha256;
    base.certificateSubjectSummary = cms.subjectSummary;
    base.certificateIssuerSummary = cms.issuerSummary;

    if (
      cms.certificateFingerprintSha256 !== input.expectedCredentialFingerprintSha256.toLowerCase()
    ) {
      return {
        ...base,
        overallResult: 'INVALID',
        reasonCode: 'CREDENTIAL_FINGERPRINT_MISMATCH',
        certificateValidityResult: 'VALID',
        chainTrustResult: 'SKIPPED',
      };
    }
    base.certificateValidityResult = 'VALID';

    const trust = await evaluateCertificateTrust({
      signerCertDer: cms.signerCertDer,
      untrustedCertDerCandidates: cms.certificateBagDer.filter(
        (der) => der.compare(cms.signerCertDer) !== 0,
      ),
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

    return {
      ...base,
      overallResult: 'VALID',
      reasonCode: null,
      boundedEvidenceJson: JSON.stringify({
        signerFingerprint: cms.certificateFingerprintSha256,
        certificateBagCount: cms.certificateBagDer.length,
      }).slice(0, 4000),
    };
  }
}
