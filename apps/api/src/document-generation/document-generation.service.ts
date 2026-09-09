import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  DocumentGenerationRequest,
  DocumentGenerationResponse,
  GenerationLanguage,
  GenerationOutputFamily,
} from '@hire-me/contracts';

import { GENERATION_PERMISSIONS } from './document-generation-permissions.js';
import {
  generationConflict,
  generationForbidden,
  generationSourceNotFound,
} from './document-generation.errors.js';
import type { GenerationView } from './generation-view-models.js';
import { renderDocx } from './renderers/docx.renderer.js';
import { PdfScriptCoverageError, renderPdf } from './renderers/pdf.renderer.js';
import { sanitizeText } from './renderable-document.js';
import { resolveTemplate } from './template-registry.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import { CANDIDATE_PERMISSIONS } from '../candidates/candidate-permissions.js';
import { CLIENT_PERMISSIONS } from '../clients/client-permissions.js';
import { COMMERCIAL_PERMISSIONS } from '../commercial/commercial-permissions.js';
import { DOCUMENT_PERMISSIONS } from '../documents/document-permissions.js';
import { MISSION_PERMISSIONS } from '../missions/mission-permissions.js';
import {
  AssignmentStatus,
  CertificateStatus,
  CommercialContractBusinessType,
  CommercialContractStatus,
  DocumentStatus,
  DocumentType,
  DocumentVersionSource,
  DocumentVisibility,
  GeneratedDocumentSource,
  InvoiceStatus,
  OutputFamily,
  Prisma,
  PurchaseOrderStatus,
  QuotationStatus,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { ProtectedStorageService } from '../storage/protected-storage.service.js';
import { TRAINING_PERMISSIONS } from '../training/training-permissions.js';

type Tx = Prisma.TransactionClient;
type PrismaLike = Tx | PrismaService;

const UNIQUE_VIOLATION = 'P2002';
const maxGeneratedBytes = 4_000_000;

const pdfMimeType = 'application/pdf';
const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Resolved authoritative snapshot plus everything needed to publish the output. */
type ResolvedSource = {
  sourceType: GeneratedDocumentSource;
  sourceId: string;
  documentType: DocumentType;
  view: GenerationView;
  title: string;
  filenameStem: string;
  /**
   * Business context copied onto the logical document.
   *
   * The recruitment mission is deliberately not copied: the merged document mission
   * context requires an active `MissionRecruiter` assignment, which is stricter than the
   * commercial source rule and would let an actor generate an output it could not read
   * back. Mission scope is still enforced, through the authoritative source relation.
   */
  context: {
    clientId: string | null;
    trainingEnrollmentId: string | null;
  };
  /**
   * Canonical fingerprint of exactly the authoritative fields this output renders.
   * Recorded on the generated version so provenance can answer which state of the
   * source produced these bytes.
   */
  fingerprint: string;
  /**
   * Takes a short-lived shared lock on **every** row whose values the output renders,
   * inside the publishing transaction and before the final fingerprint comparison.
   *
   * `FOR SHARE` is used rather than `FOR UPDATE`: two concurrent generations never block
   * each other, while any mutation of a rendered value must take a row-exclusive lock on
   * exactly one of these rows and therefore waits until this transaction commits. That is
   * what makes the accepted source state stable from comparison through commit, without
   * holding any lock across rendering or storage publication.
   */
  stabilize: (tx: Tx) => Promise<void>;
  /**
   * Re-reads the authoritative source under those locks, re-asserts lifecycle
   * eligibility, and recomputes the fingerprint. Rendering happens outside any
   * transaction, so this is what proves the bytes still describe the committed state.
   */
  resnapshot: (tx: Tx) => Promise<string>;
};

type GenerationAccess = {
  generate: boolean;
  documentsView: boolean;
  commercialData: boolean;
  quotationsView: boolean;
  contractsView: boolean;
  purchaseOrdersView: boolean;
  invoicesView: boolean;
  clientsView: boolean;
  missionsView: boolean;
  missionCandidatesTransfer: boolean;
  candidatesView: boolean;
  clientContactsView: boolean;
  trainingProgramsView: boolean;
  trainingProgramsViewAll: boolean;
  trainingEnrollmentsView: boolean;
};

/** Commercial roots whose own row is stabilized alongside its client and mission. */
type CommercialRootTable =
  'CommercialQuotation' | 'PurchaseOrder' | 'CommercialContract' | 'Invoice';

/**
 * Every table generation may take a shared row lock on.
 *
 * The set is closed and the statement for each member is written out below, so no caller
 * can route text of its own into SQL even by mistake. Identifiers cannot be parameterized
 * in PostgreSQL, which is the reason a table name must never come from a variable.
 */
type LockableTable =
  | 'Client'
  | 'RecruitmentMission'
  | CommercialRootTable
  | 'TrainingProgram'
  | 'TrainingEnrollment'
  | 'Candidate'
  | 'ClientContact'
  | 'User'
  | 'ExternalTrainingParticipant';

/** One shared row lock, with the row id parameterized and the table statically chosen. */
async function lockRowForShare(tx: Tx, table: LockableTable, id: string): Promise<void> {
  switch (table) {
    case 'Client':
      await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'RecruitmentMission':
      await tx.$queryRaw`SELECT id FROM "RecruitmentMission" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'CommercialQuotation':
      await tx.$queryRaw`SELECT id FROM "CommercialQuotation" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'PurchaseOrder':
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'CommercialContract':
      await tx.$queryRaw`SELECT id FROM "CommercialContract" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'Invoice':
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'TrainingProgram':
      await tx.$queryRaw`SELECT id FROM "TrainingProgram" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'TrainingEnrollment':
      await tx.$queryRaw`SELECT id FROM "TrainingEnrollment" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'Candidate':
      await tx.$queryRaw`SELECT id FROM "Candidate" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'ClientContact':
      await tx.$queryRaw`SELECT id FROM "ClientContact" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'User':
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    case 'ExternalTrainingParticipant':
      await tx.$queryRaw`SELECT id FROM "ExternalTrainingParticipant" WHERE id = ${id}::uuid FOR SHARE`;
      return;
    default: {
      const exhaustive: never = table;
      throw new Error(`Unlockable table: ${String(exhaustive)}`);
    }
  }
}

/**
 * Issue #49 template-driven business-output generation.
 *
 * Structured business records stay authoritative. This service renders a bounded,
 * code-owned template over one authoritative snapshot and publishes the bytes as a
 * normal immutable `DocumentVersion` with `DocumentVersionSource.GENERATED`. It never
 * writes to a commercial or training record, and it never overwrites a historical
 * version.
 *
 * Storage and PostgreSQL are not one transaction. The documented sequence is render in
 * memory, publish to a server-generated storage key, then commit the version inside a
 * transaction; if the transaction fails, the newly published object is deleted and no
 * historical object is touched. The database therefore never references missing bytes,
 * and a failure can leave at most the one object that was just written, which the
 * compensation removes.
 *
 * Lock order for a publish, in the order the transaction takes them:
 *
 * 1. **source stabilization** — a shared lock on every row whose values the output
 *    renders, parent-first within its family: `Client`, then the optional
 *    `RecruitmentMission`, then the commercial root; or `Client`, `TrainingProgram`,
 *    `TrainingEnrollment`, then the participant row;
 * 2. **fingerprint** — the source is re-read under those locks and its fingerprint
 *    compared with the one the rendered bytes were built from;
 * 3. **`Document`** — the logical document row is locked or created;
 * 4. **`DocumentVersion`** — the version is inserted, `currentVersionId` advanced, and
 *    the audit row written;
 * 5. **commit**, which releases every lock at once.
 *
 * Source rows are therefore locked, not merely re-read; `lockRowsForShare` documents why
 * that parent-first order matches the merged mutation paths and forms no cycle.
 */
@Injectable()
export class DocumentGenerationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(ProtectedStorageService) private readonly storage: ProtectedStorageService,
  ) {}

  /**
   * Deterministic hook for concurrency tests, invoked inside the publishing transaction
   * after the source rows are stabilized and the fingerprint has been accepted, and
   * before the generated version is inserted. Production never assigns it.
   */
  afterSourceStabilized: (() => Promise<void>) | null = null;

  async generateQuotation(
    quotationId: string,
    input: DocumentGenerationRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentGenerationResponse> {
    return this.generate(
      (access) => this.resolveQuotation(quotationId, actorUserId, access),
      input,
      actorUserId,
      context,
    );
  }

  async generatePurchaseOrder(
    purchaseOrderId: string,
    input: DocumentGenerationRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentGenerationResponse> {
    return this.generate(
      (access) => this.resolvePurchaseOrder(purchaseOrderId, actorUserId, access),
      input,
      actorUserId,
      context,
    );
  }

  async generateContract(
    contractId: string,
    input: DocumentGenerationRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentGenerationResponse> {
    return this.generate(
      (access) => this.resolveContract(contractId, actorUserId, access),
      input,
      actorUserId,
      context,
    );
  }

  async generateInvoice(
    invoiceId: string,
    input: DocumentGenerationRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentGenerationResponse> {
    return this.generate(
      (access) => this.resolveInvoice(invoiceId, actorUserId, access),
      input,
      actorUserId,
      context,
    );
  }

  async generateTrainingCertificate(
    programId: string,
    enrollmentId: string,
    input: DocumentGenerationRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentGenerationResponse> {
    return this.generate(
      (access) => this.resolveCertificate(programId, enrollmentId, actorUserId, access),
      input,
      actorUserId,
      context,
    );
  }

  // --------------------------------------------------------------------------
  // Generation pipeline
  // --------------------------------------------------------------------------

  private async generate(
    resolve: (access: GenerationAccess) => Promise<ResolvedSource>,
    input: DocumentGenerationRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<DocumentGenerationResponse> {
    const access = await this.resolveAccess(actorUserId);
    if (!access.generate) {
      throw generationForbidden(
        'DOCUMENT_GENERATION_PERMISSION_REQUIRED',
        `This action requires ${GENERATION_PERMISSIONS.DOCUMENTS_GENERATE}.`,
      );
    }
    const source = await resolve(access);
    const template = resolveTemplate(source.view.kind);
    if (!template.languages.includes(input.language)) {
      throw generationConflict(
        'GENERATION_LANGUAGE_UNSUPPORTED',
        'The template does not support the requested language.',
      );
    }

    // An idempotent replay must not re-render or re-publish anything.
    const replay = await this.findReplay(input, source, template.templateId, template.version);
    if (replay) {
      return { generated: replay };
    }

    const renderable = template.build(source.view, input.language);
    let bytes: Buffer;
    try {
      bytes =
        input.outputFamily === 'PDF' ? await renderPdf(renderable) : await renderDocx(renderable);
    } catch (error: unknown) {
      // The bundled faces cover Latin, Greek, Cyrillic, and Arabic. A script outside that
      // coverage fails with a precise error rather than a substituted character, and the
      // Word output, which is fully Unicode, remains available for it.
      if (error instanceof PdfScriptCoverageError) {
        throw generationConflict(
          'GENERATION_PDF_SCRIPT_UNSUPPORTED',
          'The source text uses a script no bundled PDF font covers. Generate the Word output instead.',
        );
      }
      throw error;
    }
    if (bytes.length === 0 || bytes.length > maxGeneratedBytes) {
      throw generationConflict(
        'GENERATION_OUTPUT_SIZE_INVALID',
        'The generated output exceeded the permitted size.',
      );
    }

    const logicalKey = this.logicalDocumentKey(
      source.sourceType,
      source.sourceId,
      input.outputFamily,
      input.language,
    );
    const storageKey = this.buildStorageKey(logicalKey, input.outputFamily);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const publishedKeys: string[] = [];

    try {
      await this.storage.put(storageKey, bytes);
      publishedKeys.push(storageKey);

      const provenance = await this.publish({
        source,
        input,
        actorUserId,
        context,
        logicalKey,
        storageKey,
        checksum,
        sizeBytes: bytes.length,
        templateId: template.templateId,
        templateVersion: template.version,
      });
      return { generated: provenance };
    } catch (error: unknown) {
      // Compensation removes only the object published by this attempt. Historical
      // versions and their objects are never touched.
      await this.deletePublished(publishedKeys);
      throw error;
    }
  }

  private async publish(options: {
    source: ResolvedSource;
    input: DocumentGenerationRequest;
    actorUserId: string;
    context: RequestContext;
    logicalKey: string;
    storageKey: string;
    checksum: string;
    sizeBytes: number;
    templateId: string;
    templateVersion: number;
  }): Promise<DocumentGenerationResponse['generated']> {
    const { source, input, actorUserId, context } = options;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Stabilize first, then compare. Locking every rendered row before the
          // comparison is what makes the accepted state hold until commit: without it a
          // mutation could still land between the comparison and the version insert.
          await source.stabilize(tx);
          const currentFingerprint = await source.resnapshot(tx);
          if (currentFingerprint !== source.fingerprint) {
            throw generationConflict(
              'GENERATION_SOURCE_CHANGED',
              'The source record changed while the output was rendered. Retry the generation.',
            );
          }

          // Test seam: lets a concurrency test start a real competing mutation once the
          // source is stabilized and the fingerprint accepted, but before this transaction
          // commits. Never set outside tests.
          if (this.afterSourceStabilized) {
            await this.afterSourceStabilized();
          }

          const document = await this.lockOrCreateLogicalDocument(tx, options);

          // The unique idempotency index is authoritative, but checking here keeps the
          // conflict deterministic instead of surfacing a raw constraint error.
          const existing = await tx.documentVersion.findUnique({
            where: { generationIdempotencyKey: input.idempotencyKey },
          });
          if (existing) {
            if (existing.documentId !== document.id) {
              throw generationConflict(
                'GENERATION_IDEMPOTENCY_KEY_CONFLICT',
                'This idempotency key was already used for a different generated document.',
              );
            }
            throw new ReplayDetected();
          }

          const lastVersion = await tx.documentVersion.findFirst({
            where: { documentId: document.id },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          });
          const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;
          const version = await tx.documentVersion.create({
            data: {
              documentId: document.id,
              versionNumber,
              filename: this.buildFilename(source.filenameStem, versionNumber, input.outputFamily),
              storageKey: options.storageKey,
              mimeType: this.mimeType(input.outputFamily),
              sizeBytes: options.sizeBytes,
              checksumSha256: options.checksum,
              outputFamily: this.outputFamily(input.outputFamily),
              createdByUserId: actorUserId,
              source: DocumentVersionSource.GENERATED,
              templateId: options.templateId,
              templateVersion: options.templateVersion,
              generationLanguage: input.language,
              generationIdempotencyKey: input.idempotencyKey,
              sourceSnapshotSha256: source.fingerprint,
            },
          });

          await tx.document.update({
            where: { id: document.id },
            data: {
              currentVersionId: version.id,
              status: DocumentStatus.ACTIVE,
              outputFamily: this.outputFamily(input.outputFamily),
            },
          });

          await tx.auditLog.create({
            data: {
              action: versionNumber === 1 ? 'documents.generated' : 'documents.regenerated',
              entityType: 'DocumentVersion',
              entityId: version.id,
              actorUserId,
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
              metadataSummary: `Generated ${source.sourceType} output version ${versionNumber} using template ${options.templateId} v${options.templateVersion} (${input.outputFamily}/${input.language}).`,
            },
          });

          return {
            documentId: document.id,
            versionId: version.id,
            versionNumber,
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            documentType: source.documentType,
            outputFamily: input.outputFamily,
            language: input.language,
            templateId: options.templateId,
            templateVersion: options.templateVersion,
            filename: version.filename,
            mimeType: version.mimeType,
            sizeBytes: options.sizeBytes,
            checksumSha256: options.checksum,
            generatedByUserId: actorUserId,
            generatedAt: version.createdAt.toISOString(),
            replayed: false,
          };
        });
      } catch (error: unknown) {
        if (error instanceof ReplayDetected) {
          // A concurrent request with the same key won the race and already published
          // exactly this output. Return its result and let compensation drop our bytes.
          const replay = await this.findReplay(
            input,
            source,
            options.templateId,
            options.templateVersion,
          );
          if (replay) {
            await this.deletePublished([options.storageKey]);
            return replay;
          }
          throw generationConflict(
            'GENERATION_IDEMPOTENCY_KEY_CONFLICT',
            'This idempotency key was already used for a different generated document.',
          );
        }
        if (this.isLogicalDocumentRace(error) && attempt < 2) {
          // Another request created the logical document first. Retry so this attempt
          // adds a version to that document instead of a duplicate logical record.
          continue;
        }
        throw error;
      }
    }

    throw generationConflict(
      'GENERATION_CONCURRENCY_RETRY_EXHAUSTED',
      'The generation could not be serialized. Retry the request.',
    );
  }

  /**
   * Resolves the single logical document for this source/output-family/language and
   * holds its row lock, creating it on first generation.
   *
   * The deterministic `generatedDocumentKey` carries a database unique index, so two
   * concurrent first generations cannot both create a logical record: the loser sees a
   * unique violation and retries onto the winner's row.
   */
  private async lockOrCreateLogicalDocument(
    tx: Tx,
    options: {
      source: ResolvedSource;
      input: DocumentGenerationRequest;
      actorUserId: string;
      logicalKey: string;
    },
  ): Promise<{ id: string }> {
    const { source, input, actorUserId, logicalKey } = options;
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Document" WHERE "generatedDocumentKey" = ${logicalKey} FOR UPDATE`;
    const existingId = locked[0]?.id;
    if (existingId) {
      const document = await tx.document.findUniqueOrThrow({
        where: { id: existingId },
        select: { id: true, status: true, archivedAt: true },
      });
      if (document.status === DocumentStatus.ARCHIVED || document.archivedAt) {
        throw generationConflict(
          'GENERATED_DOCUMENT_ARCHIVED',
          'Archived generated documents cannot receive a new version.',
        );
      }
      return { id: document.id };
    }

    return tx.document.create({
      data: {
        title: source.title,
        documentType: source.documentType,
        visibility: DocumentVisibility.INTERNAL_ONLY,
        generated: true,
        outputFamily: this.outputFamily(input.outputFamily),
        generatedSourceType: source.sourceType,
        generatedDocumentKey: logicalKey,
        generatedLanguage: input.language,
        ownerUserId: null,
        createdByUserId: actorUserId,
        clientId: source.context.clientId,
        trainingEnrollmentId: source.context.trainingEnrollmentId,
        commercialQuotationId:
          source.sourceType === GeneratedDocumentSource.COMMERCIAL_QUOTATION
            ? source.sourceId
            : null,
        commercialContractId:
          source.sourceType === GeneratedDocumentSource.COMMERCIAL_CONTRACT
            ? source.sourceId
            : null,
        purchaseOrderId:
          source.sourceType === GeneratedDocumentSource.PURCHASE_ORDER ? source.sourceId : null,
        invoiceId: source.sourceType === GeneratedDocumentSource.INVOICE ? source.sourceId : null,
        status: DocumentStatus.DRAFT,
      },
      select: { id: true },
    });
  }

  /**
   * Idempotent replay lookup.
   *
   * The same key with the same effective request returns the original version. The same
   * key against a different source, output family, language, or template is a
   * deterministic conflict rather than a silently mismatched result.
   */
  private async findReplay(
    input: DocumentGenerationRequest,
    source: ResolvedSource,
    templateId: string,
    templateVersion: number,
  ): Promise<DocumentGenerationResponse['generated'] | null> {
    const existing = await this.prisma.documentVersion.findUnique({
      where: { generationIdempotencyKey: input.idempotencyKey },
      include: { document: true },
    });
    if (!existing) {
      return null;
    }
    const document = existing.document;
    const matches =
      document.generatedSourceType === source.sourceType &&
      this.sourceIdOf(document) === source.sourceId &&
      existing.outputFamily === this.outputFamily(input.outputFamily) &&
      existing.generationLanguage === input.language &&
      existing.templateId === templateId &&
      existing.templateVersion === templateVersion;
    if (!matches) {
      throw generationConflict(
        'GENERATION_IDEMPOTENCY_KEY_CONFLICT',
        'This idempotency key was already used for a different generated document.',
      );
    }
    return {
      documentId: document.id,
      versionId: existing.id,
      versionNumber: existing.versionNumber,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      documentType: document.documentType,
      outputFamily: input.outputFamily,
      language: input.language,
      templateId,
      templateVersion,
      filename: existing.filename,
      mimeType: existing.mimeType,
      sizeBytes: Number(existing.sizeBytes),
      checksumSha256: existing.checksumSha256 ?? '',
      generatedByUserId: existing.createdByUserId,
      generatedAt: existing.createdAt.toISOString(),
      replayed: true,
    };
  }

  private sourceIdOf(document: {
    generatedSourceType: GeneratedDocumentSource | null;
    commercialQuotationId: string | null;
    commercialContractId: string | null;
    purchaseOrderId: string | null;
    invoiceId: string | null;
    trainingEnrollmentId: string | null;
  }): string | null {
    switch (document.generatedSourceType) {
      case GeneratedDocumentSource.COMMERCIAL_QUOTATION:
        return document.commercialQuotationId;
      case GeneratedDocumentSource.COMMERCIAL_CONTRACT:
        return document.commercialContractId;
      case GeneratedDocumentSource.PURCHASE_ORDER:
        return document.purchaseOrderId;
      case GeneratedDocumentSource.INVOICE:
        return document.invoiceId;
      case GeneratedDocumentSource.TRAINING_ENROLLMENT:
        return document.trainingEnrollmentId;
      default:
        return null;
    }
  }

  // --------------------------------------------------------------------------
  // Source resolution, authorization, and lifecycle eligibility
  // --------------------------------------------------------------------------

  private async resolveQuotation(
    quotationId: string,
    actorUserId: string,
    access: GenerationAccess,
  ): Promise<ResolvedSource> {
    this.assertCommercialRead(access, access.quotationsView);
    const quotation = await this.prisma.commercialQuotation.findUnique({
      where: { id: quotationId },
      include: {
        client: { select: { name: true } },
        recruitmentMission: { select: { title: true } },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!quotation) {
      throw generationSourceNotFound();
    }
    await this.assertCommercialSourceScope(quotation, actorUserId, access, this.prisma);
    this.assertQuotationEligible(quotation.status, quotation.archivedAt);

    return {
      sourceType: GeneratedDocumentSource.COMMERCIAL_QUOTATION,
      sourceId: quotation.id,
      documentType: DocumentType.QUOTATION,
      title: `Quotation ${sanitizeText(quotation.reference)}`,
      filenameStem: `quotation-${quotation.reference}`,
      context: { clientId: quotation.clientId, trainingEnrollmentId: null },
      view: {
        kind: 'COMMERCIAL_QUOTATION',
        reference: quotation.reference,
        status: quotation.status,
        currency: quotation.currency,
        issueDate: quotation.issueDate,
        validUntil: quotation.validUntil,
        subtotalCents: quotation.subtotalCents,
        taxCents: quotation.taxCents,
        totalCents: quotation.totalCents,
        lines: quotation.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          taxRateBps: line.taxRateBps,
          lineSubtotalCents: line.lineSubtotalCents,
          lineTaxCents: line.lineTaxCents,
          lineTotalCents: line.lineTotalCents,
        })),
        party: {
          clientName: quotation.client.name,
          missionTitle: quotation.recruitmentMission?.title ?? null,
        },
      },
      fingerprint: this.quotationFingerprint(quotation),
      stabilize: (tx) => this.stabilizeCommercial(tx, 'CommercialQuotation', quotation),
      resnapshot: async (tx) => {
        const current = await tx.commercialQuotation.findUnique({
          where: { id: quotationId },
          include: {
            client: { select: { name: true } },
            recruitmentMission: { select: { title: true } },
            lines: { orderBy: { sortOrder: 'asc' } },
          },
        });
        if (!current) {
          throw generationSourceNotFound();
        }
        this.assertQuotationEligible(current.status, current.archivedAt);
        return this.quotationFingerprint(current);
      },
    };
  }

  private quotationFingerprint(quotation: {
    id: string;
    reference: string;
    status: string;
    clientId: string;
    recruitmentMissionId: string | null;
    currency: string;
    issueDate: Date | null;
    validUntil: Date | null;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    archivedAt: Date | null;
    client: { name: string };
    recruitmentMission: { title: string } | null;
    lines: {
      sortOrder: number;
      description: string;
      quantity: number;
      unitPriceCents: number;
      taxRateBps: number;
      lineSubtotalCents: number;
      lineTaxCents: number;
      lineTotalCents: number;
    }[];
  }): string {
    return this.fingerprintOf([
      'COMMERCIAL_QUOTATION',
      quotation.id,
      quotation.reference,
      quotation.status,
      quotation.clientId,
      quotation.recruitmentMissionId,
      quotation.currency,
      quotation.issueDate,
      quotation.validUntil,
      quotation.subtotalCents,
      quotation.taxCents,
      quotation.totalCents,
      quotation.archivedAt,
      quotation.client.name,
      quotation.recruitmentMission?.title ?? null,
      quotation.lines.length,
      ...quotation.lines.flatMap((line) => [
        line.sortOrder,
        line.description,
        line.quantity,
        line.unitPriceCents,
        line.taxRateBps,
        line.lineSubtotalCents,
        line.lineTaxCents,
        line.lineTotalCents,
      ]),
    ]);
  }

  private async resolvePurchaseOrder(
    purchaseOrderId: string,
    actorUserId: string,
    access: GenerationAccess,
  ): Promise<ResolvedSource> {
    this.assertCommercialRead(access, access.purchaseOrdersView);
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        client: { select: { name: true } },
        recruitmentMission: { select: { title: true } },
      },
    });
    if (!order) {
      throw generationSourceNotFound();
    }
    await this.assertCommercialSourceScope(order, actorUserId, access, this.prisma);
    this.assertPurchaseOrderEligible(order.status, order.archivedAt);

    return {
      sourceType: GeneratedDocumentSource.PURCHASE_ORDER,
      sourceId: order.id,
      documentType: DocumentType.PURCHASE_ORDER,
      title: `Purchase order ${sanitizeText(order.reference)}`,
      filenameStem: `purchase-order-${order.reference}`,
      context: { clientId: order.clientId, trainingEnrollmentId: null },
      view: {
        kind: 'PURCHASE_ORDER',
        reference: order.reference,
        status: order.status,
        currency: order.currency,
        amountCents: order.amountCents,
        taxCents: order.taxCents,
        totalCents: order.totalCents,
        issueDate: order.issueDate,
        receivedDate: order.receivedDate,
        party: {
          clientName: order.client.name,
          missionTitle: order.recruitmentMission?.title ?? null,
        },
      },
      fingerprint: this.purchaseOrderFingerprint(order),
      stabilize: (tx) => this.stabilizeCommercial(tx, 'PurchaseOrder', order),
      resnapshot: async (tx) => {
        const current = await tx.purchaseOrder.findUnique({
          where: { id: purchaseOrderId },
          include: {
            client: { select: { name: true } },
            recruitmentMission: { select: { title: true } },
          },
        });
        if (!current) {
          throw generationSourceNotFound();
        }
        this.assertPurchaseOrderEligible(current.status, current.archivedAt);
        return this.purchaseOrderFingerprint(current);
      },
    };
  }

  private purchaseOrderFingerprint(order: {
    id: string;
    reference: string;
    status: string;
    clientId: string;
    recruitmentMissionId: string | null;
    currency: string;
    amountCents: number;
    taxCents: number;
    totalCents: number;
    issueDate: Date | null;
    receivedDate: Date | null;
    archivedAt: Date | null;
    client: { name: string };
    recruitmentMission: { title: string } | null;
  }): string {
    return this.fingerprintOf([
      'PURCHASE_ORDER',
      order.id,
      order.reference,
      order.status,
      order.clientId,
      order.recruitmentMissionId,
      order.currency,
      order.amountCents,
      order.taxCents,
      order.totalCents,
      order.issueDate,
      order.receivedDate,
      order.archivedAt,
      order.client.name,
      order.recruitmentMission?.title ?? null,
    ]);
  }

  private async resolveContract(
    contractId: string,
    actorUserId: string,
    access: GenerationAccess,
  ): Promise<ResolvedSource> {
    this.assertCommercialRead(access, access.contractsView);
    const contract = await this.prisma.commercialContract.findUnique({
      where: { id: contractId },
      include: {
        client: { select: { name: true } },
        recruitmentMission: { select: { title: true } },
      },
    });
    if (!contract) {
      throw generationSourceNotFound();
    }
    await this.assertCommercialSourceScope(contract, actorUserId, access, this.prisma);
    this.assertContractEligible(contract.status, contract.archivedAt);

    // The two contract taxonomies never collapse: the business type of the
    // authoritative record decides the document type, and a database check constraint
    // enforces the same pairing.
    const documentType =
      contract.businessType === CommercialContractBusinessType.RECRUITMENT
        ? DocumentType.CONTRAT_RECRUTEMENT
        : DocumentType.CONTRAT_FORMATION;

    return {
      sourceType: GeneratedDocumentSource.COMMERCIAL_CONTRACT,
      sourceId: contract.id,
      documentType,
      title: `Contract ${sanitizeText(contract.reference)}`,
      filenameStem: `${
        contract.businessType === CommercialContractBusinessType.RECRUITMENT
          ? 'contrat-recrutement'
          : 'contrat-formation'
      }-${contract.reference}`,
      context: { clientId: contract.clientId, trainingEnrollmentId: null },
      view: {
        kind: 'COMMERCIAL_CONTRACT',
        reference: contract.reference,
        businessType: contract.businessType,
        status: contract.status,
        currency: contract.currency,
        contractValueCents: contract.contractValueCents,
        taxCents: contract.taxCents,
        totalCents: contract.totalCents,
        termsSummary: contract.termsSummary,
        effectiveDate: contract.effectiveDate,
        startDate: contract.startDate,
        endDate: contract.endDate,
        party: {
          clientName: contract.client.name,
          missionTitle: contract.recruitmentMission?.title ?? null,
        },
      },
      fingerprint: this.contractFingerprint(contract),
      stabilize: (tx) => this.stabilizeCommercial(tx, 'CommercialContract', contract),
      resnapshot: async (tx) => {
        const current = await tx.commercialContract.findUnique({
          where: { id: contractId },
          include: {
            client: { select: { name: true } },
            recruitmentMission: { select: { title: true } },
          },
        });
        if (!current) {
          throw generationSourceNotFound();
        }
        this.assertContractEligible(current.status, current.archivedAt);
        return this.contractFingerprint(current);
      },
    };
  }

  private contractFingerprint(contract: {
    id: string;
    reference: string;
    businessType: string;
    status: string;
    clientId: string;
    recruitmentMissionId: string | null;
    currency: string;
    contractValueCents: number;
    taxCents: number;
    totalCents: number;
    termsSummary: string | null;
    effectiveDate: Date | null;
    startDate: Date | null;
    endDate: Date | null;
    archivedAt: Date | null;
    client: { name: string };
    recruitmentMission: { title: string } | null;
  }): string {
    return this.fingerprintOf([
      'COMMERCIAL_CONTRACT',
      contract.id,
      contract.reference,
      contract.businessType,
      contract.status,
      contract.clientId,
      contract.recruitmentMissionId,
      contract.currency,
      contract.contractValueCents,
      contract.taxCents,
      contract.totalCents,
      contract.termsSummary,
      contract.effectiveDate,
      contract.startDate,
      contract.endDate,
      contract.archivedAt,
      contract.client.name,
      contract.recruitmentMission?.title ?? null,
    ]);
  }

  private async resolveInvoice(
    invoiceId: string,
    actorUserId: string,
    access: GenerationAccess,
  ): Promise<ResolvedSource> {
    this.assertCommercialRead(access, access.invoicesView);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: { select: { name: true } },
        recruitmentMission: { select: { title: true } },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!invoice) {
      throw generationSourceNotFound();
    }
    await this.assertCommercialSourceScope(invoice, actorUserId, access, this.prisma);
    this.assertInvoiceEligible(invoice.status, invoice.archivedAt);

    return {
      sourceType: GeneratedDocumentSource.INVOICE,
      sourceId: invoice.id,
      documentType: DocumentType.INVOICE,
      title: `Invoice ${sanitizeText(invoice.reference)}`,
      filenameStem: `invoice-${invoice.reference}`,
      context: { clientId: invoice.clientId, trainingEnrollmentId: null },
      // Issued invoice values are the immutable snapshot Issue #38 persisted. They are
      // copied verbatim: no total, tax, or line amount is recomputed here, and
      // placement eligibility is never re-evaluated.
      view: {
        kind: 'INVOICE',
        reference: invoice.reference,
        status: invoice.status,
        currency: invoice.currency,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        subtotalCents: invoice.subtotalCents,
        taxCents: invoice.taxCents,
        totalCents: invoice.totalCents,
        lines: invoice.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          taxRateBps: line.taxRateBps,
          lineSubtotalCents: line.lineSubtotalCents,
          lineTaxCents: line.lineTaxCents,
          lineTotalCents: line.lineTotalCents,
        })),
        party: {
          clientName: invoice.client.name,
          missionTitle: invoice.recruitmentMission?.title ?? null,
        },
      },
      fingerprint: this.invoiceFingerprint(invoice),
      stabilize: (tx) => this.stabilizeCommercial(tx, 'Invoice', invoice),
      resnapshot: async (tx) => {
        const current = await tx.invoice.findUnique({
          where: { id: invoiceId },
          include: {
            client: { select: { name: true } },
            recruitmentMission: { select: { title: true } },
            lines: { orderBy: { sortOrder: 'asc' } },
          },
        });
        if (!current) {
          throw generationSourceNotFound();
        }
        this.assertInvoiceEligible(current.status, current.archivedAt);
        return this.invoiceFingerprint(current);
      },
    };
  }

  private invoiceFingerprint(invoice: {
    id: string;
    reference: string;
    status: string;
    clientId: string;
    recruitmentMissionId: string | null;
    currency: string;
    issueDate: Date | null;
    dueDate: Date | null;
    issuedAt: Date | null;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    archivedAt: Date | null;
    client: { name: string };
    recruitmentMission: { title: string } | null;
    lines: {
      sortOrder: number;
      description: string;
      quantity: number;
      unitPriceCents: number;
      taxRateBps: number;
      lineSubtotalCents: number;
      lineTaxCents: number;
      lineTotalCents: number;
    }[];
  }): string {
    return this.fingerprintOf([
      'INVOICE',
      invoice.id,
      invoice.reference,
      invoice.status,
      invoice.clientId,
      invoice.recruitmentMissionId,
      invoice.currency,
      invoice.issueDate,
      invoice.dueDate,
      invoice.issuedAt,
      invoice.subtotalCents,
      invoice.taxCents,
      invoice.totalCents,
      invoice.archivedAt,
      invoice.client.name,
      invoice.recruitmentMission?.title ?? null,
      invoice.lines.length,
      ...invoice.lines.flatMap((line) => [
        line.sortOrder,
        line.description,
        line.quantity,
        line.unitPriceCents,
        line.taxRateBps,
        line.lineSubtotalCents,
        line.lineTaxCents,
        line.lineTotalCents,
      ]),
    ]);
  }

  private async resolveCertificate(
    programId: string,
    enrollmentId: string,
    actorUserId: string,
    access: GenerationAccess,
  ): Promise<ResolvedSource> {
    if (!access.trainingEnrollmentsView) {
      throw generationSourceNotFound();
    }
    // Program visibility follows the merged training source rule exactly.
    const program = await this.prisma.trainingProgram.findFirst({
      where: { id: programId, ...this.visibleTrainingProgramScope(actorUserId, access) },
      include: { client: { select: { name: true } } },
    });
    if (!program) {
      throw generationSourceNotFound();
    }
    const enrollment = await this.prisma.trainingEnrollment.findFirst({
      where: { id: enrollmentId, trainingProgramId: programId },
      include: {
        candidate: { select: { displayName: true } },
        user: { select: { displayName: true } },
        clientContact: { select: { displayName: true } },
        externalTrainingParticipant: { select: { displayName: true } },
      },
    });
    if (!enrollment) {
      throw generationSourceNotFound();
    }
    this.assertCertificateEligible(enrollment);
    const participantName = this.resolveParticipantName(enrollment, access);

    return {
      sourceType: GeneratedDocumentSource.TRAINING_ENROLLMENT,
      sourceId: enrollment.id,
      documentType: DocumentType.TRAINING_CERTIFICATE,
      title: `Training certificate ${sanitizeText(program.reference)}`,
      filenameStem: `training-certificate-${program.reference}`,
      context: { clientId: null, trainingEnrollmentId: enrollment.id },
      view: {
        kind: 'TRAINING_ENROLLMENT',
        reference: program.reference,
        participantName,
        programReference: program.reference,
        programName: program.name,
        completedAt: enrollment.completedAt,
        clientName: program.client?.name ?? null,
      },
      fingerprint: this.certificateFingerprint(program, enrollment, participantName),
      // Certificate stabilization: the client the program is linked to, then the program,
      // then the enrollment, then the participant row whose display name is rendered.
      // Nothing in the merged code holds a participant row and then asks for a program or
      // client row, so this order introduces no inversion.
      stabilize: async (tx) => {
        await this.lockRowsForShare(tx, 'Client', program.clientId ? [program.clientId] : []);
        await this.lockRowsForShare(tx, 'TrainingProgram', [program.id]);
        await this.lockRowsForShare(tx, 'TrainingEnrollment', [enrollment.id]);
        await this.lockRowsForShare(
          tx,
          'Candidate',
          enrollment.candidateId ? [enrollment.candidateId] : [],
        );
        await this.lockRowsForShare(
          tx,
          'ClientContact',
          enrollment.clientContactId ? [enrollment.clientContactId] : [],
        );
        await this.lockRowsForShare(tx, 'User', enrollment.userId ? [enrollment.userId] : []);
        await this.lockRowsForShare(
          tx,
          'ExternalTrainingParticipant',
          enrollment.externalTrainingParticipantId
            ? [enrollment.externalTrainingParticipantId]
            : [],
        );
      },
      resnapshot: async (tx) => {
        const currentProgram = await tx.trainingProgram.findUnique({
          where: { id: programId },
          include: { client: { select: { name: true } } },
        });
        const current = await tx.trainingEnrollment.findFirst({
          where: { id: enrollmentId, trainingProgramId: programId },
          include: {
            candidate: { select: { displayName: true } },
            user: { select: { displayName: true } },
            clientContact: { select: { displayName: true } },
            externalTrainingParticipant: { select: { displayName: true } },
          },
        });
        if (!currentProgram || !current) {
          throw generationSourceNotFound();
        }
        this.assertCertificateEligible(current);
        return this.certificateFingerprint(
          currentProgram,
          current,
          this.resolveParticipantName(current, access),
        );
      },
    };
  }

  private certificateFingerprint(
    program: {
      id: string;
      reference: string;
      name: string;
      clientId: string | null;
      archivedAt: Date | null;
      client: { name: string } | null;
    },
    enrollment: {
      id: string;
      participantType: string;
      status: string;
      completedAt: Date | null;
      withdrawnAt: Date | null;
      archivedAt: Date | null;
      certificateStatus: string;
    },
    participantName: string,
  ): string {
    return this.fingerprintOf([
      'TRAINING_ENROLLMENT',
      enrollment.id,
      enrollment.participantType,
      enrollment.status,
      enrollment.completedAt,
      enrollment.withdrawnAt,
      enrollment.archivedAt,
      enrollment.certificateStatus,
      participantName,
      program.id,
      program.reference,
      program.name,
      program.clientId,
      program.archivedAt,
      program.client?.name ?? null,
    ]);
  }

  /**
   * Participant identity follows the merged training participant rule: a candidate name
   * needs `candidates:view`, a client-contact name needs `clients:view` plus
   * `client_contacts:view`. Internal users and external training participants are
   * training-owned. Missing source capability fails closed with the same envelope as a
   * hidden or nonexistent enrollment.
   */
  private resolveParticipantName(
    enrollment: {
      participantType: string;
      candidate: { displayName: string } | null;
      user: { displayName: string } | null;
      clientContact: { displayName: string } | null;
      externalTrainingParticipant: { displayName: string } | null;
    },
    access: GenerationAccess,
  ): string {
    switch (enrollment.participantType) {
      case 'CANDIDATE':
        if (!access.candidatesView || !enrollment.candidate) {
          throw generationSourceNotFound();
        }
        return enrollment.candidate.displayName;
      case 'CLIENT_CONTACT':
        if (!access.clientsView || !access.clientContactsView || !enrollment.clientContact) {
          throw generationSourceNotFound();
        }
        return enrollment.clientContact.displayName;
      case 'USER':
        if (!enrollment.user) {
          throw generationSourceNotFound();
        }
        return enrollment.user.displayName;
      default:
        if (!enrollment.externalTrainingParticipant) {
          throw generationSourceNotFound();
        }
        return enrollment.externalTrainingParticipant.displayName;
    }
  }

  // --------------------------------------------------------------------------
  // Lifecycle eligibility
  // --------------------------------------------------------------------------

  /** A quotation may be published once issued, and while it is still a live record. */
  private assertQuotationEligible(status: QuotationStatus, archivedAt: Date | null): void {
    const allowed: QuotationStatus[] = [
      QuotationStatus.ISSUED,
      QuotationStatus.ACCEPTED,
      QuotationStatus.REJECTED,
      QuotationStatus.EXPIRED,
    ];
    if (archivedAt || !allowed.includes(status)) {
      throw generationConflict(
        'GENERATION_SOURCE_NOT_ELIGIBLE',
        'Only an issued, non-archived, non-canceled quotation can be generated.',
      );
    }
  }

  private assertPurchaseOrderEligible(status: PurchaseOrderStatus, archivedAt: Date | null): void {
    const allowed: PurchaseOrderStatus[] = [
      PurchaseOrderStatus.DRAFT,
      PurchaseOrderStatus.RECEIVED,
    ];
    if (archivedAt || !allowed.includes(status)) {
      throw generationConflict(
        'GENERATION_SOURCE_NOT_ELIGIBLE',
        'A canceled or archived purchase order cannot be generated.',
      );
    }
  }

  private assertContractEligible(status: CommercialContractStatus, archivedAt: Date | null): void {
    const allowed: CommercialContractStatus[] = [
      CommercialContractStatus.DRAFT,
      CommercialContractStatus.ACTIVE,
      CommercialContractStatus.COMPLETED,
    ];
    if (archivedAt || !allowed.includes(status)) {
      throw generationConflict(
        'GENERATION_SOURCE_NOT_ELIGIBLE',
        'A canceled or archived contract cannot be generated.',
      );
    }
  }

  /**
   * Only an issued invoice produces an official invoice output. Draft invoices are not
   * yet authoritative, and canceled or archived invoices are not receivable, which
   * matches the merged commercial and accounting rules.
   */
  private assertInvoiceEligible(status: InvoiceStatus, archivedAt: Date | null): void {
    if (archivedAt || status !== InvoiceStatus.ISSUED) {
      throw generationConflict(
        'GENERATION_SOURCE_NOT_ELIGIBLE',
        'Only an issued, non-canceled, non-archived invoice can be generated.',
      );
    }
  }

  /**
   * Certificate readiness reuses the merged training boundary rather than approximating
   * it: completed, not withdrawn, not archived, and explicitly `PENDING`.
   * `NOT_APPLICABLE` is never ready, and `ISSUED` is not re-generated implicitly.
   *
   * Generating the file does not transition the enrollment. Certificate issuance stays
   * an explicit audited training action through
   * `POST /v1/training/programs/:id/enrollments/:id/certificate-status`; this issue only
   * renders a file for an enrollment the training domain already declared ready.
   */
  private assertCertificateEligible(enrollment: {
    completedAt: Date | null;
    archivedAt: Date | null;
    withdrawnAt: Date | null;
    certificateStatus: CertificateStatus;
  }): void {
    const ready =
      enrollment.completedAt !== null &&
      enrollment.archivedAt === null &&
      enrollment.withdrawnAt === null &&
      enrollment.certificateStatus === CertificateStatus.PENDING;
    if (!ready) {
      throw generationConflict(
        'GENERATION_SOURCE_NOT_ELIGIBLE',
        'Only a certificate-ready training enrollment can be generated.',
      );
    }
  }

  // --------------------------------------------------------------------------
  // Access
  // --------------------------------------------------------------------------

  private async resolveAccess(actorUserId: string): Promise<GenerationAccess> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    const has = (code: string) => permissions.includes(code);
    return {
      generate: has(GENERATION_PERMISSIONS.DOCUMENTS_GENERATE),
      documentsView: has(DOCUMENT_PERMISSIONS.DOCUMENTS_VIEW),
      commercialData: has(COMMERCIAL_PERMISSIONS.COMMERCIAL_DATA_ACCESS),
      quotationsView: has(COMMERCIAL_PERMISSIONS.QUOTATIONS_VIEW),
      contractsView: has(COMMERCIAL_PERMISSIONS.CONTRACTS_VIEW),
      purchaseOrdersView: has(COMMERCIAL_PERMISSIONS.PURCHASE_ORDERS_VIEW),
      invoicesView: has(COMMERCIAL_PERMISSIONS.INVOICES_VIEW),
      clientsView: has(CLIENT_PERMISSIONS.CLIENTS_VIEW),
      missionsView: has(MISSION_PERMISSIONS.MISSIONS_VIEW),
      missionCandidatesTransfer: has(MISSION_PERMISSIONS.MISSION_CANDIDATES_TRANSFER),
      candidatesView: has(CANDIDATE_PERMISSIONS.CANDIDATES_VIEW),
      clientContactsView: has(TRAINING_PERMISSIONS.CLIENT_CONTACTS_VIEW),
      trainingProgramsView: has(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW),
      trainingProgramsViewAll: has(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW_ALL),
      trainingEnrollmentsView: has(TRAINING_PERMISSIONS.TRAINING_ENROLLMENTS_VIEW),
    };
  }

  /**
   * A commercial output always renders amounts, so it needs the matching source view
   * capability and `commercial_data:access` together. A missing capability is a
   * not-found, keeping hidden and nonexistent records indistinguishable.
   */
  private assertCommercialRead(access: GenerationAccess, sourceView: boolean): void {
    if (!sourceView || !access.commercialData) {
      throw generationSourceNotFound();
    }
  }

  /** The merged commercial source-scope rule, reused verbatim. */
  private async assertCommercialSourceScope(
    record: { clientId: string; recruitmentMissionId: string | null },
    actorUserId: string,
    access: GenerationAccess,
    prisma: PrismaLike,
  ): Promise<void> {
    if (!access.clientsView) {
      throw generationSourceNotFound();
    }
    const client = await prisma.client.findUnique({ where: { id: record.clientId } });
    if (!client) {
      throw generationSourceNotFound();
    }
    if (!record.recruitmentMissionId) {
      return;
    }
    if (!access.missionsView) {
      throw generationSourceNotFound();
    }
    const mission = await prisma.recruitmentMission.findUnique({
      where: { id: record.recruitmentMissionId },
      select: { id: true, clientId: true },
    });
    if (!mission || mission.clientId !== record.clientId) {
      throw generationSourceNotFound();
    }
    if (access.missionCandidatesTransfer) {
      return;
    }
    const assignment = await prisma.missionRecruiter.findFirst({
      where: {
        missionId: record.recruitmentMissionId,
        userId: actorUserId,
        status: AssignmentStatus.ACTIVE,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!assignment) {
      throw generationSourceNotFound();
    }
  }

  /** The merged `TrainingService` program visibility rule, mirrored as a predicate. */
  private visibleTrainingProgramScope(
    actorUserId: string,
    access: GenerationAccess,
  ): Prisma.TrainingProgramWhereInput {
    if (!access.trainingProgramsView && !access.trainingProgramsViewAll) {
      return { id: '00000000-0000-0000-0000-000000000000' };
    }
    const clientScope: Prisma.TrainingProgramWhereInput = access.clientsView
      ? {}
      : { clientId: null };
    if (access.trainingProgramsViewAll) {
      return clientScope;
    }
    return {
      AND: [
        clientScope,
        {
          OR: [
            { ownerUserId: actorUserId },
            { sessions: { some: { trainerUserId: actorUserId } } },
          ],
        },
      ],
    };
  }

  // --------------------------------------------------------------------------
  // Naming, storage keys, helpers
  // --------------------------------------------------------------------------

  /**
   * Deterministic fingerprint over exactly the authoritative values an output renders.
   *
   * The input is an ordered array of primitives, so there is no object key-ordering
   * ambiguity and no dependence on `updatedAt`, which would not change when a child line
   * row is edited. Dates are normalised to ISO strings and nulls to an explicit marker,
   * so two different shapes can never hash alike.
   */
  private fingerprintOf(parts: readonly (string | number | boolean | Date | null)[]): string {
    const canonical = parts.map((part) => {
      if (part === null) {
        return '\u0000null';
      }
      if (part instanceof Date) {
        return `\u0000date:${part.toISOString()}`;
      }
      return `\u0000${typeof part}:${String(part)}`;
    });
    return createHash('sha256').update(canonical.join('\u0001')).digest('hex');
  }

  /**
   * Takes a shared row lock, in a fixed table order.
   *
   * The order below is derived from the merged mutation paths rather than invented:
   * every merged transaction that touches more than one of these tables acquires them
   * parent-first, so generation never requests a lock in the opposite direction and no
   * cross-domain cycle can form.
   *
   * - Commercial writes lock `Client`, then `RecruitmentMission`, then the commercial
   *   root; accounting locks `Client`, then `Payment`, then `Invoice`.
   * - Mission-candidate writes lock `RecruitmentMission`, then `MissionCandidate`, then
   *   `Candidate`.
   * - Training writes lock `TrainingProgram`, then session, then `TrainingEnrollment`.
   * - Document writes lock only `Document`, always last.
   *
   * No merged path holds a participant, program, or enrollment row and then requests a
   * `Client` or commercial row, so placing `Client` first is safe for every family.
   */
  private async lockRowsForShare(
    tx: Tx,
    table: LockableTable,
    ids: readonly string[],
  ): Promise<void> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();
    for (const id of unique) {
      await lockRowForShare(tx, table, id);
    }
  }

  /**
   * Commercial stabilization: client, optional mission, then the commercial root.
   *
   * Child line rows are not locked individually because they are only ever written under
   * the root row's exclusive lock, which this shared lock on the root already blocks.
   */
  private async stabilizeCommercial(
    tx: Tx,
    table: CommercialRootTable,
    record: { id: string; clientId: string; recruitmentMissionId: string | null },
  ): Promise<void> {
    await this.lockRowsForShare(tx, 'Client', [record.clientId]);
    await this.lockRowsForShare(
      tx,
      'RecruitmentMission',
      record.recruitmentMissionId ? [record.recruitmentMissionId] : [],
    );
    await this.lockRowsForShare(tx, table, [record.id]);
  }

  private logicalDocumentKey(
    sourceType: GeneratedDocumentSource,
    sourceId: string,
    outputFamily: GenerationOutputFamily,
    language: GenerationLanguage,
  ): string {
    return `${sourceType}:${sourceId}:${outputFamily}:${language}`;
  }

  /**
   * Storage keys are server-generated and contain no caller-controlled text at all, so
   * a hostile business reference can never influence the on-disk path.
   */
  private buildStorageKey(logicalKey: string, outputFamily: GenerationOutputFamily): string {
    const bucket = createHash('sha256').update(logicalKey).digest('hex').slice(0, 32);
    return `documents/generated/${bucket}/${randomUUID()}.${this.extension(outputFamily)}`;
  }

  /**
   * Download filenames are deterministic and reduced to a conservative alphabet, so a
   * hostile reference cannot produce path separators, traversal segments, or control
   * characters in a Content-Disposition value.
   */
  private buildFilename(
    stem: string,
    versionNumber: number,
    outputFamily: GenerationOutputFamily,
  ): string {
    const slug =
      sanitizeText(stem)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'document';
    return `${slug}-v${versionNumber}.${this.extension(outputFamily)}`;
  }

  private extension(outputFamily: GenerationOutputFamily): string {
    return outputFamily === 'PDF' ? 'pdf' : 'docx';
  }

  private mimeType(outputFamily: GenerationOutputFamily): string {
    return outputFamily === 'PDF' ? pdfMimeType : docxMimeType;
  }

  private outputFamily(outputFamily: GenerationOutputFamily): OutputFamily {
    return outputFamily === 'PDF' ? OutputFamily.PDF : OutputFamily.WORD;
  }

  private isLogicalDocumentRace(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION &&
      JSON.stringify(error.meta ?? {}).includes('generatedDocumentKey')
    );
  }

  private async deletePublished(storageKeys: readonly string[]): Promise<void> {
    for (const key of storageKeys) {
      try {
        await this.storage.delete(key);
      } catch {
        // Compensation is best effort: an object that cannot be removed is unreferenced
        // and never reachable through the document API.
      }
    }
  }
}

/** Internal signal that a concurrent request already published this idempotency key. */
class ReplayDetected extends Error {}
