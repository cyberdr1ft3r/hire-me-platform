import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  SigningCredentialCreateRequest,
  SigningCredentialGrantCreateRequest,
  SigningOrganizationCreateRequest,
  SigningRequestApproveRequest,
  SigningRequestAuditResponse,
  SigningRequestCreateRequest,
  SigningRequestDetailResponse,
  SigningResultSubmitRequest,
} from '@hire-me/contracts';

import {
  computeSigningBindingHash,
  createNonceHash,
  SIGNING_METHOD_NEUTRAL,
  SIGNING_POLICY_VERSION,
  SIGNING_REQUEST_TTL_MS,
} from './document-signing.binding.js';
import { DocumentSigningAuditService } from './document-signing-audit.service.js';
import {
  ACTIVE_SIGNING_REQUEST_STATES,
  appendSigningEventInTransaction,
  lockActiveSealGrants,
  lockAuthoritativeFinancialSourceRow,
  lockBoundUserRolePermissions,
  lockDocumentRow,
  lockSigningCredentialRow,
  lockSigningRequest,
  transitionSigningRequestTerminal,
} from './document-signing.lifecycle.js';
import { FinancialSourceSnapshotService } from '../document-generation/financial-source-snapshot.service.js';
import {
  isSigningPublicationSerializationConflict,
  signingBadRequest,
  signingConflict,
  signingForbidden,
  signingNotFound,
} from './document-signing.errors.js';
import { SIGNING_PERMISSIONS } from './document-signing-permissions.js';
import {
  PDF_SIGNATURE_VALIDATOR_NAME,
  PDF_SIGNATURE_VALIDATOR_VERSION,
  PdfSignatureValidatorService,
  type PdfSignatureValidationOutcome,
} from './validation/pdf-signature-validator.service.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import {
  Prisma,
  SigningCredentialOwnerType,
  SigningCredentialStatus,
  SigningGrantAction,
  SigningKind,
  SigningRequestState,
  DocumentVersionSource,
  DocumentStatus,
  SignatureValidationOverallResult,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { PreparedSigningArtifactService } from './prepared-signing-artifact.service.js';
import {
  runSigningAcceptanceBarrierIfConfigured,
  runSigningPostAuthorityBarrierIfConfigured,
} from './signing-acceptance-barrier.js';
import { ProtectedStorageService } from '../storage/protected-storage.service.js';

