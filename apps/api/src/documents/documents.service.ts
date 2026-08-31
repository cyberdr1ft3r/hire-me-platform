import { createHash, randomUUID } from 'node:crypto';

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
import {
  CandidateStatus,
  ClientStatus,
  DocumentStatus,
  DocumentType,
  DocumentVersionSource,
  InterviewStatus,
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

const maxDocumentFileSizeBytes = 5_000_000;
const allowedMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'text/plain',
] as const;

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
    const where: Prisma.DocumentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.documentType ? { documentType: query.documentType } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...(query.recruitmentMissionId ? { recruitmentMissionId: query.recruitmentMissionId } : {}),
      ...(query.missionCandidateId ? { missionCandidateId: query.missionCandidateId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { versions: { some: { filename: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const documents = await this.prisma.document.findMany({
      where,
      include: documentInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    const visible = documents.filter((document) => this.hasDocumentAccess(document, permissions));
    const pageStart = (query.page - 1) * query.pageSize;
    const pageDocuments = visible.slice(pageStart, pageStart + query.pageSize);

    return {
      documents: pageDocuments.map((document) => this.toDocumentSummary(document)),
      pagination: { page: query.page, pageSize: query.pageSize, total: visible.length },
    };
  }

  async getDocument(documentId: string, actorUserId: string): Promise<DocumentDetailResponse> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    const document = await this.findDocument(documentId);
    this.assertDocumentAccess(document, permissions);
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
        await this.assertWritableContext(input, permissions, transaction);
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
    const document = await this.withWritableDocumentLock(documentId, actorUserId, (transaction) =>
      this.updateDocumentMetadata(documentId, input, transaction),
    );

    await this.audit.record('documents.document.metadata_updated', context, {
      actorUserId,
      entityType: 'Document',
      entityId: document.id,
      metadataSummary: 'Approved document metadata updated.',
    });

    return { document: this.toDocumentDetail(document) };
  }

  async archiveDocument(
    documentId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentDetailResponse> {
    const document = await this.withWritableDocumentLock(documentId, actorUserId, (transaction) =>
      transaction.document.update({
        where: { id: documentId },
        data: { status: DocumentStatus.ARCHIVED, archivedAt: new Date() },
        include: documentInclude,
      }),
    );

    await this.audit.record('documents.document.archived', context, {
      actorUserId,
      entityType: 'Document',
      entityId: document.id,
      metadataSummary: 'Document archived; historical versions preserved.',
    });

    return { document: this.toDocumentDetail(document) };
  }

  async listVersions(
    documentId: string,
    actorUserId: string,
  ): Promise<DocumentVersionListResponse> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    const document = await this.findDocument(documentId);
    this.assertDocumentAccess(document, permissions);
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
    if (!permissions.includes(DOCUMENT_PERMISSIONS.DOCUMENTS_DOWNLOAD)) {
      throw forbidden('DOCUMENT_DOWNLOAD_PERMISSION_REQUIRED', 'Document download is not allowed.');
    }
    const document = await this.findDocument(documentId);
    this.assertDocumentAccess(document, permissions);
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
    callback: (transaction: PrismaTransaction, document: DocumentRecord) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      const document = await this.lockDocument(documentId, transaction);
      const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
      this.assertDocumentAccess(document, permissions);
      if (
        !permissions.includes(DOCUMENT_PERMISSIONS.DOCUMENTS_UPDATE) &&
        !permissions.includes(DOCUMENT_PERMISSIONS.DOCUMENTS_VERSION_CREATE) &&
        !permissions.includes(DOCUMENT_PERMISSIONS.DOCUMENTS_ARCHIVE)
      ) {
        throw forbidden(
          'DOCUMENT_MUTATION_PERMISSION_REQUIRED',
          'Document mutation is not allowed.',
        );
      }
      if (document.status === DocumentStatus.ARCHIVED || document.archivedAt) {
        throw conflict('DOCUMENT_ARCHIVED', 'Archived documents cannot be changed.');
      }
      await this.assertWritableContext(
        {
          documentType: document.documentType,
          context: this.toContext(document),
        } satisfies DocumentContextInput,
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
    permissions: string[],
    transaction: PrismaTransaction,
  ): Promise<void> {
    this.assertDocumentContextPermission(input.context, permissions);
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
        })
      : null;
    if (input.context.missionCandidateId && (!process || process.archivedAt)) {
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
      });
      if (!process || process.archivedAt) {
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
    }
  }

  private assertDocumentContextPermission(
    context: DocumentCreateRequest['context'],
    permissions: string[],
  ): void {
    if (context.clientId && !permissions.includes('clients:view')) {
      throw forbidden('DOCUMENT_CLIENT_SCOPE_REQUIRED', 'Client scope is required.');
    }
    if (context.candidateId && !permissions.includes('candidates:view')) {
      throw forbidden('DOCUMENT_CANDIDATE_SCOPE_REQUIRED', 'Candidate scope is required.');
    }
    if (context.recruitmentMissionId && !permissions.includes('missions:view')) {
      throw forbidden('DOCUMENT_MISSION_SCOPE_REQUIRED', 'Mission scope is required.');
    }
    if (context.missionCandidateId && !permissions.includes('mission_candidates:view')) {
      throw forbidden('DOCUMENT_PROCESS_SCOPE_REQUIRED', 'Mission-candidate scope is required.');
    }
    if (context.interviewId && !permissions.includes('interviews:view')) {
      throw forbidden('DOCUMENT_INTERVIEW_SCOPE_REQUIRED', 'Interview scope is required.');
    }
  }

  private hasDocumentAccess(document: DocumentRecord, permissions: string[]): boolean {
    if (!permissions.includes(DOCUMENT_PERMISSIONS.DOCUMENTS_VIEW)) {
      return false;
    }
    if (document.status === DocumentStatus.ARCHIVED || document.archivedAt) {
      return permissions.includes(DOCUMENT_PERMISSIONS.DOCUMENTS_ARCHIVE);
    }
    try {
      this.assertDocumentContextPermission(this.toContext(document), permissions);
      return true;
    } catch {
      return false;
    }
  }

  private assertDocumentAccess(document: DocumentRecord, permissions: string[]): void {
    if (!this.hasDocumentAccess(document, permissions)) {
      throw notFound('DOCUMENT_NOT_FOUND', 'Document was not found.');
    }
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
    const buffer = Buffer.from(input.base64Content, 'base64');
    const filename = sanitizeFilename(input.filename);
    this.assertFileIsSafe(input.filename, input.contentType, buffer);
    return {
      buffer,
      filename,
      originalFilename: sanitizeFilename(input.filename),
      storageKey: `documents/${documentId}/${randomUUID()}-${filename}`,
      mimeType: input.contentType,
      sizeBytes: buffer.byteLength,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
      outputFamily: input.outputFamily,
    };
  }

  private assertFileIsSafe(filename: string, contentType: string, buffer: Buffer): void {
    if (!allowedMimeTypes.includes(contentType as (typeof allowedMimeTypes)[number])) {
      throw badRequest('DOCUMENT_FILE_TYPE_REJECTED', 'File type is not allowed.');
    }
    if (buffer.byteLength === 0 || buffer.byteLength > maxDocumentFileSizeBytes) {
      throw badRequest('DOCUMENT_FILE_SIZE_REJECTED', 'File size is not allowed.');
    }
    if (/\.(exe|bat|cmd|com|scr|js|jar|zip|rar|7z|tar|gz)$/i.test(filename)) {
      throw badRequest('DOCUMENT_FILE_TYPE_REJECTED', 'File type is not allowed.');
    }
    if (
      buffer.subarray(0, 2).toString('hex') === '4d5a' ||
      buffer.subarray(0, 2).toString() === 'PK'
    ) {
      throw badRequest('DOCUMENT_FILE_TYPE_REJECTED', 'File type is not allowed.');
    }
    if (contentType === 'application/pdf' && buffer.subarray(0, 4).toString() !== '%PDF') {
      throw badRequest('DOCUMENT_FILE_SIGNATURE_REJECTED', 'File content does not match type.');
    }
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
  const sanitized = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  return sanitized.length > 0 ? sanitized.slice(0, 180) : 'document';
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
