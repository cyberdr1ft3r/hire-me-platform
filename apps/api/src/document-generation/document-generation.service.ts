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
import { renderPdf } from './renderers/pdf.renderer.js';
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
  /** Re-checked inside the publishing transaction to close the snapshot race. */
  revalidate: (tx: Tx) => Promise<void>;
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
 * Lock order for a publish: **Document -> DocumentVersion**. Source business records are
 * read for the snapshot and re-validated inside the transaction, never locked, so this
 * path cannot participate in a commercial or accounting lock cycle.
 */
@Injectable()
export class DocumentGenerationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(ProtectedStorageService) private readonly storage: ProtectedStorageService,
  ) {}

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
    const bytes =
      input.outputFamily === 'PDF' ? await renderPdf(renderable) : await renderDocx(renderable);
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
          // The snapshot was taken before rendering; re-validate the source lifecycle
          // under the publishing transaction so a state change mid-render cannot be
          // published as an official output.
          await source.revalidate(tx);

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
      revalidate: async (tx) => {
        const current = await tx.commercialQuotation.findUnique({
          where: { id: quotationId },
          select: { status: true, archivedAt: true },
        });
        if (!current) {
          throw generationSourceNotFound();
        }
        this.assertQuotationEligible(current.status, current.archivedAt);
      },
    };
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
      revalidate: async (tx) => {
        const current = await tx.purchaseOrder.findUnique({
          where: { id: purchaseOrderId },
          select: { status: true, archivedAt: true },
        });
        if (!current) {
          throw generationSourceNotFound();
        }
        this.assertPurchaseOrderEligible(current.status, current.archivedAt);
      },
    };
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
      revalidate: async (tx) => {
        const current = await tx.commercialContract.findUnique({
          where: { id: contractId },
          select: { status: true, archivedAt: true },
        });
        if (!current) {
          throw generationSourceNotFound();
        }
        this.assertContractEligible(current.status, current.archivedAt);
      },
    };
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
      revalidate: async (tx) => {
        const current = await tx.invoice.findUnique({
          where: { id: invoiceId },
          select: { status: true, archivedAt: true },
        });
        if (!current) {
          throw generationSourceNotFound();
        }
        this.assertInvoiceEligible(current.status, current.archivedAt);
      },
    };
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
      revalidate: async (tx) => {
        const current = await tx.trainingEnrollment.findUnique({
          where: { id: enrollmentId },
          select: {
            completedAt: true,
            archivedAt: true,
            withdrawnAt: true,
            certificateStatus: true,
          },
        });
        if (!current) {
          throw generationSourceNotFound();
        }
        this.assertCertificateEligible(current);
      },
    };
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
