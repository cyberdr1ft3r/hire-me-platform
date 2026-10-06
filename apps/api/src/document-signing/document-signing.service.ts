import { Inject, Injectable } from '@nestjs/common';
import type {
  SigningCredentialCreateRequest,
  SigningCredentialGrantCreateRequest,
  SigningOrganizationCreateRequest,
  SigningRequestApproveRequest,
  SigningRequestAuditResponse,
  SigningRequestCreateRequest,
  SigningRequestDetailResponse,
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
  signingBadRequest,
  signingConflict,
  signingForbidden,
  signingNotFound,
} from './document-signing.errors.js';
import { SIGNING_PERMISSIONS } from './document-signing-permissions.js';
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
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

const activeStates: SigningRequestState[] = [
  SigningRequestState.PREPARED,
  SigningRequestState.APPROVED,
  SigningRequestState.AWAITING_RESULT,
];

@Injectable()
export class DocumentSigningService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(DocumentSigningAuditService) private readonly signingAudit: DocumentSigningAuditService,
  ) {}

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
        const latest = await transaction.signingEvent.findFirst({
          where: { signingRequestId: created.id },
          orderBy: { sequence: 'desc' },
          select: { sequence: true },
        });
        await transaction.signingEvent.create({
          data: {
            signingRequestId: created.id,
            sequence: (latest?.sequence ?? -1) + 1,
            action: 'request.prepared',
            actorUserId,
            metadataSummary: 'Signing request prepared for exact document version.',
          },
        });
        return created;
      });

      await this.signingAudit.recordPlatformAudit('request.prepared', context, {
        actorUserId,
        signingRequestId: request.id,
        metadataSummary: 'Signing request prepared.',
      });

      const refreshed = await this.refreshRequestState(request.id, actorUserId);
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
              { sourceVersionId: versionId, state: { in: activeStates } },
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
            const refreshed = await this.refreshRequestState(existing.id, actorUserId);
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
    const refreshed = await this.refreshRequestState(request.id, actorUserId);
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
    const refreshed = await this.refreshRequestState(request.id, actorUserId);
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

    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.signingRequest.findUnique({ where: { id: requestId } });
      if (!current || current.state !== SigningRequestState.PREPARED) {
        throw signingConflict('SIGNING_REQUEST_NOT_PREPARED', 'Signing request is not approvable.');
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
        data: { state: SigningRequestState.AWAITING_RESULT },
      });
    });

    await this.signingAudit.recordPlatformAudit('request.approved', context, {
      actorUserId,
      signingRequestId: requestId,
      metadataSummary: 'Signing request approved for exact binding.',
    });
    await this.signingAudit.appendSigningEvent(
      requestId,
      'request.approved',
      actorUserId,
      'Signing request approved.',
    );
    await this.signingAudit.appendSigningEvent(
      requestId,
      'request.awaiting_result',
      actorUserId,
      'Signing request awaiting provider result (Phase B).',
    );

    const finalRequest = await this.refreshRequestState(requestId, actorUserId);
    return { request: this.toSummary(finalRequest) };
  }

  async cancelSigningRequest(
    requestId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<SigningRequestDetailResponse> {
    const request = await this.loadAuthorizedRequest(requestId, actorUserId);
    const refreshed = await this.refreshRequestState(request.id, actorUserId);
    if (!activeStates.includes(refreshed.state)) {
      throw signingConflict(
        'SIGNING_REQUEST_NOT_CANCELLABLE',
        'Signing request cannot be cancelled.',
      );
    }
    if (refreshed.requestedByUserId !== actorUserId) {
      const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
      this.assertPermission(permissions, SIGNING_PERMISSIONS.APPROVE_SIGNING);
    }

    await this.prisma.signingRequest.update({
      where: { id: requestId },
      data: {
        state: SigningRequestState.CANCELLED,
        terminalReason: 'CANCELLED_BY_ACTOR',
      },
    });
    await this.signingAudit.recordPlatformAudit('request.cancelled', context, {
      actorUserId,
      signingRequestId: requestId,
      metadataSummary: 'Signing request cancelled.',
    });
    await this.signingAudit.appendSigningEvent(
      requestId,
      'request.cancelled',
      actorUserId,
      'Signing request cancelled.',
      'CANCELLED_BY_ACTOR',
    );
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

  private async refreshRequestState(requestId: string, actorUserId: string) {
    const request = await this.prisma.signingRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    if (!activeStates.includes(request.state)) {
      return request;
    }

    let terminalState: SigningRequestState | null = null;
    let terminalReason: string | null = null;

    if (request.expiresAt.getTime() <= Date.now()) {
      terminalState = SigningRequestState.EXPIRED;
      terminalReason = 'REQUEST_EXPIRED';
    }

    const document = await this.prisma.document.findUnique({
      where: { id: request.documentId },
      select: { currentVersionId: true },
    });
    if (!terminalState && document?.currentVersionId !== request.sourceVersionId) {
      terminalState = SigningRequestState.STALE;
      terminalReason = 'SOURCE_VERSION_NO_LONGER_CURRENT';
    }

    const version = await this.prisma.documentVersion.findUnique({
      where: { id: request.sourceVersionId },
      select: { checksumSha256: true, sourceSnapshotSha256: true },
    });
    if (
      !terminalState &&
      version &&
      (version.checksumSha256 !== request.sourceSha256 ||
        version.sourceSnapshotSha256 !== request.sourceSnapshotSha256)
    ) {
      terminalState = SigningRequestState.STALE;
      terminalReason = 'SOURCE_BINDING_CHANGED';
    }

    const credential = await this.prisma.signingCredential.findUnique({
      where: { id: request.signingCredentialId },
      select: { status: true },
    });
    if (!terminalState && credential?.status !== SigningCredentialStatus.ENABLED) {
      terminalState = SigningRequestState.FAILED;
      terminalReason = 'CREDENTIAL_DISABLED';
    }

    if (!terminalState && request.kind === SigningKind.ORGANIZATION_SEAL) {
      const grantActive = await this.hasActiveSealGrant(request.signingCredentialId, actorUserId);
      if (!grantActive) {
        terminalState = SigningRequestState.FAILED;
        terminalReason = 'SEAL_GRANT_REVOKED';
      }
    }

    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    const documentAccess = await this.documents.hasAuthorizedDocumentAccess(
      request.documentId,
      actorUserId,
    );
    if (!terminalState && !documentAccess) {
      terminalState = SigningRequestState.FAILED;
      terminalReason = 'ACTOR_AUTHORIZATION_LOST';
    }
    if (!terminalState && request.kind === SigningKind.PERSON_SIGNATURE) {
      if (!permissions.includes(SIGNING_PERMISSIONS.SIGN)) {
        terminalState = SigningRequestState.FAILED;
        terminalReason = 'SIGN_PERMISSION_LOST';
      }
    }
    if (!terminalState && request.kind === SigningKind.ORGANIZATION_SEAL) {
      if (!permissions.includes(SIGNING_PERMISSIONS.SEAL)) {
        terminalState = SigningRequestState.FAILED;
        terminalReason = 'SEAL_PERMISSION_LOST';
      }
    }

    if (terminalState) {
      return this.prisma.signingRequest.update({
        where: { id: requestId },
        data: { state: terminalState, terminalReason },
      });
    }
    return request;
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

  private async hasActiveSealGrant(credentialId: string, userId: string): Promise<boolean> {
    const now = new Date();
    const grant = await this.prisma.signingCredentialGrant.findFirst({
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
