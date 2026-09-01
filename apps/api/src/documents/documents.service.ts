import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { inflateRawSync } from 'node:zlib';

import { Inject, Injectable } from '@nestjs/common';
import type {
  DocumentCreateRequest,
  DocumentDetailResponse,
  DocumentListQuery,
  DocumentListResponse,
  DocumentUpdateRequest,
  DocumentVersionCreateRequest,
  DocumentVersionListResponse,
} from '@hire-me/contracts';

import { DocumentAuditService } from './document-audit.service.js';
import { DOCUMENT_PERMISSIONS } from './document-permissions.js';
import { badRequest, conflict, forbidden, notFound } from './document.errors.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import { CANDIDATE_PERMISSIONS } from '../candidates/candidate-permissions.js';
import { CLIENT_PERMISSIONS } from '../clients/client-permissions.js';
import { MISSION_PERMISSIONS } from '../missions/mission-permissions.js';
import {
  CandidateStatus,
  ClientStatus,
  DocumentStatus,
  DocumentType,
  DocumentVersionSource,
  DocumentVisibility,
  InterviewStatus,
  AssignmentStatus,
  Prisma,
  RecruitmentMissionState,
  UserStatus,
  UserType,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { ProtectedStorageService } from '../storage/protected-storage.service.js';

type PrismaTransaction = Prisma.TransactionClient;
type DocumentRecord = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;
type DocumentVersionRecord = Prisma.DocumentVersionGetPayload<Record<string, never>>;
type PreparedVersion = {
  buffer: Buffer;
  filename: string;
  originalFilename: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  outputFamily: DocumentVersionCreateRequest['outputFamily'] | undefined;
};
type DocumentPermission = (typeof DOCUMENT_PERMISSIONS)[keyof typeof DOCUMENT_PERMISSIONS];
type FilePolicy = {
  extensions: readonly string[];
  signatures: readonly ((buffer: Buffer) => boolean)[];
  outputFamily: DocumentVersionCreateRequest['outputFamily'] | undefined;
};

const maxDocumentFileSizeBytes = 4_000_000;
const dangerousExtensionPattern = /\.(exe|bat|cmd|com|scr|js|jar|zip|rar|7z|tar|gz)$/i;
const ooxmlDocxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ooxmlXlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const filePolicies = new Map<string, FilePolicy>([
  [
    'application/pdf',
    {
      extensions: ['.pdf'],
      signatures: [(buffer) => buffer.subarray(0, 4).toString() === '%PDF'],
      outputFamily: 'PDF',
    },
  ],
  [
    'image/jpeg',
    {
      extensions: ['.jpg', '.jpeg'],
      signatures: [(buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff],
      outputFamily: 'OTHER',
    },
  ],
  [
    'image/png',
    {
      extensions: ['.png'],
      signatures: [
        (buffer) => buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
      ],
      outputFamily: 'OTHER',
    },
  ],
  [
    'application/msword',
    {
      extensions: ['.doc'],
      signatures: [
        (buffer) => buffer.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')),
      ],
      outputFamily: 'WORD',
    },
  ],
  [
    ooxmlDocxMime,
    {
      extensions: ['.docx'],
      signatures: [(buffer) => looksLikeOoxml(buffer, 'docx')],
      outputFamily: 'WORD',
    },
  ],
  [
    ooxmlXlsxMime,
    {
      extensions: ['.xlsx'],
      signatures: [(buffer) => looksLikeOoxml(buffer, 'xlsx')],
      outputFamily: 'EXCEL',
    },
  ],
  [
    'text/plain',
    {
      extensions: ['.txt'],
      signatures: [(buffer) => !buffer.includes(0) && buffer.toString('utf8').length > 0],
      outputFamily: 'OTHER',
    },
  ],
]);

const writableMissionStates = new Set<RecruitmentMissionState>([
  RecruitmentMissionState.DRAFT,
  RecruitmentMissionState.INTERNAL_VALIDATION,
  RecruitmentMissionState.ACTIVE,
  RecruitmentMissionState.JOB_DESCRIPTION_APPROVED,
  RecruitmentMissionState.CANDIDATE_SOURCING,
  RecruitmentMissionState.HR_PRESELECTION,
  RecruitmentMissionState.HR_INTERVIEWS,
  RecruitmentMissionState.TECHNICAL_TESTS,
  RecruitmentMissionState.CANDIDATE_PRESENTATION,
  RecruitmentMissionState.CLIENT_INTERVIEWS,
  RecruitmentMissionState.FINAL_SELECTION,
  RecruitmentMissionState.OFFER_SENT,
  RecruitmentMissionState.CANDIDATE_INTEGRATED,
  RecruitmentMissionState.PROBATION_MONITORING,
  RecruitmentMissionState.WAITING_FOR_CLIENT_INFORMATION,
  RecruitmentMissionState.PAUSED,
]);

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DocumentAuditService) private readonly audit: DocumentAuditService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProtectedStorageService) private readonly storage: ProtectedStorageService,
  ) {}

  async listDocuments(
    query: DocumentListQuery,
    actorUserId: string,
  ): Promise<DocumentListResponse> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    this.assertHasPermission(permissions, DOCUMENT_PERMISSIONS.DOCUMENTS_VIEW);
    const where: Prisma.DocumentWhereInput = {
      AND: [
        this.visibleDocumentWhere(actorUserId, permissions),
        {
          ...(query.status ? { status: query.status } : {}),
          ...(query.documentType ? { documentType: query.documentType } : {}),
          ...(query.clientId ? { clientId: query.clientId } : {}),
          ...(query.candidateId ? { candidateId: query.candidateId } : {}),
          ...(query.recruitmentMissionId
            ? { recruitmentMissionId: query.recruitmentMissionId }
            : {}),
          ...(query.missionCandidateId ? { missionCandidateId: query.missionCandidateId } : {}),
          ...(query.search
            ? {
                OR: [
                  { title: { contains: query.search, mode: 'insensitive' } },
                  {
                    versions: {
                      some: { filename: { contains: query.search, mode: 'insensitive' } },
                    },
                  },
                ],
              }
            : {}),
        },
      ],
    };
    const [total, documents] = await this.prisma.$transaction([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        include: documentInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      documents: documents.map((document) => this.toDocumentSummary(document)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getDocument(documentId: string, actorUserId: string): Promise<DocumentDetailResponse> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    this.assertHasPermission(permissions, DOCUMENT_PERMISSIONS.DOCUMENTS_VIEW);
    const document = await this.findDocument(documentId);
    await this.assertDocumentAccess(document, actorUserId, permissions);
    await this.assertReadableContext(document, this.prisma);
    return { document: this.toDocumentDetail(document) };
  }

  async createDocument(
    input: DocumentCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentDetailResponse> {
    this.assertSupportedDocumentType(input.documentType);
    const documentId = randomUUID();
    const preparedVersion = input.version ? this.prepareVersion(documentId, input.version) : null;
    const storedKeys: string[] = [];

    try {
      if (preparedVersion) {
        await this.storage.put(preparedVersion.storageKey, preparedVersion.buffer);
        storedKeys.push(preparedVersion.storageKey);
      }

      const document = await this.prisma.$transaction(async (transaction) => {
        const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
        this.assertHasPermission(permissions, DOCUMENT_PERMISSIONS.DOCUMENTS_CREATE);
        await this.assertWritableContext(input, actorUserId, permissions, transaction);
        await this.assertOwnerIsEligible(input.ownerUserId ?? actorUserId, transaction);
        const created = await transaction.document.create({
          data: {
            id: documentId,
            title: input.title,
            documentType: input.documentType,
            visibility: input.visibility,
            outputFamily: input.outputFamily,
            ownerUserId: input.ownerUserId ?? actorUserId,
            createdByUserId: actorUserId,
            candidateId: input.context.candidateId,
            clientId: input.context.clientId,
            recruitmentMissionId: input.context.recruitmentMissionId,
            missionCandidateId: input.context.missionCandidateId,
            interviewId: input.context.interviewId,
            status: preparedVersion ? DocumentStatus.ACTIVE : DocumentStatus.DRAFT,
          },
          include: documentInclude,
        });
        let result = created;
        if (preparedVersion) {
          const version = await this.createVersionRecord(
            transaction,
            created.id,
            actorUserId,
            preparedVersion,
          );
          result = await transaction.document.update({
            where: { id: created.id },
            data: { currentVersionId: version.id },
            include: documentInclude,
          });
          await transaction.auditLog.create({
            data: {
              action: 'documents.version.added',
              entityType: 'DocumentVersion',
              entityId: version.id,
              actorUserId,
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
              metadataSummary: `Document version ${version.versionNumber} added.`,
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            action: 'documents.document.created',
            entityType: 'Document',
            entityId: created.id,
            actorUserId,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            metadataSummary: `Document created with type ${created.documentType}.`,
          },
        });
        return result;
      });

      return { document: this.toDocumentDetail(document) };
    } catch (error: unknown) {
      await this.deleteStoredFiles(storedKeys);
      throw error;
    }
  }

  async updateDocument(
    documentId: string,
    input: DocumentUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentDetailResponse> {
    const document = await this.withWritableDocumentLock(
      documentId,
      actorUserId,
      DOCUMENT_PERMISSIONS.DOCUMENTS_UPDATE,
      async (transaction) => {
        const updated = await this.updateDocumentMetadata(documentId, input, transaction);
        await this.createAuditLog(transaction, 'documents.document.metadata_updated', context, {
          actorUserId,
          entityType: 'Document',
          entityId: updated.id,
          metadataSummary: 'Approved document metadata updated.',
        });
        return updated;
      },
    );

    return { document: this.toDocumentDetail(document) };
  }

  async archiveDocument(
    documentId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentDetailResponse> {
    const document = await this.withWritableDocumentLock(
      documentId,
      actorUserId,
      DOCUMENT_PERMISSIONS.DOCUMENTS_ARCHIVE,
      async (transaction) => {
        const archived = await transaction.document.update({
          where: { id: documentId },
          data: { status: DocumentStatus.ARCHIVED, archivedAt: new Date() },
          include: documentInclude,
        });
        await this.createAuditLog(transaction, 'documents.document.archived', context, {
          actorUserId,
          entityType: 'Document',
          entityId: archived.id,
          metadataSummary: 'Document archived; historical versions preserved.',
        });
        return archived;
      },
    );

    return { document: this.toDocumentDetail(document) };
  }

  async listVersions(
    documentId: string,
    actorUserId: string,
  ): Promise<DocumentVersionListResponse> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    this.assertHasPermission(permissions, DOCUMENT_PERMISSIONS.DOCUMENTS_VIEW);
    const document = await this.findDocument(documentId);
    await this.assertDocumentAccess(document, actorUserId, permissions);
    await this.assertReadableContext(document, this.prisma);
    return { versions: document.versions.map((version) => this.toDocumentVersion(version)) };
  }

  async addUploadedVersion(
    documentId: string,
    input: DocumentVersionCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentDetailResponse> {
    const preparedVersion = this.prepareVersion(documentId, input);
    const storedKeys: string[] = [];

    try {
      await this.storage.put(preparedVersion.storageKey, preparedVersion.buffer);
      storedKeys.push(preparedVersion.storageKey);

      const document = await this.withWritableDocumentLock(
        documentId,
        actorUserId,
        DOCUMENT_PERMISSIONS.DOCUMENTS_VERSION_CREATE,
        async (transaction) => {
          const version = await this.createVersionRecord(
            transaction,
            documentId,
            actorUserId,
            preparedVersion,
          );
          await transaction.auditLog.create({
            data: {
              action: 'documents.version.added',
              entityType: 'DocumentVersion',
              entityId: version.id,
              actorUserId,
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
              metadataSummary: `Document version ${version.versionNumber} added.`,
            },
          });
          return transaction.document.update({
            where: { id: documentId },
            data: { currentVersionId: version.id, status: DocumentStatus.ACTIVE },
            include: documentInclude,
          });
        },
      );

      return { document: this.toDocumentDetail(document) };
    } catch (error: unknown) {
      await this.deleteStoredFiles(storedKeys);
      throw error;
    }
  }

  async downloadVersion(
    documentId: string,
    versionId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    this.assertHasPermission(permissions, DOCUMENT_PERMISSIONS.DOCUMENTS_DOWNLOAD);
    const document = await this.findDocument(documentId);
    await this.assertDocumentAccess(document, actorUserId, permissions);
    await this.assertReadableContext(document, this.prisma);
    const version = document.versions.find((item) => item.id === versionId);
    if (!version) {
      throw notFound('DOCUMENT_VERSION_NOT_FOUND', 'Document version was not found.');
    }
    if (version.status === DocumentStatus.ARCHIVED || version.archivedAt) {
      throw conflict(
        'DOCUMENT_VERSION_ARCHIVED',
        'Archived document versions cannot be downloaded.',
      );
    }

    const content = await this.storage.get(version.storageKey);

    await this.audit.record('documents.version.downloaded', context, {
      actorUserId,
      entityType: 'DocumentVersion',
      entityId: version.id,
      metadataSummary: 'Document version downloaded through protected storage.',
    });

    return {
      content,
      filename: version.filename,
      mimeType: version.mimeType,
    };
  }

  private async withWritableDocumentLock<T>(
    documentId: string,
    actorUserId: string,
    requiredPermission: DocumentPermission,
    callback: (transaction: PrismaTransaction, document: DocumentRecord) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      const document = await this.lockDocument(documentId, transaction);
      const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
      this.assertHasPermission(permissions, requiredPermission);
      await this.assertDocumentAccess(document, actorUserId, permissions, transaction);
      if (document.status === DocumentStatus.ARCHIVED || document.archivedAt) {
        throw conflict('DOCUMENT_ARCHIVED', 'Archived documents cannot be changed.');
      }
      await this.assertWritableContext(
        {
          documentType: document.documentType,
          context: this.toContext(document),
        } satisfies DocumentContextInput,
        actorUserId,
        permissions,
        transaction,
      );
      return callback(transaction, document);
    });
  }

  private async lockDocument(
    documentId: string,
    transaction: PrismaTransaction,
  ): Promise<DocumentRecord> {
    await transaction.$queryRaw`SELECT id FROM "Document" WHERE id = ${documentId}::uuid FOR UPDATE`;
    const document = await transaction.document.findUnique({
      where: { id: documentId },
      include: documentInclude,
    });
    if (!document) {
      throw notFound('DOCUMENT_NOT_FOUND', 'Document was not found.');
    }
    return document;
  }

  private async createVersionRecord(
    transaction: PrismaTransaction,
    documentId: string,
    actorUserId: string,
    preparedVersion: PreparedVersion,
  ): Promise<DocumentVersionRecord> {
    const lastVersion = await transaction.documentVersion.findFirst({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
    });
    return transaction.documentVersion.create({
      data: {
        documentId,
        versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
        filename: preparedVersion.filename,
        originalFilename: preparedVersion.originalFilename,
        storageKey: preparedVersion.storageKey,
        mimeType: preparedVersion.mimeType,
        sizeBytes: preparedVersion.sizeBytes,
        checksumSha256: preparedVersion.checksumSha256,
        outputFamily: preparedVersion.outputFamily,
        createdByUserId: actorUserId,
        source: DocumentVersionSource.UPLOADED,
      },
    });
  }

  private async updateDocumentMetadata(
    documentId: string,
    input: DocumentUpdateRequest,
    transaction: PrismaTransaction,
  ): Promise<DocumentRecord> {
    if (input.ownerUserId) {
      await this.assertOwnerIsEligible(input.ownerUserId, transaction);
    }
    return transaction.document.update({
      where: { id: documentId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
      },
      include: documentInclude,
    });
  }

  private async assertOwnerIsEligible(
    ownerUserId: string,
    transaction: PrismaTransaction,
  ): Promise<void> {
    const owner = await transaction.user.findUnique({ where: { id: ownerUserId } });
    if (
      !owner ||
      owner.status !== UserStatus.ACTIVE ||
      owner.archivedAt ||
      owner.userType !== UserType.INTERNAL
    ) {
      throw conflict(
        'DOCUMENT_OWNER_INELIGIBLE',
        'Document owner must be an active internal user.',
      );
    }
  }

  private async assertWritableContext(
    input: DocumentContextInput,
    actorUserId: string,
    permissions: string[],
    transaction: PrismaTransaction,
  ): Promise<void> {
    await this.assertDocumentContextScope(input.context, actorUserId, permissions, transaction);
    const client = input.context.clientId
      ? await transaction.client.findUnique({ where: { id: input.context.clientId } })
      : null;
    if (
      input.context.clientId &&
      (!client || client.status === ClientStatus.ARCHIVED || client.archivedAt)
    ) {
      throw conflict('DOCUMENT_CLIENT_CONTEXT_INVALID', 'Document client context is not writable.');
    }
    const candidate = input.context.candidateId
      ? await transaction.candidate.findUnique({ where: { id: input.context.candidateId } })
      : null;
    if (
      input.context.candidateId &&
      (!candidate || candidate.status === CandidateStatus.ARCHIVED || candidate.archivedAt)
    ) {
      throw conflict(
        'DOCUMENT_CANDIDATE_CONTEXT_INVALID',
        'Document candidate context is not writable.',
      );
    }
    const mission = input.context.recruitmentMissionId
      ? await transaction.recruitmentMission.findUnique({
          where: { id: input.context.recruitmentMissionId },
        })
      : null;
    if (
      input.context.recruitmentMissionId &&
      (!mission || !writableMissionStates.has(mission.state) || mission.archivedAt)
    ) {
      throw conflict(
        'DOCUMENT_MISSION_CONTEXT_INVALID',
        'Document mission context is not writable.',
      );
    }
    if (mission && client && mission.clientId !== client.id) {
      throw conflict('DOCUMENT_CONTEXT_MISMATCH', 'Document context records do not match.');
    }
    const process = input.context.missionCandidateId
      ? await transaction.missionCandidate.findUnique({
          where: { id: input.context.missionCandidateId },
          include: { candidate: true, mission: true },
        })
      : null;
    if (
      input.context.missionCandidateId &&
      (!process ||
        process.archivedAt ||
        process.candidate.status === CandidateStatus.ARCHIVED ||
        process.candidate.archivedAt ||
        process.mission.archivedAt ||
        !writableMissionStates.has(process.mission.state))
    ) {
      throw conflict(
        'DOCUMENT_PROCESS_CONTEXT_INVALID',
        'Document process context is not writable.',
      );
    }
    if (process && mission && process.missionId !== mission.id) {
      throw conflict('DOCUMENT_CONTEXT_MISMATCH', 'Document process does not belong to mission.');
    }
    if (process && candidate && process.candidateId !== candidate.id) {
      throw conflict('DOCUMENT_CONTEXT_MISMATCH', 'Document process does not belong to candidate.');
    }
    const interview = input.context.interviewId
      ? await transaction.interview.findUnique({ where: { id: input.context.interviewId } })
      : null;
    if (
      input.context.interviewId &&
      (!interview || interview.status === InterviewStatus.ARCHIVED || interview.archivedAt)
    ) {
      throw conflict(
        'DOCUMENT_INTERVIEW_CONTEXT_INVALID',
        'Document interview context is not writable.',
      );
    }
    if (interview && process && interview.missionCandidateId !== process.id) {
      throw conflict('DOCUMENT_CONTEXT_MISMATCH', 'Document interview does not belong to process.');
    }
    if (interview && !process) {
      const interviewProcess = await transaction.missionCandidate.findUnique({
        where: { id: interview.missionCandidateId },
        include: { candidate: true, mission: true },
      });
      if (
        !interviewProcess ||
        interviewProcess.archivedAt ||
        interviewProcess.candidate.status === CandidateStatus.ARCHIVED ||
        interviewProcess.candidate.archivedAt ||
        interviewProcess.mission.archivedAt ||
        !writableMissionStates.has(interviewProcess.mission.state)
      ) {
        throw conflict(
          'DOCUMENT_INTERVIEW_CONTEXT_INVALID',
          'Document interview context is not writable.',
        );
      }
    }
    if (input.documentType === DocumentType.CONTRAT_RECRUTEMENT && !mission) {
      throw conflict(
        'DOCUMENT_RECRUITMENT_CONTRACT_CONTEXT_REQUIRED',
        'Recruitment contracts require recruitment mission context.',
      );
    }
    if (
      input.documentType === DocumentType.CONTRAT_FORMATION &&
      (mission || process || interview)
    ) {
      throw conflict(
        'DOCUMENT_TRAINING_CONTRACT_CONTEXT_INVALID',
        'Training contracts cannot be linked to recruitment process context.',
      );
    }
  }

  private async assertReadableContext(
    document: DocumentRecord,
    transaction: PrismaService | PrismaTransaction,
  ): Promise<void> {
    if (document.clientId) {
      const client = await transaction.client.findUnique({ where: { id: document.clientId } });
      if (!client || client.status === ClientStatus.ARCHIVED || client.archivedAt) {
        throw notFound('DOCUMENT_NOT_FOUND', 'Document was not found.');
      }
    }
    if (document.candidateId) {
      const candidate = await transaction.candidate.findUnique({
        where: { id: document.candidateId },
      });
      if (!candidate || candidate.status === CandidateStatus.ARCHIVED || candidate.archivedAt) {
        throw notFound('DOCUMENT_NOT_FOUND', 'Document was not found.');
      }
    }
    if (document.recruitmentMissionId) {
      const mission = await transaction.recruitmentMission.findUnique({
        where: { id: document.recruitmentMissionId },
      });
      if (!mission || mission.archivedAt) {
        throw notFound('DOCUMENT_NOT_FOUND', 'Document was not found.');
      }
    }
    if (document.missionCandidateId) {
      const process = await transaction.missionCandidate.findUnique({
        where: { id: document.missionCandidateId },
        include: { candidate: true, mission: true },
      });
      if (
        !process ||
        process.archivedAt ||
        process.candidate.status === CandidateStatus.ARCHIVED ||
        process.candidate.archivedAt ||
        process.mission.archivedAt
      ) {
        throw notFound('DOCUMENT_NOT_FOUND', 'Document was not found.');
      }
    }
    if (document.interviewId) {
      const interview = await transaction.interview.findUnique({
        where: { id: document.interviewId },
      });
      if (!interview || interview.status === InterviewStatus.ARCHIVED || interview.archivedAt) {
        throw notFound('DOCUMENT_NOT_FOUND', 'Document was not found.');
      }
      const process = await transaction.missionCandidate.findUnique({
        where: { id: interview.missionCandidateId },
        include: { candidate: true, mission: true },
      });
      if (
        !process ||
        process.archivedAt ||
        process.candidate.status === CandidateStatus.ARCHIVED ||
        process.candidate.archivedAt ||
        process.mission.archivedAt
      ) {
        throw notFound('DOCUMENT_NOT_FOUND', 'Document was not found.');
      }
    }
  }

  private async assertDocumentContextScope(
    context: DocumentCreateRequest['context'],
    actorUserId: string,
    permissions: string[],
    transaction: PrismaService | PrismaTransaction,
  ): Promise<void> {
    if (context.clientId && !permissions.includes(CLIENT_PERMISSIONS.CLIENTS_VIEW)) {
      throw forbidden('DOCUMENT_CLIENT_SCOPE_REQUIRED', 'Client scope is required.');
    }
    if (context.candidateId && !permissions.includes(CANDIDATE_PERMISSIONS.CANDIDATES_VIEW)) {
      throw forbidden('DOCUMENT_CANDIDATE_SCOPE_REQUIRED', 'Candidate scope is required.');
    }
    if (context.recruitmentMissionId) {
      await this.assertMissionContextScope(
        context.recruitmentMissionId,
        actorUserId,
        permissions,
        transaction,
        'mission',
      );
    }
    if (context.missionCandidateId) {
      if (!permissions.includes(MISSION_PERMISSIONS.MISSION_CANDIDATES_VIEW)) {
        throw forbidden('DOCUMENT_PROCESS_SCOPE_REQUIRED', 'Mission-candidate scope is required.');
      }
      const missionId = await this.findMissionIdForProcess(context.missionCandidateId, transaction);
      if (missionId) {
        await this.assertMissionContextScope(
          missionId,
          actorUserId,
          permissions,
          transaction,
          'process',
        );
      }
    }
    if (context.interviewId) {
      if (!permissions.includes(MISSION_PERMISSIONS.INTERVIEWS_VIEW)) {
        throw forbidden('DOCUMENT_INTERVIEW_SCOPE_REQUIRED', 'Interview scope is required.');
      }
      const missionId = await this.findMissionIdForInterview(context.interviewId, transaction);
      if (missionId) {
        await this.assertMissionContextScope(
          missionId,
          actorUserId,
          permissions,
          transaction,
          'interview',
        );
      }
    }
  }

  private async hasDocumentAccess(
    document: DocumentRecord,
    actorUserId: string,
    permissions: string[],
    transaction: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<boolean> {
    if (!this.hasPermission(permissions, DOCUMENT_PERMISSIONS.DOCUMENTS_VIEW)) {
      return false;
    }
    if (document.status === DocumentStatus.ARCHIVED || document.archivedAt) {
      if (!this.hasPermission(permissions, DOCUMENT_PERMISSIONS.DOCUMENTS_ARCHIVE)) {
        return false;
      }
    }
    if (!this.visibilityAllowsActor(document, actorUserId)) {
      return false;
    }
    try {
      await this.assertDocumentContextScope(
        this.toContext(document),
        actorUserId,
        permissions,
        transaction,
      );
      return true;
    } catch {
      return false;
    }
  }

  private async assertDocumentAccess(
    document: DocumentRecord,
    actorUserId: string,
    permissions: string[],
    transaction: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<void> {
    if (!(await this.hasDocumentAccess(document, actorUserId, permissions, transaction))) {
      throw notFound('DOCUMENT_NOT_FOUND', 'Document was not found.');
    }
  }

  private visibleDocumentWhere(
    actorUserId: string,
    permissions: string[],
  ): Prisma.DocumentWhereInput {
    if (!this.hasPermission(permissions, DOCUMENT_PERMISSIONS.DOCUMENTS_VIEW)) {
      return { id: '00000000-0000-0000-0000-000000000000' };
    }

    const contextPredicates = this.readableContextWhere(actorUserId, permissions);
    return {
      AND: [
        {
          OR: [
            { status: { not: DocumentStatus.ARCHIVED }, archivedAt: null },
            this.hasPermission(permissions, DOCUMENT_PERMISSIONS.DOCUMENTS_ARCHIVE)
              ? { status: DocumentStatus.ARCHIVED }
              : { id: '00000000-0000-0000-0000-000000000000' },
          ],
        },
        {
          OR: [
            { visibility: DocumentVisibility.INTERNAL_ONLY },
            { visibility: DocumentVisibility.CLIENT_SHARED },
            {
              visibility: { in: [DocumentVisibility.PRIVATE, DocumentVisibility.ASSIGNED_ONLY] },
              ownerUserId: actorUserId,
            },
          ],
        },
        contextPredicates,
      ],
    };
  }

  private readableContextWhere(
    actorUserId: string,
    permissions: string[],
  ): Prisma.DocumentWhereInput {
    const assignedMissionScope = this.assignedMissionWhere(actorUserId);
    const processMissionScope = this.hasProcessScopeOverride(permissions)
      ? {}
      : assignedMissionScope;
    const interviewMissionScope = this.hasInterviewScopeOverride(permissions)
      ? {}
      : assignedMissionScope;
    const canViewMissionScope = this.hasPermission(permissions, MISSION_PERMISSIONS.MISSIONS_VIEW);
    const canViewProcessScope =
      canViewMissionScope &&
      this.hasPermission(permissions, MISSION_PERMISSIONS.MISSION_CANDIDATES_VIEW);
    const canViewInterviewScope =
      canViewMissionScope && this.hasPermission(permissions, MISSION_PERMISSIONS.INTERVIEWS_VIEW);
    return {
      AND: [
        this.hasPermission(permissions, CLIENT_PERMISSIONS.CLIENTS_VIEW)
          ? {
              OR: [
                { clientId: null },
                { client: { status: { not: ClientStatus.ARCHIVED }, archivedAt: null } },
              ],
            }
          : { clientId: null },
        this.hasPermission(permissions, CANDIDATE_PERMISSIONS.CANDIDATES_VIEW)
          ? {
              OR: [
                { candidateId: null },
                { candidate: { status: { not: CandidateStatus.ARCHIVED }, archivedAt: null } },
              ],
            }
          : { candidateId: null },
        canViewMissionScope
          ? {
              OR: [
                { recruitmentMissionId: null },
                { recruitmentMission: { archivedAt: null, ...assignedMissionScope } },
              ],
            }
          : { recruitmentMissionId: null },
        canViewProcessScope
          ? {
              OR: [
                { missionCandidateId: null },
                {
                  missionCandidate: {
                    archivedAt: null,
                    mission: { archivedAt: null, ...processMissionScope },
                    candidate: { status: { not: CandidateStatus.ARCHIVED }, archivedAt: null },
                  },
                },
              ],
            }
          : { missionCandidateId: null },
        canViewInterviewScope
          ? {
              OR: [
                { interviewId: null },
                {
                  interview: {
                    status: { not: InterviewStatus.ARCHIVED },
                    archivedAt: null,
                    missionCandidate: {
                      archivedAt: null,
                      mission: { archivedAt: null, ...interviewMissionScope },
                      candidate: { status: { not: CandidateStatus.ARCHIVED }, archivedAt: null },
                    },
                  },
                },
              ],
            }
          : { interviewId: null },
      ],
    };
  }

  private visibilityAllowsActor(document: DocumentRecord, actorUserId: string): boolean {
    if (
      document.visibility === DocumentVisibility.PRIVATE ||
      document.visibility === DocumentVisibility.ASSIGNED_ONLY
    ) {
      return document.ownerUserId === actorUserId;
    }
    return true;
  }

  private assertSupportedDocumentType(documentType: DocumentType): void {
    if (documentType === DocumentType.LEGACY_CONTRACT) {
      throw conflict(
        'DOCUMENT_LEGACY_CONTRACT_TYPE_BLOCKED',
        'Use the distinct recruitment or training contract taxonomy.',
      );
    }
  }

  private async findDocument(documentId: string): Promise<DocumentRecord> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: documentInclude,
    });
    if (!document) {
      throw notFound('DOCUMENT_NOT_FOUND', 'Document was not found.');
    }
    return document;
  }

  private prepareVersion(documentId: string, input: DocumentVersionCreateRequest): PreparedVersion {
    if (!isStrictBase64(input.base64Content)) {
      throw badRequest('DOCUMENT_FILE_BASE64_INVALID', 'File content must be strict base64.');
    }
    if (decodedBase64Size(input.base64Content) > maxDocumentFileSizeBytes) {
      throw badRequest('DOCUMENT_FILE_SIZE_REJECTED', 'File size is not allowed.');
    }
    const buffer = Buffer.from(input.base64Content, 'base64');
    const filename = sanitizeFilename(input.filename);
    this.assertFileIsSafe(input.filename, input.contentType, buffer);
    return {
      buffer,
      filename,
      originalFilename: safeOriginalFilename(input.filename),
      storageKey: `documents/${documentId}/${randomUUID()}-${filename}`,
      mimeType: input.contentType,
      sizeBytes: buffer.byteLength,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
      outputFamily: input.outputFamily,
    };
  }

  private assertFileIsSafe(filename: string, contentType: string, buffer: Buffer): void {
    const policy = filePolicies.get(contentType);
    const extension = extname(safeOriginalFilename(filename)).toLowerCase();
    if (!policy) {
      throw badRequest('DOCUMENT_FILE_TYPE_REJECTED', 'File type is not allowed.');
    }
    if (buffer.byteLength === 0 || buffer.byteLength > maxDocumentFileSizeBytes) {
      throw badRequest('DOCUMENT_FILE_SIZE_REJECTED', 'File size is not allowed.');
    }
    if (dangerousExtensionPattern.test(filename) || !policy.extensions.includes(extension)) {
      throw badRequest('DOCUMENT_FILE_TYPE_REJECTED', 'File type is not allowed.');
    }
    if (buffer.subarray(0, 2).toString('hex') === '4d5a') {
      throw badRequest('DOCUMENT_FILE_TYPE_REJECTED', 'File type is not allowed.');
    }
    if (!policy.signatures.some((signature) => signature(buffer))) {
      throw badRequest('DOCUMENT_FILE_SIGNATURE_REJECTED', 'File content does not match type.');
    }
  }

  private async assertMissionContextScope(
    missionId: string,
    actorUserId: string,
    permissions: string[],
    transaction: PrismaService | PrismaTransaction,
    contextKind: 'mission' | 'process' | 'interview',
  ): Promise<void> {
    if (!permissions.includes(MISSION_PERMISSIONS.MISSIONS_VIEW)) {
      throw forbidden('DOCUMENT_MISSION_SCOPE_REQUIRED', 'Mission scope is required.');
    }
    if (
      (contextKind === 'process' && this.hasProcessScopeOverride(permissions)) ||
      (contextKind === 'interview' && this.hasInterviewScopeOverride(permissions))
    ) {
      return;
    }
    const assignment = await transaction.missionRecruiter.findFirst({
      where: { missionId, userId: actorUserId, status: AssignmentStatus.ACTIVE, archivedAt: null },
    });
    if (!assignment) {
      throw forbidden(
        'DOCUMENT_MISSION_SCOPE_DENIED',
        'Document access requires linked mission assignment scope.',
      );
    }
  }

  private async findMissionIdForProcess(
    processId: string,
    transaction: PrismaService | PrismaTransaction,
  ): Promise<string | undefined> {
    const process = await transaction.missionCandidate.findUnique({
      where: { id: processId },
      select: { missionId: true },
    });
    return process?.missionId;
  }

  private async findMissionIdForInterview(
    interviewId: string,
    transaction: PrismaService | PrismaTransaction,
  ): Promise<string | undefined> {
    const interview = await transaction.interview.findUnique({
      where: { id: interviewId },
      select: { missionCandidate: { select: { missionId: true } } },
    });
    return interview?.missionCandidate.missionId;
  }

  private assignedMissionWhere(actorUserId: string): Prisma.RecruitmentMissionWhereInput {
    return {
      recruiters: {
        some: { userId: actorUserId, status: AssignmentStatus.ACTIVE, archivedAt: null },
      },
    };
  }

  private hasProcessScopeOverride(permissions: string[]): boolean {
    return permissions.includes(MISSION_PERMISSIONS.MISSION_CANDIDATES_TRANSFER);
  }

  private hasInterviewScopeOverride(permissions: string[]): boolean {
    return (
      permissions.includes(MISSION_PERMISSIONS.INTERVIEWS_ARCHIVE) ||
      permissions.includes(MISSION_PERMISSIONS.EVALUATIONS_INTERNAL_VIEW)
    );
  }

  private assertHasPermission(permissions: string[], permission: DocumentPermission): void {
    if (!this.hasPermission(permissions, permission)) {
      throw forbidden('DOCUMENT_PERMISSION_REQUIRED', `Document action requires ${permission}.`);
    }
  }

  private hasPermission(permissions: string[], permission: string): boolean {
    return permissions.includes(permission);
  }

  private async createAuditLog(
    transaction: PrismaTransaction,
    action: string,
    context: RequestContext,
    options: {
      actorUserId: string;
      entityType: 'Document' | 'DocumentVersion';
      entityId?: string;
      metadataSummary: string;
    },
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        entityType: options.entityType,
        entityId: options.entityId,
        actorUserId: options.actorUserId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadataSummary: options.metadataSummary,
      },
    });
  }

  private async deleteStoredFiles(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.storage.delete(key)));
  }

  private toDocumentDetail(document: DocumentRecord) {
    return {
      ...this.toDocumentSummary(document),
      versions: document.versions.map((version) => this.toDocumentVersion(version)),
    };
  }

  private toDocumentSummary(document: DocumentRecord) {
    return {
      id: document.id,
      title: document.title,
      documentType: document.documentType,
      visibility: document.visibility,
      status: document.status,
      outputFamily: document.outputFamily,
      ownerUserId: document.ownerUserId,
      createdByUserId: document.createdByUserId,
      context: this.toContext(document),
      currentVersionId: document.currentVersionId,
      archivedAt: isoOrNull(document.archivedAt),
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  private toDocumentVersion(version: DocumentVersionRecord) {
    return {
      id: version.id,
      documentId: version.documentId,
      versionNumber: version.versionNumber,
      filename: version.filename,
      originalFilename: version.originalFilename,
      mimeType: version.mimeType,
      sizeBytes: Number(version.sizeBytes),
      checksumSha256: version.checksumSha256,
      outputFamily: version.outputFamily,
      source: version.source,
      status: version.status,
      archivedAt: isoOrNull(version.archivedAt),
      createdByUserId: version.createdByUserId,
      createdAt: version.createdAt.toISOString(),
    };
  }

  private toContext(document: Pick<DocumentRecord, keyof DocumentContextRecord>) {
    return {
      ...(document.clientId ? { clientId: document.clientId } : {}),
      ...(document.candidateId ? { candidateId: document.candidateId } : {}),
      ...(document.recruitmentMissionId
        ? { recruitmentMissionId: document.recruitmentMissionId }
        : {}),
      ...(document.missionCandidateId ? { missionCandidateId: document.missionCandidateId } : {}),
      ...(document.interviewId ? { interviewId: document.interviewId } : {}),
    };
  }
}

type DocumentContextRecord = {
  clientId: string | null;
  candidateId: string | null;
  recruitmentMissionId: string | null;
  missionCandidateId: string | null;
  interviewId: string | null;
};
type DocumentContextInput = {
  documentType: DocumentType;
  context: DocumentCreateRequest['context'];
};

const documentInclude = {
  versions: { orderBy: [{ versionNumber: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.DocumentInclude;

function sanitizeFilename(filename: string): string {
  const sanitized = safeOriginalFilename(filename)
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  return sanitized.length > 0 ? sanitized.slice(0, 180) : 'document';
}

function safeOriginalFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).filter(Boolean).at(-1) ?? 'document';
  const cleaned = basename
    .normalize('NFC')
    .split('')
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 180) : 'document';
}

function isStrictBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) {
    return false;
  }
  let padding = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '=') {
      padding += 1;
      if (index < value.length - 2 || padding > 2) {
        return false;
      }
      continue;
    }
    if (padding > 0 || !isBase64Character(character)) {
      return false;
    }
  }
  return true;
}