@Injectable()
export class DocumentSigningService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(DocumentSigningAuditService) private readonly signingAudit: DocumentSigningAuditService,
    @Inject(FinancialSourceSnapshotService)
    private readonly sourceSnapshot: FinancialSourceSnapshotService,
    @Inject(PdfSignatureValidatorService)
    private readonly pdfValidator: PdfSignatureValidatorService,
    @Inject(ProtectedStorageService) private readonly storage: ProtectedStorageService,
    @Inject(PreparedSigningArtifactService)
    private readonly preparedArtifact: PreparedSigningArtifactService,
  ) {}

  private static readonly signingResultMaxBytes = 8_000_000;

  private resolveTrustAnchorPems(): { anchors: string[]; version: string } {
    const raw = process.env.SIGNING_TRUST_ANCHOR_PEMS?.trim();
    if (!raw) {
      return { anchors: [], version: 'empty-v1' };
    }
    return {
      anchors: raw
        .split('|||')
        .map((pem) => pem.trim())
        .filter(Boolean),
      version: createHash('sha256').update(raw).digest('hex').slice(0, 16),
    };
  }

  async createOrganization(
    body: SigningOrganizationCreateRequest,
    actorUserId: string,
  ): Promise<{ organization: { id: string; legalName: string } }> {
    await this.assertManageCredentials(actorUserId);
    const organization = await this.prisma.signingOrganization.create({
      data: {
        legalName: body.legalName,
        registrationNumber: body.registrationNumber,
        countryCode: body.countryCode ?? 'MA',
      },
      select: { id: true, legalName: true },
    });
    return { organization };
  }

  async createCredential(
    body: SigningCredentialCreateRequest,
    actorUserId: string,
  ): Promise<{ credentialId: string }> {
    await this.assertManageCredentials(actorUserId);
    this.rejectSecretMaterial(body);
    const credential = await this.prisma.signingCredential.create({
      data: {
        ownerType: body.ownerType,
        ownerUserId: body.ownerUserId,
        signingOrganizationId: body.signingOrganizationId,
        providerLabel: body.providerLabel,
        serviceTypeOid: body.serviceTypeOid,
        certificateSerial: body.certificateSerial,
        certificateFingerprintSha256: body.certificateFingerprintSha256,
        certificateSubjectSummary: body.certificateSubjectSummary,
        validFrom: new Date(body.validFrom),
        validTo: new Date(body.validTo),
        verifiedAt: new Date(),
        verifiedByUserId: actorUserId,
      },
      select: { id: true },
    });
    return { credentialId: credential.id };
  }

  async createCredentialGrant(
    credentialId: string,
    body: SigningCredentialGrantCreateRequest,
    actorUserId: string,
  ): Promise<{ grantId: string }> {
    await this.assertManageCredentials(actorUserId);
    this.rejectSecretMaterial(body);
    const credential = await this.prisma.signingCredential.findUnique({
      where: { id: credentialId },
      select: { id: true, ownerType: true, status: true },
    });
    if (!credential || credential.status === SigningCredentialStatus.ARCHIVED) {
      throw signingNotFound('SIGNING_CREDENTIAL_NOT_FOUND', 'Signing credential was not found.');
    }
    if (credential.ownerType !== SigningCredentialOwnerType.ORGANIZATION) {
      throw signingBadRequest(
        'SIGNING_GRANT_NOT_APPLICABLE',
        'Mandate grants apply only to organization seal credentials.',
      );
    }
    const grant = await this.prisma.signingCredentialGrant.create({
      data: {
        credentialId,
        userId: body.userId,
        allowedAction: body.allowedAction,
        authorityReference: body.authorityReference,
        authorizedByUserId: actorUserId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      select: { id: true },
    });
    return { grantId: grant.id };
  }

  async createSigningRequest(
    documentId: string,
    versionId: string,
    body: SigningRequestCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<SigningRequestDetailResponse> {
    this.rejectSecretMaterial(body);
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    await this.assertActiveInternalUser(actorUserId);
    if (body.kind === 'PERSON_SIGNATURE') {
      this.assertPermission(permissions, SIGNING_PERMISSIONS.SIGN);
    } else {
      this.assertPermission(permissions, SIGNING_PERMISSIONS.SEAL);
    }

    const { version } = await this.documents.assertFinancialSigningVersionAccess(
      documentId,
      versionId,
      actorUserId,
    );

    const credential = await this.prisma.signingCredential.findUnique({
      where: { id: body.signingCredentialId },
    });
    if (!credential || credential.status !== SigningCredentialStatus.ENABLED) {
      throw signingBadRequest(
        'SIGNING_CREDENTIAL_UNAVAILABLE',
        'Signing credential is not available.',
      );
    }

    if (body.kind === 'PERSON_SIGNATURE') {
      if (credential.ownerType !== SigningCredentialOwnerType.USER) {
        throw signingBadRequest(
          'SIGNING_CREDENTIAL_KIND_MISMATCH',
          'Person signatures require a user-owned credential.',
        );
      }
      const signerId = body.intendedSignerUserId!;
      if (credential.ownerUserId !== signerId) {
        throw signingForbidden(
          'SIGNING_CREDENTIAL_OWNER_MISMATCH',
          'Credential does not belong to the intended signer.',
        );
      }
      if (signerId !== actorUserId) {
        throw signingForbidden(
          'SIGNING_SIGNER_ACTOR_MISMATCH',
          'Person signature requests must be created by the intended signer.',
        );
      }
    } else {
      if (credential.ownerType !== SigningCredentialOwnerType.ORGANIZATION) {
        throw signingBadRequest(
          'SIGNING_CREDENTIAL_KIND_MISMATCH',
          'Organization seals require an organization-owned credential.',
        );
      }
      if (credential.signingOrganizationId !== body.signingOrganizationId) {
        throw signingForbidden(
          'SIGNING_ORGANIZATION_MISMATCH',
          'Credential does not belong to the requested organization.',
        );
      }
      await this.assertActiveSealGrant(credential.id, actorUserId, body.signingOrganizationId);
    }

    const nonceHash = createNonceHash();
    const bindingHash = computeSigningBindingHash({
      documentId,
      sourceVersionId: versionId,
      sourceSha256: version.checksumSha256!,
      sourceSnapshotSha256: version.sourceSnapshotSha256,
      kind: body.kind,
      intendedSignerUserId: body.intendedSignerUserId ?? null,
      signingOrganizationId: body.signingOrganizationId ?? null,
      credentialFingerprintSha256: credential.certificateFingerprintSha256,
      methodIdentifier: SIGNING_METHOD_NEUTRAL,
      policyVersion: SIGNING_POLICY_VERSION,
      nonceHash,
    });

    const expiresAt = new Date(Date.now() + SIGNING_REQUEST_TTL_MS);

    try {
      const request = await this.prisma.$transaction(async (transaction) => {
        await this.documents.assertFinancialSigningVersionAccess(
          documentId,
          versionId,
          actorUserId,
          transaction,
        );
        const existing = await transaction.signingRequest.findUnique({
          where: {
            requestedByUserId_idempotencyKey: {
              requestedByUserId: actorUserId,
              idempotencyKey: body.idempotencyKey,
            },
          },
        });
        if (existing) {
          const sameTarget =
            existing.documentId === documentId &&
            existing.sourceVersionId === versionId &&
            existing.kind === body.kind &&
            existing.signingCredentialId === body.signingCredentialId;
          if (!sameTarget) {
            throw signingConflict(
              'SIGNING_IDEMPOTENCY_CONFLICT',
              'Idempotency key is already bound to a different signing request.',
            );
          }
          return existing;
        }
        const created = await transaction.signingRequest.create({
          data: {
            documentId,
            sourceVersionId: versionId,
            sourceSha256: version.checksumSha256!,
            sourceSnapshotSha256: version.sourceSnapshotSha256,
            kind: body.kind,
            requestedByUserId: actorUserId,
            intendedSignerUserId: body.intendedSignerUserId,
            signingOrganizationId: body.signingOrganizationId,
            signingCredentialId: credential.id,
            credentialFingerprintSha256: credential.certificateFingerprintSha256,
            methodIdentifier: SIGNING_METHOD_NEUTRAL,
            policyVersion: SIGNING_POLICY_VERSION,
            nonceHash,
            bindingHash,
            idempotencyKey: body.idempotencyKey,
            expiresAt,
            state: SigningRequestState.PREPARED,
          },
        });
        await appendSigningEventInTransaction(transaction, {
          signingRequestId: created.id,
          action: 'request.prepared',
          actorUserId,
          metadataSummary: 'Signing request prepared for exact document version.',
        });
        return created;
      });

      await this.signingAudit.recordPlatformAudit('request.prepared', context, {
        actorUserId,
        signingRequestId: request.id,
        metadataSummary: 'Signing request prepared.',
      });

      const refreshed = await this.refreshRequestState(request.id);
      return { request: this.toSummary(refreshed) };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.signingRequest.findFirst({
          where: {
            OR: [
              {
                requestedByUserId: actorUserId,
                idempotencyKey: body.idempotencyKey,
              },
              { sourceVersionId: versionId, state: { in: ACTIVE_SIGNING_REQUEST_STATES } },
            ],
          },
        });
        if (existing) {
          if (
            existing.requestedByUserId === actorUserId &&
            existing.idempotencyKey === body.idempotencyKey
          ) {
            const sameTarget =
              existing.documentId === documentId &&
              existing.sourceVersionId === versionId &&
              existing.kind === body.kind &&
              existing.signingCredentialId === body.signingCredentialId;
            if (!sameTarget) {
              throw signingConflict(
                'SIGNING_IDEMPOTENCY_CONFLICT',
                'Idempotency key is already bound to a different signing request.',
              );
            }
            const refreshed = await this.refreshRequestState(existing.id);
            return { request: this.toSummary(refreshed) };
          }
          throw signingConflict(
            'SIGNING_ACTIVE_REQUEST_EXISTS',
            'An active signing request already exists for this document version.',
          );
        }
      }
      throw error;
    }
  }

  async getSigningRequest(
    requestId: string,
    actorUserId: string,
  ): Promise<SigningRequestDetailResponse> {
    const request = await this.loadAuthorizedRequest(requestId, actorUserId);
    const refreshed = await this.refreshRequestState(request.id);
    return { request: this.toSummary(refreshed) };
  }

  async approveSigningRequest(
    requestId: string,
    body: SigningRequestApproveRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<SigningRequestDetailResponse> {
    this.rejectSecretMaterial(body);
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    this.assertPermission(permissions, SIGNING_PERMISSIONS.APPROVE_SIGNING);
    await this.assertActiveInternalUser(actorUserId);

    const request = await this.loadAuthorizedRequest(requestId, actorUserId);
    const refreshed = await this.refreshRequestState(request.id);
    if (refreshed.state !== SigningRequestState.PREPARED) {
      throw signingConflict('SIGNING_REQUEST_NOT_PREPARED', 'Signing request is not approvable.');
    }

    const { document } = await this.documents.assertFinancialSigningVersionAccess(
      refreshed.documentId,
      refreshed.sourceVersionId,
      actorUserId,
    );
    await this.documents.assertFinancialSourceManageForSigning(document, actorUserId, permissions);

    if (refreshed.kind === SigningKind.PERSON_SIGNATURE) {
      this.assertPermission(permissions, SIGNING_PERMISSIONS.SIGN);
      if (refreshed.intendedSignerUserId !== actorUserId) {
        throw signingForbidden(
          'SIGNING_APPROVAL_SIGNER_REQUIRED',
          'Person signature approval requires the intended signer.',
        );
      }
    } else {
      this.assertPermission(permissions, SIGNING_PERMISSIONS.SEAL);
      await this.assertActiveSealGrant(
        refreshed.signingCredentialId,
        actorUserId,
        refreshed.signingOrganizationId!,
      );
    }

    const sourceVersion = await this.prisma.documentVersion.findUniqueOrThrow({
      where: { id: refreshed.sourceVersionId },
    });
    const sourcePdf = await this.storage.get(sourceVersion.storageKey);
    if (createHash('sha256').update(sourcePdf).digest('hex') !== refreshed.sourceSha256) {
      throw signingConflict(
        'SIGNING_SOURCE_STALE',
        'Source bytes no longer match the signing request.',
      );
    }
    const preparedPdf = this.preparedArtifact.buildPreparedArtifact(sourcePdf);
    const preparedSigningArtifactSha256 = this.preparedArtifact.preparedArtifactSha256(preparedPdf);
    const preparedSigningStorageKey = `signing-prepared/${requestId}.pdf`;
    await this.storage.put(preparedSigningStorageKey, preparedPdf);

    try {
      await this.prisma.$transaction(async (transaction) => {
        await lockSigningRequest(transaction, requestId);
        const current = await transaction.signingRequest.findUnique({ where: { id: requestId } });
        if (!current || current.state !== SigningRequestState.PREPARED) {
          throw signingConflict(
            'SIGNING_REQUEST_NOT_PREPARED',
            'Signing request is not approvable.',
          );
        }
        await transaction.documentSigningApproval.create({
          data: {
            signingRequestId: requestId,
            approverUserId: actorUserId,
            bindingHash: current.bindingHash,
            confirmationSummary: body.confirmationSummary?.slice(0, 500),
          },
        });
        await transaction.signingRequest.update({
          where: { id: requestId },
          data: {
            state: SigningRequestState.AWAITING_RESULT,
            preparedSigningArtifactSha256,
            preparedSigningStorageKey,
          },
        });
        await appendSigningEventInTransaction(transaction, {
          signingRequestId: requestId,
          action: 'request.approved',
          actorUserId,
          metadataSummary: 'Signing request approved.',
        });
        await appendSigningEventInTransaction(transaction, {
          signingRequestId: requestId,
          action: 'request.awaiting_result',
          actorUserId,
          metadataSummary: 'Signing request awaiting provider result (Phase B).',
        });
      });
    } catch (error) {
      await this.storage.delete(preparedSigningStorageKey).catch(() => undefined);
      throw error;
    }

    await this.signingAudit.recordPlatformAudit('request.approved', context, {
      actorUserId,
      signingRequestId: requestId,
      metadataSummary: 'Signing request approved for exact binding.',
    });

    const finalRequest = await this.refreshRequestState(requestId);
    return { request: this.toSummary(finalRequest) };
  }

  async cancelSigningRequest(
    requestId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<SigningRequestDetailResponse> {
    const request = await this.loadAuthorizedRequest(requestId, actorUserId);
    const refreshed = await this.refreshRequestState(request.id);
    if (!ACTIVE_SIGNING_REQUEST_STATES.includes(refreshed.state)) {
      throw signingConflict(
        'SIGNING_REQUEST_NOT_CANCELLABLE',
        'Signing request cannot be cancelled.',
      );
    }
    if (refreshed.requestedByUserId !== actorUserId) {
      const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
      this.assertPermission(permissions, SIGNING_PERMISSIONS.APPROVE_SIGNING);
    }

    await this.prisma.$transaction(async (transaction) => {
      await lockSigningRequest(transaction, requestId);
      const current = await transaction.signingRequest.findUnique({ where: { id: requestId } });
      if (!current || !ACTIVE_SIGNING_REQUEST_STATES.includes(current.state)) {
        throw signingConflict(
          'SIGNING_REQUEST_NOT_CANCELLABLE',
          'Signing request cannot be cancelled.',
        );
      }
      await transitionSigningRequestTerminal(
        transaction,
        current,
        SigningRequestState.CANCELLED,
        'CANCELLED_BY_ACTOR',
        'request.cancelled',
        actorUserId,
        'Signing request cancelled.',
      );
    });
    await this.signingAudit.recordPlatformAudit('request.cancelled', context, {
      actorUserId,
      signingRequestId: requestId,
      metadataSummary: 'Signing request cancelled.',
    });
    const finalRequest = await this.prisma.signingRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    return { request: this.toSummary(finalRequest) };
  }

  async listSigningAudit(
    requestId: string,
    actorUserId: string,
  ): Promise<SigningRequestAuditResponse> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    this.assertPermission(permissions, SIGNING_PERMISSIONS.VIEW_SIGNATURE_AUDIT);
    await this.loadAuthorizedRequest(requestId, actorUserId);
    const events = await this.prisma.signingEvent.findMany({
      where: { signingRequestId: requestId },
      orderBy: { sequence: 'asc' },
      select: {
        sequence: true,
        action: true,
        reasonCode: true,
        metadataSummary: true,
        occurredAt: true,
      },
    });
    return {
      requestId,
      events: events.map((event) => ({
        sequence: event.sequence,
        action: event.action,
        reasonCode: event.reasonCode,
        metadataSummary: event.metadataSummary,
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
  }

  private async loadAuthorizedRequest(requestId: string, actorUserId: string) {
    const request = await this.prisma.signingRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw signingNotFound('SIGNING_REQUEST_NOT_FOUND', 'Signing request was not found.');
    }
    const allowed = await this.documents.hasAuthorizedDocumentAccess(
      request.documentId,
      actorUserId,
    );
    if (!allowed) {
      throw signingNotFound('SIGNING_REQUEST_NOT_FOUND', 'Signing request was not found.');
    }
    return request;
  }

  private async refreshRequestState(
    requestId: string,
  ): Promise<Prisma.SigningRequestGetPayload<Record<string, never>>> {
    return this.prisma.$transaction(async (transaction) => {
      await lockSigningRequest(transaction, requestId);
      const request = await transaction.signingRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      if (!ACTIVE_SIGNING_REQUEST_STATES.includes(request.state)) {
        return request;
      }

      let terminalState: SigningRequestState | null = null;
      let terminalReason: string | null = null;
      let eventAction = 'request.failed';

      if (request.expiresAt.getTime() <= Date.now()) {
        terminalState = SigningRequestState.EXPIRED;
        terminalReason = 'REQUEST_EXPIRED';
        eventAction = 'request.expired';
      }

      const document = await transaction.document.findUnique({
        where: { id: request.documentId },
        select: { currentVersionId: true },
      });
      if (!terminalState && document?.currentVersionId !== request.sourceVersionId) {
        terminalState = SigningRequestState.STALE;
        terminalReason = 'SOURCE_VERSION_NO_LONGER_CURRENT';
        eventAction = 'request.stale';
      }

      const version = await transaction.documentVersion.findUnique({
        where: { id: request.sourceVersionId },
        select: { checksumSha256: true, documentId: true },
      });
      if (!terminalState && version && version.checksumSha256 !== request.sourceSha256) {
        terminalState = SigningRequestState.STALE;
        terminalReason = 'SOURCE_BYTES_CHANGED';
        eventAction = 'request.stale';
      }

      if (!terminalState && request.sourceSnapshotSha256) {
        const currentSnapshot = await this.sourceSnapshot.computeCurrentFingerprint(
          request.documentId,
          transaction,
        );
        if (!currentSnapshot || currentSnapshot !== request.sourceSnapshotSha256) {
          terminalState = SigningRequestState.STALE;
          terminalReason = currentSnapshot ? 'SOURCE_BUSINESS_DATA_CHANGED' : 'SOURCE_UNAVAILABLE';
          eventAction = 'request.stale';
        }
      }

      const credential = await transaction.signingCredential.findUnique({
        where: { id: request.signingCredentialId },
        select: {
          status: true,
          validFrom: true,
          validTo: true,
          ownerType: true,
          ownerUserId: true,
          signingOrganizationId: true,
          certificateFingerprintSha256: true,
        },
      });
      const now = new Date();
      if (
        !terminalState &&
        (!credential ||
          credential.status !== SigningCredentialStatus.ENABLED ||
          credential.validFrom > now ||
          credential.validTo <= now ||
          credential.certificateFingerprintSha256 !== request.credentialFingerprintSha256)
      ) {
        terminalState = SigningRequestState.FAILED;
        terminalReason = 'CREDENTIAL_UNAVAILABLE';
      }

      if (!terminalState) {
        const authorityFailure = await this.evaluateBoundSigningAuthority(
          request,
          credential,
          transaction,
        );
        if (authorityFailure) {
          terminalState = authorityFailure.terminalState;
          terminalReason = authorityFailure.terminalReason;
          eventAction = 'request.failed';
        }
      }

      if (terminalState && terminalReason) {
        return transitionSigningRequestTerminal(
          transaction,
          request,
          terminalState,
          terminalReason,
          eventAction,
          null,
          'Signing request lifecycle reconciled.',
        );
      }
      return request;
    });
  }

  private async evaluateBoundSigningAuthority(
    request: Prisma.SigningRequestGetPayload<Record<string, never>>,
    credential: {
      ownerType: SigningCredentialOwnerType;
      ownerUserId: string | null;
      signingOrganizationId: string | null;
    } | null,
    transaction: Prisma.TransactionClient,
  ): Promise<{ terminalState: SigningRequestState; terminalReason: string } | null> {
    if (!credential) {
      return {
        terminalState: SigningRequestState.FAILED,
        terminalReason: 'CREDENTIAL_UNAVAILABLE',
      };
    }

    const boundUserId =
      request.kind === SigningKind.PERSON_SIGNATURE
        ? request.intendedSignerUserId
        : request.requestedByUserId;
    if (!boundUserId) {
      return {
        terminalState: SigningRequestState.FAILED,
        terminalReason: 'BOUND_AUTHORITY_MISSING',
      };
    }

    const boundUser = await transaction.user.findUnique({
      where: { id: boundUserId },
      select: { status: true, userType: true },
    });
    if (
      !boundUser ||
      boundUser.status !== UserStatus.ACTIVE ||
      boundUser.userType !== UserType.INTERNAL
    ) {
      return {
        terminalState: SigningRequestState.FAILED,
        terminalReason: 'BOUND_ACTOR_INACTIVE',
      };
    }

    const boundPermissions = await this.permissions.getEffectivePermissionCodes(
      boundUserId,
      transaction,
    );
    const boundDocumentAccess = await this.documents.hasAuthorizedDocumentAccess(
      request.documentId,
      boundUserId,
      transaction,
    );
    if (!boundDocumentAccess) {
      return {
        terminalState: SigningRequestState.FAILED,
        terminalReason: 'BOUND_ACTOR_DOCUMENT_ACCESS_LOST',
      };
    }

    if (request.kind === SigningKind.PERSON_SIGNATURE) {
      if (!boundPermissions.includes(SIGNING_PERMISSIONS.SIGN)) {
        return {
          terminalState: SigningRequestState.FAILED,
          terminalReason: 'SIGN_PERMISSION_LOST',
        };
      }
      if (
        credential.ownerType !== SigningCredentialOwnerType.USER ||
        credential.ownerUserId !== boundUserId
      ) {
        return {
          terminalState: SigningRequestState.FAILED,
          terminalReason: 'CREDENTIAL_OWNER_MISMATCH',
        };
      }
      return null;
    }

    if (!boundPermissions.includes(SIGNING_PERMISSIONS.SEAL)) {
      return {
        terminalState: SigningRequestState.FAILED,
        terminalReason: 'SEAL_PERMISSION_LOST',
      };
    }
    if (
      credential.ownerType !== SigningCredentialOwnerType.ORGANIZATION ||
      credential.signingOrganizationId !== request.signingOrganizationId
    ) {
      return {
        terminalState: SigningRequestState.FAILED,
        terminalReason: 'SIGNING_ORGANIZATION_MISMATCH',
      };
    }
    const grantActive = await this.hasActiveSealGrant(
      request.signingCredentialId,
      boundUserId,
      transaction,
    );
    if (!grantActive) {
      return {
        terminalState: SigningRequestState.FAILED,
        terminalReason: 'SEAL_GRANT_REVOKED',
      };
    }
    return null;
  }

  private async assertActiveSealGrant(
    credentialId: string,
    userId: string,
    signingOrganizationId: string,
  ): Promise<void> {
    const active = await this.hasActiveSealGrant(credentialId, userId);
    if (!active) {
      throw signingForbidden(
        'SIGNING_SEAL_GRANT_REQUIRED',
        'Organization seal requires an active credential mandate grant.',
      );
    }
    const credential = await this.prisma.signingCredential.findUnique({
      where: { id: credentialId },
      select: { signingOrganizationId: true },
    });
    if (credential?.signingOrganizationId !== signingOrganizationId) {
      throw signingForbidden(
        'SIGNING_ORGANIZATION_MISMATCH',
        'Credential does not belong to the requested organization.',
      );
    }
  }

  private async hasActiveSealGrant(
    credentialId: string,
    userId: string,
    transaction: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    const now = new Date();
    const grant = await transaction.signingCredentialGrant.findFirst({
      where: {
        credentialId,
        userId,
        allowedAction: SigningGrantAction.USE_ORGANIZATION_SEAL,
        revokedAt: null,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    });
    return Boolean(grant);
  }

  private async assertManageCredentials(actorUserId: string): Promise<void> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    this.assertPermission(permissions, SIGNING_PERMISSIONS.MANAGE_CREDENTIALS);
  }

  private async assertActiveInternalUser(actorUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { status: true, userType: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE || user.userType !== UserType.INTERNAL) {
      throw signingForbidden('SIGNING_ACTOR_INACTIVE', 'Signing actor is not active.');
    }
  }

  private assertPermission(permissions: string[], code: string): void {
    if (!permissions.includes(code)) {
      throw signingForbidden('SIGNING_PERMISSION_DENIED', 'Signing permission was denied.');
    }
  }

  private rejectSecretMaterial(body: unknown): void {
    if (!body || typeof body !== 'object') {
      return;
    }
    for (const key of Object.keys(body)) {
      const normalized = key.toLowerCase();
      if (
        normalized.includes('privatekey') ||
        normalized === 'pin' ||
        normalized === 'puk' ||
        normalized.includes('p12') ||
        normalized.includes('pfx') ||
        normalized.includes('tokensecret')
      ) {
        throw signingBadRequest(
          'SIGNING_SECRET_MATERIAL_REJECTED',
          'Private keys, PINs, and token secrets cannot be submitted.',
        );
      }
    }
  }

  async submitSigningResult(
    requestId: string,
    body: SigningResultSubmitRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<SigningRequestDetailResponse> {
    this.rejectSecretMaterial(body);
    const request = await this.loadAuthorizedRequest(requestId, actorUserId);
    const refreshed = await this.refreshRequestState(request.id);

    if (refreshed.state === SigningRequestState.COMPLETED) {
      if (refreshed.acceptedResultSha256 === body.resultSha256) {
        return { request: this.toSummary(refreshed) };
      }
      throw signingConflict(
        'SIGNING_RESULT_ALREADY_ACCEPTED',
        'This signing request already accepted a different signed result.',
      );
    }
    if (refreshed.state !== SigningRequestState.AWAITING_RESULT) {
      throw signingConflict(
        'SIGNING_REQUEST_NOT_AWAITING_RESULT',
        'Signing request is not awaiting a signed result.',
      );
    }

    await this.assertBoundActorForResultSubmission(refreshed, actorUserId);

    const pdfBuffer = Buffer.from(body.pdfBase64, 'base64');
    if (pdfBuffer.length === 0 || pdfBuffer.length > DocumentSigningService.signingResultMaxBytes) {
      throw signingBadRequest(
        'SIGNING_RESULT_TOO_LARGE',
        'Signed PDF result exceeds allowed size.',
      );
    }
    const resultSha256 = createHash('sha256').update(pdfBuffer).digest('hex');
    if (resultSha256 !== body.resultSha256) {
      throw signingBadRequest(
        'SIGNING_RESULT_HASH_MISMATCH',
        'Result checksum does not match payload.',
      );
    }

    if (!refreshed.preparedSigningStorageKey || !refreshed.preparedSigningArtifactSha256) {
      throw signingConflict(
        'SIGNING_PREPARED_ARTIFACT_MISSING',
        'Signing request has no prepared artifact binding.',
      );
    }
    const preparedPdf = await this.storage.get(refreshed.preparedSigningStorageKey);
    if (
      createHash('sha256').update(preparedPdf).digest('hex') !==
      refreshed.preparedSigningArtifactSha256
    ) {
      throw signingConflict(
        'SIGNING_PREPARED_ARTIFACT_STALE',
        'Prepared signing artifact no longer matches the request binding.',
      );
    }

    const { anchors, version: trustStoreVersion } = this.resolveTrustAnchorPems();
    const validation = await this.pdfValidator.validateSignedPdf({
      preparedArtifactPdf: preparedPdf,
      signedPdf: pdfBuffer,
      expectedCredentialFingerprintSha256: refreshed.credentialFingerprintSha256,
      trustAnchorPems: anchors,
      trustStoreVersion,
    });

    const quarantineKey = `signing-quarantine/${requestId}/${randomUUID()}.pdf`;
    await this.storage.put(quarantineKey, pdfBuffer);

    try {
      if (validation.overallResult !== 'VALID') {
        await this.persistRejectedValidation(refreshed, validation, actorUserId, context);
        const rejected = await this.prisma.signingRequest.findUniqueOrThrow({
          where: { id: requestId },
        });
        return { request: this.toSummary(rejected) };
      }

      const accepted = await this.acceptValidatedResult(
        refreshed,
        pdfBuffer,
        validation,
        actorUserId,
        context,
      );
      return { request: this.toSummary(accepted) };
    } finally {
      await this.storage.delete(quarantineKey).catch(() => undefined);
    }
  }

  private async assertBoundActorForResultSubmission(
    request: Prisma.SigningRequestGetPayload<Record<string, never>>,
    actorUserId: string,
  ): Promise<void> {
    const boundUserId =
      request.kind === SigningKind.PERSON_SIGNATURE
        ? request.intendedSignerUserId
        : request.requestedByUserId;
    if (boundUserId !== actorUserId) {
      throw signingForbidden(
        'SIGNING_RESULT_ACTOR_REQUIRED',
        'Signed results must be submitted by the bound signing authority.',
      );
    }
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    if (request.kind === SigningKind.PERSON_SIGNATURE) {
      this.assertPermission(permissions, SIGNING_PERMISSIONS.SIGN);
    } else {
      this.assertPermission(permissions, SIGNING_PERMISSIONS.SEAL);
      await this.assertActiveSealGrant(
        request.signingCredentialId,
        actorUserId,
        request.signingOrganizationId!,
      );
    }
  }

  private mapOverallResult(
    value: 'VALID' | 'INVALID' | 'INDETERMINATE',
  ): SignatureValidationOverallResult {
    if (value === 'VALID') return SignatureValidationOverallResult.VALID;
    if (value === 'INDETERMINATE') return SignatureValidationOverallResult.INDETERMINATE;
    return SignatureValidationOverallResult.INVALID;
  }

  private async persistRejectedValidation(
    request: Prisma.SigningRequestGetPayload<Record<string, never>>,
    validation: PdfSignatureValidationOutcome,
    actorUserId: string,
    context: RequestContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await lockSigningRequest(transaction, request.id);
      const current = await transaction.signingRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      if (current.state !== SigningRequestState.AWAITING_RESULT) {
        return;
      }
      await transaction.signatureValidation.create({
        data: {
          signingRequestId: request.id,
          inputSourceSha256: validation.inputSourceSha256,
          inputResultSha256: validation.inputResultSha256,
          overallResult: this.mapOverallResult(validation.overallResult),
          cmsCryptoResult: validation.cmsCryptoResult,
          byteRangeResult: validation.byteRangeResult,
          sourceBindingResult: validation.sourceBindingResult,
          certificateValidityResult: validation.certificateValidityResult,
          chainTrustResult: validation.chainTrustResult,
          timestampResult: validation.timestampResult,
          validatorName: PDF_SIGNATURE_VALIDATOR_NAME,
          validatorVersion: PDF_SIGNATURE_VALIDATOR_VERSION,
          policyVersion: validation.policyVersion,
          trustStoreVersion: validation.trustStoreVersion,
          reasonCode: validation.reasonCode,
        },
      });
      await transitionSigningRequestTerminal(
        transaction,
        current,
        SigningRequestState.VALIDATION_REJECTED,
        validation.reasonCode ?? 'VALIDATION_REJECTED',
        'result.rejected',
        actorUserId,
        'Signed result rejected after independent validation.',
      );
    });
    await this.signingAudit.recordPlatformAudit('result.rejected', context, {
      actorUserId,
      signingRequestId: request.id,
      metadataSummary: validation.reasonCode ?? 'VALIDATION_REJECTED',
    });
  }

  private async assertPublicationPreconditions(
    locked: Prisma.SigningRequestGetPayload<Record<string, never>>,
    actorUserId: string,
    preReadSourceSha256: string,
    transaction: Prisma.TransactionClient,
    phase: 'initial' | 'final',
  ): Promise<void> {
    if (locked.expiresAt.getTime() <= Date.now()) {
      throw signingConflict(
        'SIGNING_REQUEST_EXPIRED',
        'Signing request expired before acceptance.',
      );
    }

    if (phase === 'final') {
      await lockDocumentRow(transaction, locked.documentId);
      if (locked.sourceSnapshotSha256) {
        await lockAuthoritativeFinancialSourceRow(transaction, locked.documentId);
      }
    }

    const document = await transaction.document.findUniqueOrThrow({
      where: { id: locked.documentId },
      select: { currentVersionId: true },
    });
    if (document.currentVersionId !== locked.sourceVersionId) {
      throw signingConflict('SIGNING_SOURCE_STALE', 'Source version is no longer current.');
    }

    if (preReadSourceSha256 !== locked.sourceSha256) {
      throw signingConflict('SIGNING_SOURCE_STALE', 'Source bytes changed.');
    }

    if (locked.sourceSnapshotSha256) {
      const liveFingerprint = await this.sourceSnapshot.computeCurrentFingerprint(
        locked.documentId,
        transaction,
      );
      if (liveFingerprint !== locked.sourceSnapshotSha256) {
        throw signingConflict(
          'SIGNING_SOURCE_BUSINESS_STALE',
          'Authoritative business source changed.',
        );
      }
    }

    await this.assertAcceptanceAuthority(locked, actorUserId, transaction, phase);
  }

  private async assertAcceptanceAuthority(
    current: Prisma.SigningRequestGetPayload<Record<string, never>>,
    actorUserId: string,
    transaction: Prisma.TransactionClient,
    phase: 'initial' | 'final',
  ): Promise<void> {
    const approval = await transaction.documentSigningApproval.findUnique({
      where: { signingRequestId: current.id },
    });
    if (!approval || approval.bindingHash !== current.bindingHash) {
      throw signingConflict(
        'SIGNING_APPROVAL_BINDING_INVALID',
        'Signing approval no longer matches the request binding.',
      );
    }

    const boundUserId =
      current.kind === SigningKind.PERSON_SIGNATURE
        ? current.intendedSignerUserId
        : current.requestedByUserId;
    if (boundUserId !== actorUserId) {
      throw signingForbidden(
        'SIGNING_RESULT_ACTOR_REQUIRED',
        'Signed results must be submitted by the bound signing authority.',
      );
    }

    if (phase === 'final') {
      await lockBoundUserRolePermissions(transaction, boundUserId);
      await lockSigningCredentialRow(transaction, current.signingCredentialId);
      if (current.kind === SigningKind.ORGANIZATION_SEAL) {
        await lockActiveSealGrants(transaction, current.signingCredentialId, boundUserId);
      }
    }

    const credential = await transaction.signingCredential.findUnique({
      where: { id: current.signingCredentialId },
      select: {
        status: true,
        validFrom: true,
        validTo: true,
        ownerType: true,
        ownerUserId: true,
        signingOrganizationId: true,
        certificateFingerprintSha256: true,
      },
    });
    const now = new Date();
    if (
      !credential ||
      credential.status !== SigningCredentialStatus.ENABLED ||
      credential.validFrom > now ||
      credential.validTo <= now ||
      credential.certificateFingerprintSha256 !== current.credentialFingerprintSha256
    ) {
      throw signingConflict(
        'SIGNING_CREDENTIAL_UNAVAILABLE',
        'Signing credential is no longer valid.',
      );
    }

    const authorityFailure = await this.evaluateBoundSigningAuthority(
      current,
      credential,
      transaction,
    );
    if (authorityFailure) {
      throw signingConflict(
        authorityFailure.terminalReason,
        'Bound signing authority is no longer valid for acceptance.',
      );
    }
  }

  private async acceptValidatedResult(
    request: Prisma.SigningRequestGetPayload<Record<string, never>>,
    signedPdf: Buffer,
    validation: PdfSignatureValidationOutcome,
    actorUserId: string,
    context: RequestContext,
  ): Promise<Prisma.SigningRequestGetPayload<Record<string, never>>> {
    const sourceVersionRow = await this.prisma.documentVersion.findUniqueOrThrow({
      where: { id: request.sourceVersionId },
      select: { storageKey: true, filename: true, originalFilename: true },
    });
    const preReadSourcePdf = await this.storage.get(sourceVersionRow.storageKey);
    const preReadSourceSha256 = createHash('sha256').update(preReadSourcePdf).digest('hex');

    const storageKey = `documents/${request.documentId}/${randomUUID()}-signed.pdf`;
    const evidenceKey = `signing-evidence/${randomUUID()}.json`;
    const evidencePayload = Buffer.from(validation.boundedEvidenceJson, 'utf8');
    const stagedKeys = [storageKey, evidenceKey];
    await this.storage.put(storageKey, signedPdf);
    await this.storage.put(evidenceKey, evidencePayload);

    try {
      const completed = await this.prisma.$transaction(
        async (transaction) => {
          await runSigningAcceptanceBarrierIfConfigured();

          await lockSigningRequest(transaction, request.id);
          const locked = await transaction.signingRequest.findUniqueOrThrow({
            where: { id: request.id },
          });
          if (locked.state === SigningRequestState.COMPLETED) {
            return locked;
          }
          if (locked.state !== SigningRequestState.AWAITING_RESULT) {
            throw signingConflict(
              'SIGNING_REQUEST_NOT_AWAITING_RESULT',
              'Signing request is not awaiting a signed result.',
            );
          }

          await this.assertPublicationPreconditions(
            locked,
            actorUserId,
            preReadSourceSha256,
            transaction,
            'initial',
          );

          await runSigningPostAuthorityBarrierIfConfigured();
          await this.assertPublicationPreconditions(
            locked,
            actorUserId,
            preReadSourceSha256,
            transaction,
            'final',
          );

          if (process.env.SIGNING_TEST_PUBLICATION_SERIALIZATION === '1') {
            throw new Prisma.PrismaClientKnownRequestError('Serialization failure (test hook).', {
              code: 'P2034',
              clientVersion: 'test',
            });
          }

          if (process.env.SIGNING_TEST_FORCE_PUBLICATION_ROLLBACK === locked.id) {
            throw signingConflict(
              'SIGNING_TEST_PUBLICATION_ROLLBACK',
              'Test-only publication rollback.',
            );
          }

          const lastVersion = await transaction.documentVersion.findFirst({
            where: { documentId: locked.documentId },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          });
          const signedVersion = await transaction.documentVersion.create({
            data: {
              documentId: locked.documentId,
              versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
              filename: sourceVersionRow.filename.replace(/\.pdf$/i, '') + '-signed.pdf',
              originalFilename: sourceVersionRow.originalFilename,
              storageKey,
              mimeType: 'application/pdf',
              sizeBytes: BigInt(signedPdf.length),
              checksumSha256: validation.inputResultSha256,
              outputFamily: 'PDF',
              source: DocumentVersionSource.SIGNED,
              derivedFromVersionId: locked.sourceVersionId,
              createdByUserId: actorUserId,
              status: DocumentStatus.ACTIVE,
            },
          });

          const signatureValidation = await transaction.signatureValidation.create({
            data: {
              signingRequestId: locked.id,
              inputSourceSha256: validation.inputPreparedArtifactSha256,
              inputResultSha256: validation.inputResultSha256,
              overallResult: SignatureValidationOverallResult.VALID,
              cmsCryptoResult: validation.cmsCryptoResult,
              byteRangeResult: validation.byteRangeResult,
              sourceBindingResult: validation.sourceBindingResult,
              certificateValidityResult: validation.certificateValidityResult,
              chainTrustResult: validation.chainTrustResult,
              timestampResult: validation.timestampResult,
              validatorName: PDF_SIGNATURE_VALIDATOR_NAME,
              validatorVersion: PDF_SIGNATURE_VALIDATOR_VERSION,
              policyVersion: validation.policyVersion,
              trustStoreVersion: validation.trustStoreVersion,
            },
          });

          await transaction.signingEvidence.create({
            data: {
              signatureValidationId: signatureValidation.id,
              storageKey: evidenceKey,
              sizeBytes: BigInt(evidencePayload.length),
              mimeType: 'application/json',
            },
          });
          if (process.env.SIGNING_TEST_PUBLICATION_FAIL_AFTER === 'post_evidence') {
            throw signingConflict(
              'SIGNING_TEST_PUBLICATION_ROLLBACK',
              'Test-only publication rollback after evidence staging.',
            );
          }

          await transaction.documentSignature.create({
            data: {
              signingRequestId: locked.id,
              documentId: locked.documentId,
              sourceVersionId: locked.sourceVersionId,
              signedVersionId: signedVersion.id,
              kind: locked.kind,
              intendedSignerUserId: locked.intendedSignerUserId,
              signingOrganizationId: locked.signingOrganizationId,
              performingOperatorUserId: actorUserId,
              certificateFingerprintSha256: validation.certificateFingerprintSha256!,
              certificateSubjectSummary: validation.certificateSubjectSummary!,
              certificateIssuerSummary: validation.certificateIssuerSummary!,
              acceptanceValidationId: signatureValidation.id,
            },
          });

          const completedRequest = await transaction.signingRequest.update({
            where: { id: locked.id },
            data: {
              state: SigningRequestState.COMPLETED,
              terminalReason: 'SIGNATURE_ACCEPTED',
              acceptedSignedVersionId: signedVersion.id,
              acceptedResultSha256: validation.inputResultSha256,
            },
          });

          await transaction.document.update({
            where: { id: locked.documentId },
            data: { currentVersionId: signedVersion.id },
          });

          await appendSigningEventInTransaction(transaction, {
            signingRequestId: locked.id,
            action: 'signature.accepted',
            actorUserId,
            metadataSummary: 'Signed PDF accepted after validation.',
          });
          await appendSigningEventInTransaction(transaction, {
            signingRequestId: locked.id,
            action: 'signed_version.published',
            actorUserId,
            metadataSummary: `Signed version ${signedVersion.versionNumber} published.`,
          });

          return completedRequest;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      await this.signingAudit.recordPlatformAudit('signature.accepted', context, {
        actorUserId,
        signingRequestId: request.id,
        metadataSummary: 'Signed PDF validated and published.',
      });
      return completed;
    } catch (error) {
      for (const key of stagedKeys) {
        await this.storage.delete(key).catch(() => undefined);
      }
      if (isSigningPublicationSerializationConflict(error)) {
        const latest = await this.prisma.signingRequest.findUnique({
          where: { id: request.id },
        });
        if (
          latest?.state === SigningRequestState.COMPLETED &&
          latest.acceptedResultSha256 === validation.inputResultSha256
        ) {
          return latest;
        }
        throw signingConflict(
          'SIGNING_PUBLICATION_SERIALIZATION_CONFLICT',
          'Publication could not commit safely; retry submission after re-validation.',
        );
      }
      throw error;
    }
  }

  private toSummary(request: {
    id: string;
    documentId: string;
    sourceVersionId: string;
    sourceSha256: string;
    sourceSnapshotSha256: string | null;
    kind: SigningKind;
    state: SigningRequestState;
    methodIdentifier: string;
    policyVersion: string;
    expiresAt: Date;
    terminalReason: string | null;
    bindingHash: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: request.id,
      documentId: request.documentId,
      sourceVersionId: request.sourceVersionId,
      sourceSha256: request.sourceSha256,
      sourceSnapshotSha256: request.sourceSnapshotSha256,
      kind: request.kind,
      state: request.state,
      methodIdentifier: request.methodIdentifier,
      policyVersion: request.policyVersion,
      expiresAt: request.expiresAt.toISOString(),
      terminalReason: request.terminalReason,
      bindingHash: request.bindingHash,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }
}