function isBase64Character(character: string | undefined): boolean {
  if (!character) {
    return false;
  }
  const code = character.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    character === '+' ||
    character === '/'
  );
}

function decodedBase64Size(value: string): number {
  let padding = 0;
  if (value.endsWith('==')) {
    padding = 2;
  } else if (value.endsWith('=')) {
    padding = 1;
  }
  return (value.length / 4) * 3 - padding;
}

type OoxmlPackageKind = 'docx' | 'xlsx';
type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const maxOoxmlEntryCount = 256;
const maxOoxmlManifestBytes = 64_000;

function looksLikeOoxml(buffer: Buffer, packageKind: OoxmlPackageKind): boolean {
  const entries = parseZipEntries(buffer);
  if (!entries) {
    return false;
  }
  const entryNames = new Set(entries.map((entry) => entry.name));
  const requiredMainEntry = packageKind === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  const requiredContentType =
    packageKind === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  if (!entryNames.has('[Content_Types].xml') || !entryNames.has(requiredMainEntry)) {
    return false;
  }
  const manifest = readStoredOrDeflatedEntry(buffer, entries, '[Content_Types].xml');
  return manifest?.includes(requiredContentType) ?? false;
}

function parseZipEntries(buffer: Buffer): ZipEntry[] | null {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) {
    return null;
  }
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const commentLength = buffer.readUInt16LE(eocdOffset + 20);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entryCount === 0 ||
    entryCount > maxOoxmlEntryCount ||
    eocdOffset + 22 + commentLength !== buffer.length ||
    centralDirectoryOffset + centralDirectorySize > eocdOffset
  ) {
    return null;
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      return null;
    }
    const generalPurposeFlag = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + filenameLength + extraLength + commentLength;
    if (
      nextOffset > buffer.length ||
      (generalPurposeFlag & 0x0001) !== 0 ||
      ![0, 8].includes(compressionMethod) ||
      compressedSize > maxDocumentFileSizeBytes ||
      uncompressedSize > maxDocumentFileSizeBytes
    ) {
      return null;
    }
    const name = buffer.subarray(offset + 46, offset + 46 + filenameLength).toString('utf8');
    if (!isSafeZipEntryName(name) || !localHeaderMatches(buffer, name, localHeaderOffset)) {
      return null;
    }
    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset = nextOffset;
  }
  return offset === centralDirectoryOffset + centralDirectorySize ? entries : null;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function isSafeZipEntryName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.startsWith('/') &&
    !name.startsWith('\\') &&
    !name.includes('\\') &&
    !name.split('/').includes('..') &&
    !name.includes('\u0000')
  );
}

function localHeaderMatches(buffer: Buffer, name: string, localHeaderOffset: number): boolean {
  if (
    localHeaderOffset + 30 > buffer.length ||
    buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50
  ) {
    return false;
  }
  const filenameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const localName = buffer
    .subarray(localHeaderOffset + 30, localHeaderOffset + 30 + filenameLength)
    .toString('utf8');
  return (
    localHeaderOffset + 30 + filenameLength + extraLength <= buffer.length && localName === name
  );
}

function readStoredOrDeflatedEntry(
  buffer: Buffer,
  entries: ZipEntry[],
  name: string,
): string | null {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry || entry.uncompressedSize > maxOoxmlManifestBytes) {
    return null;
  }
  const filenameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const contentOffset = entry.localHeaderOffset + 30 + filenameLength + extraLength;
  const contentEnd = contentOffset + entry.compressedSize;
  if (contentEnd > buffer.length) {
    return null;
  }
  const compressed = buffer.subarray(contentOffset, contentEnd);
  let content: Buffer;
  try {
    content =
      entry.compressionMethod === 0
        ? compressed
        : inflateRawSync(compressed, { maxOutputLength: maxOoxmlManifestBytes });
  } catch {
    return null;
  }
  if (content.length !== entry.uncompressedSize || content.length > maxOoxmlManifestBytes) {
    return null;
  }
  return content.toString('utf8');
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
