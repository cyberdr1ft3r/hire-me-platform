import { Inject, Injectable } from '@nestjs/common';
import type {
  CommercialContractCreateRequest,
  CommercialContractDetailResponse,
  CommercialContractListQuery,
  CommercialContractListResponse,
  CommercialContractStatusActionRequest,
  CommercialContractUpdateRequest,
  CommercialLineInput,
  InvoiceCancelRequest,
  InvoiceCreateRequest,
  InvoiceDetailResponse,
  InvoiceIssueRequest,
  InvoiceListQuery,
  InvoiceListResponse,
  InvoiceUpdateRequest,
  PurchaseOrderCreateRequest,
  PurchaseOrderDetailResponse,
  PurchaseOrderListQuery,
  PurchaseOrderListResponse,
  PurchaseOrderStatusActionRequest,
  PurchaseOrderUpdateRequest,
  QuotationCreateRequest,
  QuotationDetailResponse,
  QuotationListQuery,
  QuotationListResponse,
  QuotationStatusActionRequest,
  QuotationUpdateRequest,
} from '@hire-me/contracts';

import { CommercialAuditService } from './commercial-audit.service.js';
import { COMMERCIAL_PERMISSIONS } from './commercial-permissions.js';
import { badRequest, conflict, forbidden, notFound } from './commercial.errors.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import { CLIENT_PERMISSIONS } from '../clients/client-permissions.js';
import { MISSION_PERMISSIONS } from '../missions/mission-permissions.js';
import {
  AssignmentStatus,
  ClientStatus,
  CommercialContractBusinessType,
  CommercialContractStatus,
  InvoiceStatus,
  PlacementStatus,
  Prisma,
  PurchaseOrderStatus,
  QuotationStatus,
  RecruitmentMissionState,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;
type CommercialAccess = {
  commercialData: boolean;
  quotationsView: boolean;
  quotationsManage: boolean;
  contractsView: boolean;
  contractsManage: boolean;
  purchaseOrdersView: boolean;
  purchaseOrdersManage: boolean;
  invoicesView: boolean;
  invoicesManage: boolean;
  clientsView: boolean;
  missionsView: boolean;
  missionCandidatesTransfer: boolean;
  placementsView: boolean;
  placementCommercialEligibility: boolean;
};
type QuotationRecord = Prisma.CommercialQuotationGetPayload<{ include: typeof quotationInclude }>;
type ContractRecord = Prisma.CommercialContractGetPayload<{ include: typeof contractInclude }>;
type PurchaseOrderRecord = Prisma.PurchaseOrderGetPayload<{ include: typeof purchaseOrderInclude }>;
type InvoiceRecord = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;
type CalculatedLine = CommercialLineInput & {
  sortOrder: number;
  lineSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
};

const terminalMissionStates = new Set<RecruitmentMissionState>([
  RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
  RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
  RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
  RecruitmentMissionState.CANCELED,
  RecruitmentMissionState.ARCHIVED,
]);

const POSTGRES_INT_MAX = 2_147_483_647;
const IMPOSSIBLE_UUID = '00000000-0000-0000-0000-000000000000';

const quotationTransitions = new Map<QuotationStatus, Set<QuotationStatus>>([
  [QuotationStatus.DRAFT, new Set([QuotationStatus.ISSUED, QuotationStatus.CANCELED])],
  [
    QuotationStatus.ISSUED,
    new Set([
      QuotationStatus.ACCEPTED,
      QuotationStatus.REJECTED,
      QuotationStatus.EXPIRED,
      QuotationStatus.CANCELED,
    ]),
  ],
  [QuotationStatus.ACCEPTED, new Set<QuotationStatus>()],
  [QuotationStatus.REJECTED, new Set<QuotationStatus>()],
  [QuotationStatus.EXPIRED, new Set<QuotationStatus>()],
  [QuotationStatus.CANCELED, new Set<QuotationStatus>()],
]);

const contractTransitions = new Map<CommercialContractStatus, Set<CommercialContractStatus>>([
  [
    CommercialContractStatus.DRAFT,
    new Set([CommercialContractStatus.ACTIVE, CommercialContractStatus.CANCELED]),
  ],
  [
    CommercialContractStatus.ACTIVE,
    new Set([CommercialContractStatus.COMPLETED, CommercialContractStatus.CANCELED]),
  ],
  [CommercialContractStatus.COMPLETED, new Set<CommercialContractStatus>()],
  [CommercialContractStatus.CANCELED, new Set<CommercialContractStatus>()],
]);

const purchaseOrderTransitions = new Map<PurchaseOrderStatus, Set<PurchaseOrderStatus>>([
  [
    PurchaseOrderStatus.DRAFT,
    new Set([PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CANCELED]),
  ],
  [PurchaseOrderStatus.RECEIVED, new Set([PurchaseOrderStatus.CANCELED])],
  [PurchaseOrderStatus.CANCELED, new Set<PurchaseOrderStatus>()],
]);

@Injectable()
export class CommercialService {
  constructor(
    @Inject(CommercialAuditService) private readonly audit: CommercialAuditService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listQuotations(
    query: QuotationListQuery,
    actorUserId: string,
  ): Promise<QuotationListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.quotationsView, 'quotations:view', 'QUOTATIONS_VIEW_REQUIRED');
    const filters: Prisma.CommercialQuotationWhereInput = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.recruitmentMissionId ? { recruitmentMissionId: query.recruitmentMissionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.reference ? { reference: { contains: query.reference, mode: 'insensitive' } } : {}),
      ...(query.issuedFrom || query.issuedTo
        ? {
            issueDate: {
              ...(query.issuedFrom ? { gte: new Date(query.issuedFrom) } : {}),
              ...(query.issuedTo ? { lte: new Date(query.issuedTo) } : {}),
            },
          }
        : {}),
    };
    const where: Prisma.CommercialQuotationWhereInput = {
      AND: [
        this.commercialRecordScopeWhere<Prisma.CommercialQuotationWhereInput>(
          access,
          actorUserId,
          query.includeArchived,
        ),
        filters,
      ],
    };
    const [total, quotations] = await this.prisma.$transaction([
      this.prisma.commercialQuotation.count({ where }),
      this.prisma.commercialQuotation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: quotationInclude,
      }),
    ]);
    return {
      quotations: quotations.map((quotation) => this.toQuotationSummary(quotation, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getQuotation(id: string, actorUserId: string): Promise<QuotationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.quotationsView, 'quotations:view', 'QUOTATIONS_VIEW_REQUIRED');
    const quotation = await this.requireQuotation(id);
    await this.assertRecordSourceScope(quotation, actorUserId, access, this.prisma);
    return { quotation: this.toQuotationDetail(quotation, access) };
  }

  async createQuotation(
    input: QuotationCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<QuotationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.quotationsManage, 'quotations:manage');
    try {
      const quotation = await this.prisma.$transaction(async (tx) => {
        await this.lockWritableClient(input.clientId, access, tx);
        await this.assertMissionContext(
          input.clientId,
          input.recruitmentMissionId,
          actorUserId,
          access,
          tx,
        );
        const calculated = calculateLines(input.lines);
        const created = await tx.commercialQuotation.create({
          data: {
            reference: input.reference,
            clientId: input.clientId,
            recruitmentMissionId: input.recruitmentMissionId,
            currency: input.currency,
            issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
            validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
            subtotalCents: calculated.subtotalCents,
            taxCents: calculated.taxCents,
            totalCents: calculated.totalCents,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
            lines: { create: calculated.lines },
          },
        });
        await tx.commercialQuotationEvent.create({
          data: {
            quotationId: created.id,
            actorUserId,
            action: 'CREATED',
            nextStatus: QuotationStatus.DRAFT,
            safeSummary: 'Commercial quotation draft created.',
          },
        });
        await this.audit.record(
          'commercial.quotation.created',
          context,
          {
            actorUserId,
            entityType: 'CommercialQuotation',
            entityId: created.id,
            metadataSummary: 'Commercial quotation draft created.',
          },
          tx,
        );
        return tx.commercialQuotation.findUniqueOrThrow({
          where: { id: created.id },
          include: quotationInclude,
        });
      });
      return { quotation: this.toQuotationDetail(quotation, access) };
    } catch (error: unknown) {
      this.rethrowKnownCreateError(error, 'COMMERCIAL_QUOTATION_REFERENCE_EXISTS');
    }
  }

  async updateQuotation(
    id: string,
    input: QuotationUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<QuotationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.quotationsManage, 'quotations:manage');
    try {
      const quotation = await this.prisma.$transaction(async (tx) => {
        const existing = await this.lockQuotation(id, tx);
        await this.assertRecordSourceScope(existing, actorUserId, access, tx);
        if (existing.status !== QuotationStatus.DRAFT) {
          throw conflict(
            'QUOTATION_TERMINAL_MUTATION_BLOCKED',
            'Only draft quotations can change.',
          );
        }
        const calculated = input.lines ? calculateLines(input.lines) : null;
        if (calculated) {
          await tx.commercialQuotationLine.deleteMany({ where: { quotationId: id } });
        }
        await tx.commercialQuotation.update({
          where: { id },
          data: {
            ...(input.reference !== undefined ? { reference: input.reference } : {}),
            ...(input.issueDate !== undefined
              ? { issueDate: input.issueDate ? new Date(input.issueDate) : null }
              : {}),
            ...(input.validUntil !== undefined
              ? { validUntil: input.validUntil ? new Date(input.validUntil) : null }
              : {}),
            ...(calculated
              ? {
                  subtotalCents: calculated.subtotalCents,
                  taxCents: calculated.taxCents,
                  totalCents: calculated.totalCents,
                  lines: { create: calculated.lines },
                }
              : {}),
            updatedByUserId: actorUserId,
          },
        });
        await tx.commercialQuotationEvent.create({
          data: {
            quotationId: id,
            actorUserId,
            action: 'UPDATED',
            safeSummary: 'Editable quotation metadata or lines updated.',
          },
        });
        await this.audit.record(
          'commercial.quotation.updated',
          context,
          {
            actorUserId,
            entityType: 'CommercialQuotation',
            entityId: id,
            metadataSummary: 'Editable quotation fields updated.',
          },
          tx,
        );
        return tx.commercialQuotation.findUniqueOrThrow({
          where: { id },
          include: quotationInclude,
        });
      });
      return { quotation: this.toQuotationDetail(quotation, access) };
    } catch (error: unknown) {
      this.rethrowKnownCreateError(error, 'COMMERCIAL_QUOTATION_REFERENCE_EXISTS');
    }
  }

  async updateQuotationStatus(
    id: string,
    input: QuotationStatusActionRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<QuotationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.quotationsManage, 'quotations:manage');
    const { quotation } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockQuotation(id, tx);
      await this.assertRecordSourceScope(existing, actorUserId, access, tx);
      if (existing.status === input.status) {
        return { quotation: await this.reloadQuotation(id, tx), changed: false };
      }
      this.assertTransition(
        quotationTransitions,
        existing.status,
        input.status,
        'QUOTATION_INVALID_TRANSITION',
      );
      await tx.commercialQuotation.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.status === QuotationStatus.ISSUED && !existing.issueDate
            ? { issueDate: new Date() }
            : {}),
          updatedByUserId: actorUserId,
        },
      });
      await tx.commercialQuotationEvent.create({
        data: {
          quotationId: id,
          actorUserId,
          action: 'STATUS_CHANGED',
          previousStatus: existing.status,
          nextStatus: input.status,
          reason: input.reason,
          safeSummary: `Quotation moved to ${input.status}.`,
        },
      });
      await this.audit.record(
        'commercial.quotation.status_changed',
        context,
        {
          actorUserId,
          entityType: 'CommercialQuotation',
          entityId: id,
          metadataSummary: `Quotation lifecycle changed to ${input.status}.`,
        },
        tx,
      );
      return { quotation: await this.reloadQuotation(id, tx), changed: true };
    });
    return { quotation: this.toQuotationDetail(quotation, access) };
  }

  async archiveQuotation(
    id: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<QuotationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.quotationsManage, 'quotations:manage');
    const { quotation } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockQuotation(id, tx, { allowArchived: true });
      await this.assertRecordSourceScope(existing, actorUserId, access, tx);
      if (existing.status === QuotationStatus.ISSUED) {
        throw conflict('QUOTATION_ARCHIVE_BLOCKED', 'Issued quotations need a terminal outcome.');
      }
      if (existing.archivedAt || existing.status === QuotationStatus.ARCHIVED) {
        return { quotation: await this.reloadQuotation(id, tx), changed: false };
      }
      await tx.commercialQuotation.update({
        where: { id },
        data: {
          status: QuotationStatus.ARCHIVED,
          archivedAt: new Date(),
          updatedByUserId: actorUserId,
        },
      });
      await tx.commercialQuotationEvent.create({
        data: {
          quotationId: id,
          actorUserId,
          action: 'ARCHIVED',
          previousStatus: existing.status,
          nextStatus: QuotationStatus.ARCHIVED,
          safeSummary: 'Quotation archived with history preserved.',
        },
      });
      await this.audit.record(
        'commercial.quotation.archived',
        context,
        {
          actorUserId,
          entityType: 'CommercialQuotation',
          entityId: id,
          metadataSummary: 'Quotation archived with history preserved.',
        },
        tx,
      );
      return { quotation: await this.reloadQuotation(id, tx), changed: true };
    });
    return { quotation: this.toQuotationDetail(quotation, access) };
  }

  async listContracts(
    query: CommercialContractListQuery,
    actorUserId: string,
  ): Promise<CommercialContractListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.contractsView, 'contracts:view', 'CONTRACTS_VIEW_REQUIRED');
    const filters: Prisma.CommercialContractWhereInput = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.recruitmentMissionId ? { recruitmentMissionId: query.recruitmentMissionId } : {}),
      ...(query.sourceQuotationId ? { sourceQuotationId: query.sourceQuotationId } : {}),
      ...(query.businessType ? { businessType: query.businessType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.reference ? { reference: { contains: query.reference, mode: 'insensitive' } } : {}),
    };
    const where: Prisma.CommercialContractWhereInput = {
      AND: [
        this.commercialRecordScopeWhere<Prisma.CommercialContractWhereInput>(
          access,
          actorUserId,
          query.includeArchived,
        ),
        filters,
      ],
    };
    const [total, contracts] = await this.prisma.$transaction([
      this.prisma.commercialContract.count({ where }),
      this.prisma.commercialContract.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: contractInclude,
      }),
    ]);
    return {
      contracts: contracts.map((contract) => this.toContractSummary(contract, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getContract(id: string, actorUserId: string): Promise<CommercialContractDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.contractsView, 'contracts:view', 'CONTRACTS_VIEW_REQUIRED');
    const contract = await this.requireContract(id);
    await this.assertRecordSourceScope(contract, actorUserId, access, this.prisma);
    return { contract: this.toContractDetail(contract, access) };
  }

  async createContract(
    input: CommercialContractCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CommercialContractDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.contractsManage, 'contracts:manage');
    try {
      const contract = await this.prisma.$transaction(async (tx) => {
        await this.lockWritableClient(input.clientId, access, tx);
        await this.assertMissionContext(
          input.clientId,
          input.recruitmentMissionId,
          actorUserId,
          access,
          tx,
        );
        if (
          input.businessType === CommercialContractBusinessType.TRAINING &&
          input.recruitmentMissionId
        ) {
          throw conflict(
            'TRAINING_CONTRACT_RECRUITMENT_CONTEXT_BLOCKED',
            'Training contracts cannot be attached to recruitment-only mission context.',
          );
        }
        if (input.sourceQuotationId) {
          const quotation = await this.lockQuotation(input.sourceQuotationId, tx);
          await this.assertRecordSourceScope(quotation, actorUserId, access, tx);
          this.assertSameClient(
            quotation.clientId,
            input.clientId,
            'CONTRACT_QUOTATION_CLIENT_MISMATCH',
          );
          this.assertSameContext(
            quotation.recruitmentMissionId,
            input.recruitmentMissionId ?? null,
            'CONTRACT_QUOTATION_CONTEXT_MISMATCH',
          );
          this.assertSameCurrency(
            quotation.currency,
            input.currency,
            'CONTRACT_QUOTATION_CURRENCY_MISMATCH',
          );
          if (quotation.status !== QuotationStatus.ACCEPTED) {
            throw conflict(
              'CONTRACT_ACCEPTED_QUOTATION_REQUIRED',
              'Source quotation must be accepted.',
            );
          }
          if (
            input.businessType === CommercialContractBusinessType.TRAINING &&
            quotation.recruitmentMissionId
          ) {
            throw conflict(
              'TRAINING_CONTRACT_RECRUITMENT_CONTEXT_BLOCKED',
              'Training contracts cannot be attached to recruitment-only mission context.',
            );
          }
        }
        const totalCents = calculateTotal(input.contractValueCents, input.taxCents);
        const created = await tx.commercialContract.create({
          data: {
            reference: input.reference,
            businessType: input.businessType,
            clientId: input.clientId,
            recruitmentMissionId: input.recruitmentMissionId,
            sourceQuotationId: input.sourceQuotationId,
            currency: input.currency,
            contractValueCents: input.contractValueCents,
            taxCents: input.taxCents,
            totalCents,
            termsSummary: input.termsSummary,
            effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : undefined,
            startDate: input.startDate ? new Date(input.startDate) : undefined,
            endDate: input.endDate ? new Date(input.endDate) : undefined,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
          },
        });
        await tx.commercialContractEvent.create({
          data: {
            contractId: created.id,
            actorUserId,
            action: 'CREATED',
            nextStatus: CommercialContractStatus.DRAFT,
            safeSummary: 'Commercial contract business record created.',
          },
        });
        await this.audit.record(
          'commercial.contract.created',
          context,
          {
            actorUserId,
            entityType: 'CommercialContract',
            entityId: created.id,
            metadataSummary: 'Commercial contract business record created.',
          },
          tx,
        );
        return tx.commercialContract.findUniqueOrThrow({
          where: { id: created.id },
          include: contractInclude,
        });
      });
      return { contract: this.toContractDetail(contract, access) };
    } catch (error: unknown) {
      this.rethrowKnownCreateError(error, 'COMMERCIAL_CONTRACT_REFERENCE_EXISTS');
    }
  }

  async updateContract(
    id: string,
    input: CommercialContractUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CommercialContractDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.contractsManage, 'contracts:manage');
    try {
      const contract = await this.prisma.$transaction(async (tx) => {
        const existing = await this.lockContract(id, tx);
        await this.assertRecordSourceScope(existing, actorUserId, access, tx);
        if (existing.status !== CommercialContractStatus.DRAFT) {
          throw conflict('CONTRACT_MUTATION_BLOCKED', 'Only draft contracts can change.');
        }
        await tx.commercialContract.update({
          where: { id },
          data: {
            ...(input.reference !== undefined ? { reference: input.reference } : {}),
            ...(input.termsSummary !== undefined ? { termsSummary: input.termsSummary } : {}),
            ...(input.effectiveDate !== undefined
              ? { effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null }
              : {}),
            ...(input.startDate !== undefined
              ? { startDate: input.startDate ? new Date(input.startDate) : null }
              : {}),
            ...(input.endDate !== undefined
              ? { endDate: input.endDate ? new Date(input.endDate) : null }
              : {}),
            updatedByUserId: actorUserId,
          },
        });
        await tx.commercialContractEvent.create({
          data: {
            contractId: id,
            actorUserId,
            action: 'UPDATED',
            safeSummary: 'Editable contract metadata updated.',
          },
        });
        await this.audit.record(
          'commercial.contract.updated',
          context,
          {
            actorUserId,
            entityType: 'CommercialContract',
            entityId: id,
            metadataSummary: 'Editable contract metadata updated.',
          },
          tx,
        );
        return this.reloadContract(id, tx);
      });
      return { contract: this.toContractDetail(contract, access) };
    } catch (error: unknown) {
      this.rethrowKnownCreateError(error, 'COMMERCIAL_CONTRACT_REFERENCE_EXISTS');
    }
  }

  async updateContractStatus(
    id: string,
    input: CommercialContractStatusActionRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CommercialContractDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.contractsManage, 'contracts:manage');
    const { contract } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockContract(id, tx);
      await this.assertRecordSourceScope(existing, actorUserId, access, tx);
      if (existing.status === input.status) {
        return { contract: await this.reloadContract(id, tx), changed: false };
      }
      this.assertTransition(
        contractTransitions,
        existing.status,
        input.status,
        'CONTRACT_INVALID_TRANSITION',
      );
      await tx.commercialContract.update({
        where: { id },
        data: { status: input.status, updatedByUserId: actorUserId },
      });
      await tx.commercialContractEvent.create({
        data: {
          contractId: id,
          actorUserId,
          action: 'STATUS_CHANGED',
          previousStatus: existing.status,
          nextStatus: input.status,
          reason: input.reason,
          safeSummary: `Commercial contract moved to ${input.status}.`,
        },
      });
      await this.audit.record(
        'commercial.contract.status_changed',
        context,
        {
          actorUserId,
          entityType: 'CommercialContract',
          entityId: id,
          metadataSummary: `Commercial contract lifecycle changed to ${input.status}.`,
        },
        tx,
      );
      return { contract: await this.reloadContract(id, tx), changed: true };
    });
    return { contract: this.toContractDetail(contract, access) };
  }

  async archiveContract(
    id: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CommercialContractDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.contractsManage, 'contracts:manage');
    const { contract } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockContract(id, tx, { allowArchived: true });
      await this.assertRecordSourceScope(existing, actorUserId, access, tx);
      if (existing.status === CommercialContractStatus.ACTIVE) {
        throw conflict('CONTRACT_ARCHIVE_BLOCKED', 'Active contracts need a terminal outcome.');
      }
      if (existing.archivedAt || existing.status === CommercialContractStatus.ARCHIVED) {
        return { contract: await this.reloadContract(id, tx), changed: false };
      }
      await tx.commercialContract.update({
        where: { id },
        data: {
          status: CommercialContractStatus.ARCHIVED,
          archivedAt: new Date(),
          updatedByUserId: actorUserId,
        },
      });
      await tx.commercialContractEvent.create({
        data: {
          contractId: id,
          actorUserId,
          action: 'ARCHIVED',
          previousStatus: existing.status,
          nextStatus: CommercialContractStatus.ARCHIVED,
          safeSummary: 'Commercial contract archived with history preserved.',
        },
      });
      await this.audit.record(
        'commercial.contract.archived',
        context,
        {
          actorUserId,
          entityType: 'CommercialContract',
          entityId: id,
          metadataSummary: 'Commercial contract archived with history preserved.',
        },
        tx,
      );
      return { contract: await this.reloadContract(id, tx), changed: true };
    });
    return { contract: this.toContractDetail(contract, access) };
  }

  async listPurchaseOrders(
    query: PurchaseOrderListQuery,
    actorUserId: string,
  ): Promise<PurchaseOrderListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(
      access.purchaseOrdersView,
      'purchase_orders:view',
      'PURCHASE_ORDERS_VIEW_REQUIRED',
    );
    const filters: Prisma.PurchaseOrderWhereInput = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.recruitmentMissionId ? { recruitmentMissionId: query.recruitmentMissionId } : {}),
      ...(query.quotationId ? { quotationId: query.quotationId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.reference ? { reference: { contains: query.reference, mode: 'insensitive' } } : {}),
    };
    const where: Prisma.PurchaseOrderWhereInput = {
      AND: [
        this.commercialRecordScopeWhere<Prisma.PurchaseOrderWhereInput>(
          access,
          actorUserId,
          query.includeArchived,
        ),
        filters,
      ],
    };
    const [total, purchaseOrders] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: purchaseOrderInclude,
      }),
    ]);
    return {
      purchaseOrders: purchaseOrders.map((po) => this.toPurchaseOrderSummary(po, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getPurchaseOrder(id: string, actorUserId: string): Promise<PurchaseOrderDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(
      access.purchaseOrdersView,
      'purchase_orders:view',
      'PURCHASE_ORDERS_VIEW_REQUIRED',
    );
    const purchaseOrder = await this.requirePurchaseOrder(id);
    await this.assertRecordSourceScope(purchaseOrder, actorUserId, access, this.prisma);
    return {
      purchaseOrder: this.toPurchaseOrderDetail(purchaseOrder, access),
    };
  }

  async createPurchaseOrder(
    input: PurchaseOrderCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PurchaseOrderDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.purchaseOrdersManage, 'purchase_orders:manage');
    try {
      const purchaseOrder = await this.prisma.$transaction(async (tx) => {
        await this.lockWritableClient(input.clientId, access, tx);
        await this.assertMissionContext(
          input.clientId,
          input.recruitmentMissionId,
          actorUserId,
          access,
          tx,
        );
        if (input.quotationId) {
          const quotation = await this.lockQuotation(input.quotationId, tx);
          await this.assertRecordSourceScope(quotation, actorUserId, access, tx);
          this.assertSameClient(
            quotation.clientId,
            input.clientId,
            'PURCHASE_ORDER_QUOTATION_CLIENT_MISMATCH',
          );
          this.assertSameContext(
            quotation.recruitmentMissionId,
            input.recruitmentMissionId ?? null,
            'PURCHASE_ORDER_QUOTATION_CONTEXT_MISMATCH',
          );
          this.assertSameCurrency(
            quotation.currency,
            input.currency,
            'PURCHASE_ORDER_QUOTATION_CURRENCY_MISMATCH',
          );
          if (quotation.status !== QuotationStatus.ACCEPTED) {
            throw conflict(
              'PURCHASE_ORDER_ACCEPTED_QUOTATION_REQUIRED',
              'Source quotation must be accepted.',
            );
          }
        }
        if (input.contractId) {
          const contract = await this.lockContract(input.contractId, tx);
          await this.assertRecordSourceScope(contract, actorUserId, access, tx);
          this.assertSameClient(
            contract.clientId,
            input.clientId,
            'PURCHASE_ORDER_CONTRACT_CLIENT_MISMATCH',
          );
          this.assertSameContext(
            contract.recruitmentMissionId,
            input.recruitmentMissionId ?? null,
            'PURCHASE_ORDER_CONTRACT_CONTEXT_MISMATCH',
          );
          this.assertSameCurrency(
            contract.currency,
            input.currency,
            'PURCHASE_ORDER_CONTRACT_CURRENCY_MISMATCH',
          );
          if (contract.status !== CommercialContractStatus.ACTIVE) {
            throw conflict(
              'PURCHASE_ORDER_ACTIVE_CONTRACT_REQUIRED',
              'Commercial contract must be active.',
            );
          }
          if (
            contract.sourceQuotationId &&
            input.quotationId &&
            contract.sourceQuotationId !== input.quotationId
          ) {
            throw conflict(
              'PURCHASE_ORDER_SOURCE_CHAIN_MISMATCH',
              'Purchase-order sources must describe the same commercial chain.',
            );
          }
        }
        const totalCents = calculateTotal(input.amountCents, input.taxCents);
        const created = await tx.purchaseOrder.create({
          data: {
            reference: input.reference,
            clientId: input.clientId,
            recruitmentMissionId: input.recruitmentMissionId,
            quotationId: input.quotationId,
            contractId: input.contractId,
            currency: input.currency,
            amountCents: input.amountCents,
            taxCents: input.taxCents,
            totalCents,
            issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
            receivedDate: input.receivedDate ? new Date(input.receivedDate) : undefined,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
          },
        });
        await tx.purchaseOrderEvent.create({
          data: {
            purchaseOrderId: created.id,
            actorUserId,
            action: 'CREATED',
            nextStatus: PurchaseOrderStatus.DRAFT,
            safeSummary: 'Client purchase order business record created.',
          },
        });
        await this.audit.record(
          'commercial.purchase_order.created',
          context,
          {
            actorUserId,
            entityType: 'PurchaseOrder',
            entityId: created.id,
            metadataSummary: 'Client purchase order business record created.',
          },
          tx,
        );
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id: created.id },
          include: purchaseOrderInclude,
        });
      });
      return { purchaseOrder: this.toPurchaseOrderDetail(purchaseOrder, access) };
    } catch (error: unknown) {
      this.rethrowKnownCreateError(error, 'PURCHASE_ORDER_REFERENCE_EXISTS');
    }
  }

  async updatePurchaseOrder(
    id: string,
    input: PurchaseOrderUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PurchaseOrderDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.purchaseOrdersManage, 'purchase_orders:manage');
    try {
      const purchaseOrder = await this.prisma.$transaction(async (tx) => {
        const existing = await this.lockPurchaseOrder(id, tx);
        await this.assertRecordSourceScope(existing, actorUserId, access, tx);
        if (existing.status !== PurchaseOrderStatus.DRAFT) {
          throw conflict(
            'PURCHASE_ORDER_MUTATION_BLOCKED',
            'Only draft purchase orders can change.',
          );
        }
        await tx.purchaseOrder.update({
          where: { id },
          data: {
            ...(input.reference !== undefined ? { reference: input.reference } : {}),
            ...(input.issueDate !== undefined
              ? { issueDate: input.issueDate ? new Date(input.issueDate) : null }
              : {}),
            ...(input.receivedDate !== undefined
              ? { receivedDate: input.receivedDate ? new Date(input.receivedDate) : null }
              : {}),
            updatedByUserId: actorUserId,
          },
        });
        await tx.purchaseOrderEvent.create({
          data: {
            purchaseOrderId: id,
            actorUserId,
            action: 'UPDATED',
            safeSummary: 'Editable purchase order metadata updated.',
          },
        });
        await this.audit.record(
          'commercial.purchase_order.updated',
          context,
          {
            actorUserId,
            entityType: 'PurchaseOrder',
            entityId: id,
            metadataSummary: 'Editable purchase order metadata updated.',
          },
          tx,
        );
        return this.reloadPurchaseOrder(id, tx);
      });
      return { purchaseOrder: this.toPurchaseOrderDetail(purchaseOrder, access) };
    } catch (error: unknown) {
      this.rethrowKnownCreateError(error, 'PURCHASE_ORDER_REFERENCE_EXISTS');
    }
  }

  async updatePurchaseOrderStatus(
    id: string,
    input: PurchaseOrderStatusActionRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PurchaseOrderDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.purchaseOrdersManage, 'purchase_orders:manage');
    const { purchaseOrder } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockPurchaseOrder(id, tx);
      await this.assertRecordSourceScope(existing, actorUserId, access, tx);
      if (existing.status === input.status) {
        return { purchaseOrder: await this.reloadPurchaseOrder(id, tx), changed: false };
      }
      this.assertTransition(
        purchaseOrderTransitions,
        existing.status,
        input.status,
        'PURCHASE_ORDER_INVALID_TRANSITION',
      );
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: input.status, updatedByUserId: actorUserId },
      });
      await tx.purchaseOrderEvent.create({
        data: {
          purchaseOrderId: id,
          actorUserId,
          action: 'STATUS_CHANGED',
          previousStatus: existing.status,
          nextStatus: input.status,
          reason: input.reason,
          safeSummary: `Purchase order moved to ${input.status}.`,
        },
      });
      await this.audit.record(
        'commercial.purchase_order.status_changed',
        context,
        {
          actorUserId,
          entityType: 'PurchaseOrder',
          entityId: id,
          metadataSummary: `Purchase order lifecycle changed to ${input.status}.`,
        },
        tx,
      );
      return { purchaseOrder: await this.reloadPurchaseOrder(id, tx), changed: true };
    });
    return { purchaseOrder: this.toPurchaseOrderDetail(purchaseOrder, access) };
  }

  async archivePurchaseOrder(
    id: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PurchaseOrderDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.purchaseOrdersManage, 'purchase_orders:manage');
    const { purchaseOrder } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockPurchaseOrder(id, tx, { allowArchived: true });
      await this.assertRecordSourceScope(existing, actorUserId, access, tx);
      if (existing.archivedAt || existing.status === PurchaseOrderStatus.ARCHIVED) {
        return { purchaseOrder: await this.reloadPurchaseOrder(id, tx), changed: false };
      }
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: PurchaseOrderStatus.ARCHIVED,
          archivedAt: new Date(),
          updatedByUserId: actorUserId,
        },
      });
      await tx.purchaseOrderEvent.create({
        data: {
          purchaseOrderId: id,
          actorUserId,
          action: 'ARCHIVED',
          previousStatus: existing.status,
          nextStatus: PurchaseOrderStatus.ARCHIVED,
          safeSummary: 'Purchase order archived with history preserved.',
        },
      });
      await this.audit.record(
        'commercial.purchase_order.archived',
        context,
        {
          actorUserId,
          entityType: 'PurchaseOrder',
          entityId: id,
          metadataSummary: 'Purchase order archived with history preserved.',
        },
        tx,
      );
      return { purchaseOrder: await this.reloadPurchaseOrder(id, tx), changed: true };
    });
    return { purchaseOrder: this.toPurchaseOrderDetail(purchaseOrder, access) };
  }

  async listInvoices(query: InvoiceListQuery, actorUserId: string): Promise<InvoiceListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.invoicesView, 'invoices:view', 'INVOICES_VIEW_REQUIRED');
    const filters: Prisma.InvoiceWhereInput = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.recruitmentMissionId ? { recruitmentMissionId: query.recruitmentMissionId } : {}),
      ...(query.missionPlacementId ? { missionPlacementId: query.missionPlacementId } : {}),
      ...(query.quotationId ? { quotationId: query.quotationId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.reference ? { reference: { contains: query.reference, mode: 'insensitive' } } : {}),
      ...(query.issuedFrom || query.issuedTo
        ? {
            issueDate: {
              ...(query.issuedFrom ? { gte: new Date(query.issuedFrom) } : {}),
              ...(query.issuedTo ? { lte: new Date(query.issuedTo) } : {}),
            },
          }
        : {}),
    };
    const where: Prisma.InvoiceWhereInput = {
      AND: [
        this.commercialRecordScopeWhere<Prisma.InvoiceWhereInput>(
          access,
          actorUserId,
          query.includeArchived,
        ),
        filters,
      ],
    };
    const [total, invoices] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: invoiceInclude,
      }),
    ]);
    return {
      invoices: invoices.map((invoice) => this.toInvoiceSummary(invoice, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getInvoice(id: string, actorUserId: string): Promise<InvoiceDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.invoicesView, 'invoices:view', 'INVOICES_VIEW_REQUIRED');
    const invoice = await this.requireInvoice(id);
    await this.assertRecordSourceScope(invoice, actorUserId, access, this.prisma);
    return { invoice: this.toInvoiceDetail(invoice, access) };
  }

  async createInvoice(
    input: InvoiceCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InvoiceDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.invoicesManage, 'invoices:manage');
    try {
      const invoice = await this.prisma.$transaction(async (tx) => {
        await this.lockWritableClient(input.clientId, access, tx);
        await this.assertMissionContext(
          input.clientId,
          input.recruitmentMissionId,
          actorUserId,
          access,
          tx,
        );
        const sourceLines = await this.validateInvoiceSourcesAndBuildLines(
          input,
          tx,
          access,
          actorUserId,
        );
        const calculated = calculateLines(input.lines ?? sourceLines);
        const created = await tx.invoice.create({
          data: {
            reference: input.reference,
            clientId: input.clientId,
            recruitmentMissionId: input.recruitmentMissionId,
            missionPlacementId: input.missionPlacementId,
            quotationId: input.quotationId,
            contractId: input.contractId,
            purchaseOrderId: input.purchaseOrderId,
            currency: input.currency,
            issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
            subtotalCents: calculated.subtotalCents,
            taxCents: calculated.taxCents,
            totalCents: calculated.totalCents,
            correctionOfInvoiceId: input.correctionOfInvoiceId,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
            lines: { create: calculated.lines },
          },
        });
        await tx.invoiceEvent.create({
          data: {
            invoiceId: created.id,
            actorUserId,
            action: 'CREATED',
            nextStatus: InvoiceStatus.DRAFT,
            safeSummary: 'Invoice draft created with server-calculated snapshot.',
          },
        });
        await this.audit.record(
          'commercial.invoice.created',
          context,
          {
            actorUserId,
            entityType: 'Invoice',
            entityId: created.id,
            metadataSummary: 'Invoice draft created with server-calculated snapshot.',
          },
          tx,
        );
        return tx.invoice.findUniqueOrThrow({ where: { id: created.id }, include: invoiceInclude });
      });
      return { invoice: this.toInvoiceDetail(invoice, access) };
    } catch (error: unknown) {
      this.rethrowKnownCreateError(error, 'INVOICE_REFERENCE_OR_SOURCE_EXISTS');
    }
  }

  async updateInvoice(
    id: string,
    input: InvoiceUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InvoiceDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.invoicesManage, 'invoices:manage');
    try {
      const invoice = await this.prisma.$transaction(async (tx) => {
        const existing = await this.lockInvoice(id, tx);
        await this.assertRecordSourceScope(existing, actorUserId, access, tx);
        if (existing.status !== InvoiceStatus.DRAFT) {
          throw conflict('INVOICE_MUTATION_BLOCKED', 'Only draft invoices can change.');
        }
        const calculated = input.lines ? calculateLines(input.lines) : null;
        if (calculated) {
          await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        }
        await tx.invoice.update({
          where: { id },
          data: {
            ...(input.reference !== undefined ? { reference: input.reference } : {}),
            ...(input.issueDate !== undefined
              ? { issueDate: input.issueDate ? new Date(input.issueDate) : null }
              : {}),
            ...(input.dueDate !== undefined
              ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
              : {}),
            ...(calculated
              ? {
                  subtotalCents: calculated.subtotalCents,
                  taxCents: calculated.taxCents,
                  totalCents: calculated.totalCents,
                  lines: { create: calculated.lines },
                }
              : {}),
            updatedByUserId: actorUserId,
          },
        });
        await tx.invoiceEvent.create({
          data: {
            invoiceId: id,
            actorUserId,
            action: 'UPDATED',
            safeSummary: 'Draft invoice metadata or snapshot lines updated.',
          },
        });
        await this.audit.record(
          'commercial.invoice.updated',
          context,
          {
            actorUserId,
            entityType: 'Invoice',
            entityId: id,
            metadataSummary: 'Draft invoice metadata or snapshot lines updated.',
          },
          tx,
        );
        return this.reloadInvoice(id, tx);
      });
      return { invoice: this.toInvoiceDetail(invoice, access) };
    } catch (error: unknown) {
      this.rethrowKnownCreateError(error, 'INVOICE_REFERENCE_OR_SOURCE_EXISTS');
    }
  }

  async issueInvoice(
    id: string,
    input: InvoiceIssueRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InvoiceDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.invoicesManage, 'invoices:manage');
    const { invoice } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockInvoice(id, tx);
      await this.assertRecordSourceScope(existing, actorUserId, access, tx);
      if (existing.status === InvoiceStatus.ISSUED) {
        return { invoice: await this.reloadInvoice(id, tx), changed: false };
      }
      if (existing.status !== InvoiceStatus.DRAFT) {
        throw conflict('INVOICE_INVALID_TRANSITION', 'Only draft invoices can be issued.');
      }
      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.ISSUED,
          issuedAt: new Date(),
          issueDate: input.issueDate
            ? new Date(input.issueDate)
            : (existing.issueDate ?? new Date()),
          dueDate: input.dueDate ? new Date(input.dueDate) : existing.dueDate,
          updatedByUserId: actorUserId,
        },
      });
      await tx.invoiceEvent.create({
        data: {
          invoiceId: id,
          actorUserId,
          action: 'ISSUED',
          previousStatus: InvoiceStatus.DRAFT,
          nextStatus: InvoiceStatus.ISSUED,
          reason: input.reason,
          safeSummary: 'Invoice issued with immutable line snapshot retained.',
        },
      });
      await this.audit.record(
        'commercial.invoice.issued',
        context,
        {
          actorUserId,
          entityType: 'Invoice',
          entityId: id,
          metadataSummary: 'Invoice issued with immutable line snapshot retained.',
        },
        tx,
      );
      return { invoice: await this.reloadInvoice(id, tx), changed: true };
    });
    return { invoice: this.toInvoiceDetail(invoice, access) };
  }

  async cancelInvoice(
    id: string,
    input: InvoiceCancelRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InvoiceDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.invoicesManage, 'invoices:manage');
    const { invoice } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockInvoice(id, tx);
      await this.assertRecordSourceScope(existing, actorUserId, access, tx);
      if (existing.status === InvoiceStatus.CANCELED) {
        return { invoice: await this.reloadInvoice(id, tx), changed: false };
      }
      if (existing.status !== InvoiceStatus.DRAFT && existing.status !== InvoiceStatus.ISSUED) {
        throw conflict('INVOICE_CANCEL_BLOCKED', 'Invoice cannot be canceled from this state.');
      }
      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.CANCELED,
          canceledAt: new Date(),
          canceledByUserId: actorUserId,
          cancellationReason: input.reason,
          updatedByUserId: actorUserId,
        },
      });
      await tx.invoiceEvent.create({
        data: {
          invoiceId: id,
          actorUserId,
          action: 'CANCELED',
          previousStatus: existing.status,
          nextStatus: InvoiceStatus.CANCELED,
          reason: input.reason,
          safeSummary: 'Invoice cancellation recorded without deleting its snapshot.',
        },
      });
      await this.audit.record(
        'commercial.invoice.canceled',
        context,
        {
          actorUserId,
          entityType: 'Invoice',
          entityId: id,
          metadataSummary: 'Invoice cancellation recorded without deleting its snapshot.',
        },
        tx,
      );
      return { invoice: await this.reloadInvoice(id, tx), changed: true };
    });
    return { invoice: this.toInvoiceDetail(invoice, access) };
  }

  async archiveInvoice(
    id: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InvoiceDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.invoicesManage, 'invoices:manage');
    const { invoice } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockInvoice(id, tx, { allowArchived: true });
      await this.assertRecordSourceScope(existing, actorUserId, access, tx);
      if (existing.status === InvoiceStatus.ISSUED) {
        throw conflict(
          'INVOICE_ARCHIVE_BLOCKED',
          'Issued invoices must be canceled before archive.',
        );
      }
      if (existing.archivedAt || existing.status === InvoiceStatus.ARCHIVED) {
        return { invoice: await this.reloadInvoice(id, tx), changed: false };
      }
      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.ARCHIVED,
          archivedAt: new Date(),
          updatedByUserId: actorUserId,
        },
      });
      await tx.invoiceEvent.create({
        data: {
          invoiceId: id,
          actorUserId,
          action: 'ARCHIVED',
          previousStatus: existing.status,
          nextStatus: InvoiceStatus.ARCHIVED,
          safeSummary: 'Invoice archived with history preserved.',
        },
      });
      await this.audit.record(
        'commercial.invoice.archived',
        context,
        {
          actorUserId,
          entityType: 'Invoice',
          entityId: id,
          metadataSummary: 'Invoice archived with history preserved.',
        },
        tx,
      );
      return { invoice: await this.reloadInvoice(id, tx), changed: true };
    });
    return { invoice: this.toInvoiceDetail(invoice, access) };
  }

  private async validateInvoiceSourcesAndBuildLines(
    input: InvoiceCreateRequest,
    tx: Tx,
    access: CommercialAccess,
    actorUserId: string,
  ): Promise<CommercialLineInput[]> {
    const sourceLines: CommercialLineInput[] = [];
    if (input.quotationId) {
      const quotation = await this.lockQuotation(input.quotationId, tx);
      await this.assertRecordSourceScope(quotation, actorUserId, access, tx);
      this.assertSameClient(
        quotation.clientId,
        input.clientId,
        'INVOICE_QUOTATION_CLIENT_MISMATCH',
      );
      this.assertSameContext(
        quotation.recruitmentMissionId,
        input.recruitmentMissionId ?? null,
        'INVOICE_QUOTATION_CONTEXT_MISMATCH',
      );
      this.assertSameCurrency(
        quotation.currency,
        input.currency,
        'INVOICE_QUOTATION_CURRENCY_MISMATCH',
      );
      if (quotation.status !== QuotationStatus.ACCEPTED) {
        throw conflict('INVOICE_ACCEPTED_QUOTATION_REQUIRED', 'Quotation must be accepted.');
      }
      sourceLines.push(
        ...quotation.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          taxRateBps: line.taxRateBps,
        })),
      );
    }
    if (input.contractId) {
      const contract = await this.lockContract(input.contractId, tx);
      await this.assertRecordSourceScope(contract, actorUserId, access, tx);
      this.assertSameClient(contract.clientId, input.clientId, 'INVOICE_CONTRACT_CLIENT_MISMATCH');
      this.assertSameContext(
        contract.recruitmentMissionId,
        input.recruitmentMissionId ?? null,
        'INVOICE_CONTRACT_CONTEXT_MISMATCH',
      );
      this.assertSameCurrency(
        contract.currency,
        input.currency,
        'INVOICE_CONTRACT_CURRENCY_MISMATCH',
      );
      if (contract.status !== CommercialContractStatus.ACTIVE) {
        throw conflict('INVOICE_ACTIVE_CONTRACT_REQUIRED', 'Contract must be active.');
      }
      if (
        contract.sourceQuotationId &&
        input.quotationId &&
        contract.sourceQuotationId !== input.quotationId
      ) {
        throw conflict(
          'INVOICE_SOURCE_CHAIN_MISMATCH',
          'Invoice sources must describe the same commercial chain.',
        );
      }
      if (sourceLines.length === 0) {
        sourceLines.push({
          description: `Contract ${contract.reference}`,
          quantity: 1,
          unitPriceCents: contract.contractValueCents,
          taxRateBps: taxBpsFromAmounts(contract.contractValueCents, contract.taxCents),
        });
      }
    }
    if (input.purchaseOrderId) {
      const po = await this.lockPurchaseOrder(input.purchaseOrderId, tx);
      await this.assertRecordSourceScope(po, actorUserId, access, tx);
      this.assertSameClient(po.clientId, input.clientId, 'INVOICE_PURCHASE_ORDER_CLIENT_MISMATCH');
      this.assertSameContext(
        po.recruitmentMissionId,
        input.recruitmentMissionId ?? null,
        'INVOICE_PURCHASE_ORDER_CONTEXT_MISMATCH',
      );
      this.assertSameCurrency(
        po.currency,
        input.currency,
        'INVOICE_PURCHASE_ORDER_CURRENCY_MISMATCH',
      );
      if (po.status !== PurchaseOrderStatus.RECEIVED) {
        throw conflict('INVOICE_RECEIVED_PO_REQUIRED', 'Purchase order must be received.');
      }
      if (po.quotationId && input.quotationId && po.quotationId !== input.quotationId) {
        throw conflict(
          'INVOICE_SOURCE_CHAIN_MISMATCH',
          'Invoice sources must describe the same commercial chain.',
        );
      }
      if (po.contractId && input.contractId && po.contractId !== input.contractId) {
        throw conflict(
          'INVOICE_SOURCE_CHAIN_MISMATCH',
          'Invoice sources must describe the same commercial chain.',
        );
      }
      if (sourceLines.length === 0) {
        sourceLines.push({
          description: `Purchase order ${po.reference}`,
          quantity: 1,
          unitPriceCents: po.amountCents,
          taxRateBps: taxBpsFromAmounts(po.amountCents, po.taxCents),
        });
      }
    }
    if (input.correctionOfInvoiceId) {
      if (input.missionPlacementId) {
        throw conflict(
          'INVOICE_CORRECTION_PLACEMENT_DIRECT_LINK_BLOCKED',
          'Correction invoices cannot directly consume a placement invoice source.',
        );
      }
      const correctionSource = await this.lockInvoice(input.correctionOfInvoiceId, tx);
      await this.assertRecordSourceScope(correctionSource, actorUserId, access, tx);
      this.assertSameClient(
        correctionSource.clientId,
        input.clientId,
        'INVOICE_CORRECTION_CLIENT_MISMATCH',
      );
      this.assertSameContext(
        correctionSource.recruitmentMissionId,
        input.recruitmentMissionId ?? null,
        'INVOICE_CORRECTION_CONTEXT_MISMATCH',
      );
      this.assertSameCurrency(
        correctionSource.currency,
        input.currency,
        'INVOICE_CORRECTION_CURRENCY_MISMATCH',
      );
      if (correctionSource.status !== InvoiceStatus.ISSUED) {
        throw conflict(
          'INVOICE_CORRECTION_ISSUED_SOURCE_REQUIRED',
          'Correction source invoice must be issued.',
        );
      }
      await this.assertAcyclicCorrection(input.correctionOfInvoiceId, tx);
    }
    if (input.missionPlacementId) {
      this.assertPermission(
        access.placementCommercialEligibility,
        'placement_commercial_eligibility:view',
        'PLACEMENT_COMMERCIAL_ELIGIBILITY_REQUIRED',
      );
      this.assertPermission(access.placementsView, 'placements:view', 'PLACEMENTS_VIEW_REQUIRED');
      await tx.$queryRaw`SELECT id FROM "MissionPlacement" WHERE id = ${input.missionPlacementId}::uuid FOR UPDATE`;
      const placement = await tx.missionPlacement.findUnique({
        where: { id: input.missionPlacementId },
      });
      if (!placement) {
        throw notFound('MISSION_PLACEMENT_NOT_FOUND', 'Mission placement was not found.');
      }
      if (
        placement.status !== PlacementStatus.CONFIRMED ||
        !placement.eligibleForInvoicing ||
        placement.archivedAt
      ) {
        throw conflict(
          'PLACEMENT_INVOICE_ELIGIBILITY_REQUIRED',
          'Placement must be confirmed and commercially eligible before invoicing.',
        );
      }
      this.assertSameContext(
        placement.missionId,
        input.recruitmentMissionId ?? null,
        'INVOICE_PLACEMENT_MISSION_MISMATCH',
      );
      const mission = await tx.recruitmentMission.findUniqueOrThrow({
        where: { id: placement.missionId },
      });
      this.assertSameClient(mission.clientId, input.clientId, 'INVOICE_PLACEMENT_CLIENT_MISMATCH');
      await this.assertMissionContext(input.clientId, placement.missionId, actorUserId, access, tx);
    }
    if (!input.lines && sourceLines.length === 0) {
      throw conflict(
        'INVOICE_SOURCE_OR_LINES_REQUIRED',
        'Invoice requires source lines or input lines.',
      );
    }
    return sourceLines;
  }

  private async lockWritableClient(
    clientId: string,
    access: CommercialAccess,
    tx: Tx,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId}::uuid FOR UPDATE`;
    const client = await tx.client.findUnique({ where: { id: clientId } });
    if (!client || !access.clientsView) {
      throw notFound('COMMERCIAL_SOURCE_NOT_FOUND', 'Commercial source was not found.');
    }
    if (client.archivedAt || client.status === 'ARCHIVED') {
      throw conflict('CLIENT_ARCHIVED', 'Archived clients cannot receive commercial records.');
    }
  }

  private async assertMissionContext(
    clientId: string,
    missionId: string | undefined,
    actorUserId: string,
    access: CommercialAccess,
    tx: Tx,
  ): Promise<void> {
    if (!missionId) {
      return;
    }
    await tx.$queryRaw`SELECT id FROM "RecruitmentMission" WHERE id = ${missionId}::uuid FOR UPDATE`;
    const mission = await tx.recruitmentMission.findUnique({ where: { id: missionId } });
    if (!mission || !access.missionsView) {
      throw notFound('COMMERCIAL_SOURCE_NOT_FOUND', 'Commercial source was not found.');
    }
    this.assertSameClient(mission.clientId, clientId, 'COMMERCIAL_MISSION_CLIENT_MISMATCH');
    if (!access.missionCandidatesTransfer) {
      const assignment = await tx.missionRecruiter.findFirst({
        where: {
          missionId,
          userId: actorUserId,
          status: AssignmentStatus.ACTIVE,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!assignment) {
        throw notFound('COMMERCIAL_SOURCE_NOT_FOUND', 'Commercial source was not found.');
      }
    }
    if (terminalMissionStates.has(mission.state) || mission.archivedAt) {
      throw conflict(
        'MISSION_TERMINAL',
        'Terminal missions cannot receive new commercial records.',
      );
    }
  }

  private commercialRecordScopeWhere<T>(
    access: CommercialAccess,
    actorUserId: string,
    includeArchived = false,
  ): T {
    if (!access.clientsView) {
      return { id: IMPOSSIBLE_UUID } as T;
    }
    return {
      ...(includeArchived ? {} : { archivedAt: null }),
      client: { archivedAt: null, status: { not: ClientStatus.ARCHIVED } },
      ...this.missionRecordScopeWhere(access, actorUserId),
    } as T;
  }

  private missionRecordScopeWhere(
    access: CommercialAccess,
    actorUserId: string,
  ):
    | Prisma.CommercialQuotationWhereInput
    | Prisma.CommercialContractWhereInput
    | Prisma.PurchaseOrderWhereInput
    | Prisma.InvoiceWhereInput {
    if (!access.missionsView) {
      return { recruitmentMissionId: null };
    }
    if (access.missionCandidatesTransfer) {
      return {};
    }
    return {
      OR: [
        { recruitmentMissionId: null },
        {
          recruitmentMission: {
            recruiters: {
              some: {
                userId: actorUserId,
                status: AssignmentStatus.ACTIVE,
                archivedAt: null,
              },
            },
          },
        },
      ],
    };
  }

  private async assertRecordSourceScope(
    record: { clientId: string; recruitmentMissionId: string | null; archivedAt?: Date | null },
    actorUserId: string,
    access: CommercialAccess,
    prisma: Tx | PrismaService,
  ): Promise<void> {
    if (!access.clientsView) {
      throw notFound('COMMERCIAL_RECORD_NOT_FOUND', 'Commercial record was not found.');
    }
    const client = await prisma.client.findUnique({ where: { id: record.clientId } });
    if (!client || client.archivedAt || client.status === ClientStatus.ARCHIVED) {
      throw notFound('COMMERCIAL_RECORD_NOT_FOUND', 'Commercial record was not found.');
    }
    if (!record.recruitmentMissionId) {
      return;
    }
    if (!access.missionsView) {
      throw notFound('COMMERCIAL_RECORD_NOT_FOUND', 'Commercial record was not found.');
    }
    const mission = await prisma.recruitmentMission.findUnique({
      where: { id: record.recruitmentMissionId },
      select: { id: true, archivedAt: true, clientId: true },
    });
    if (!mission || mission.archivedAt || mission.clientId !== record.clientId) {
      throw notFound('COMMERCIAL_RECORD_NOT_FOUND', 'Commercial record was not found.');
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
      throw notFound('COMMERCIAL_RECORD_NOT_FOUND', 'Commercial record was not found.');
    }
  }

  private async lockQuotation(id: string, tx: Tx, options: { allowArchived?: boolean } = {}) {
    await tx.$queryRaw`SELECT id FROM "CommercialQuotation" WHERE id = ${id}::uuid FOR UPDATE`;
    const quotation = await tx.commercialQuotation.findUnique({
      where: { id },
      include: quotationInclude,
    });
    if (!quotation || (!options.allowArchived && quotation.archivedAt)) {
      throw notFound('COMMERCIAL_QUOTATION_NOT_FOUND', 'Commercial quotation was not found.');
    }
    return quotation;
  }

  private async lockContract(id: string, tx: Tx, options: { allowArchived?: boolean } = {}) {
    await tx.$queryRaw`SELECT id FROM "CommercialContract" WHERE id = ${id}::uuid FOR UPDATE`;
    const contract = await tx.commercialContract.findUnique({
      where: { id },
      include: contractInclude,
    });
    if (!contract || (!options.allowArchived && contract.archivedAt)) {
      throw notFound('COMMERCIAL_CONTRACT_NOT_FOUND', 'Commercial contract was not found.');
    }
    return contract;
  }

  private async lockPurchaseOrder(id: string, tx: Tx, options: { allowArchived?: boolean } = {}) {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id}::uuid FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
    if (!po || (!options.allowArchived && po.archivedAt)) {
      throw notFound('PURCHASE_ORDER_NOT_FOUND', 'Purchase order was not found.');
    }
    return po;
  }

  private async lockInvoice(id: string, tx: Tx, options: { allowArchived?: boolean } = {}) {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!invoice || (!options.allowArchived && invoice.archivedAt)) {
      throw notFound('INVOICE_NOT_FOUND', 'Invoice was not found.');
    }
    return invoice;
  }

  private async requireQuotation(id: string): Promise<QuotationRecord> {
    const quotation = await this.prisma.commercialQuotation.findUnique({
      where: { id },
      include: quotationInclude,
    });
    if (!quotation) {
      throw notFound('COMMERCIAL_QUOTATION_NOT_FOUND', 'Commercial quotation was not found.');
    }
    return quotation;
  }

  private async requireContract(id: string): Promise<ContractRecord> {
    const contract = await this.prisma.commercialContract.findUnique({
      where: { id },
      include: contractInclude,
    });
    if (!contract) {
      throw notFound('COMMERCIAL_CONTRACT_NOT_FOUND', 'Commercial contract was not found.');
    }
    return contract;
  }

  private async requirePurchaseOrder(id: string): Promise<PurchaseOrderRecord> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseOrderInclude,
    });
    if (!po) {
      throw notFound('PURCHASE_ORDER_NOT_FOUND', 'Purchase order was not found.');
    }
    return po;
  }

  private async requireInvoice(id: string): Promise<InvoiceRecord> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!invoice) {
      throw notFound('INVOICE_NOT_FOUND', 'Invoice was not found.');
    }
    return invoice;
  }

  private reloadQuotation(id: string, tx: Tx): Promise<QuotationRecord> {
    return tx.commercialQuotation.findUniqueOrThrow({ where: { id }, include: quotationInclude });
  }

  private reloadContract(id: string, tx: Tx): Promise<ContractRecord> {
    return tx.commercialContract.findUniqueOrThrow({ where: { id }, include: contractInclude });
  }

  private reloadPurchaseOrder(id: string, tx: Tx): Promise<PurchaseOrderRecord> {
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseOrderInclude });
  }

  private reloadInvoice(id: string, tx: Tx): Promise<InvoiceRecord> {
    return tx.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
  }

  private async resolveAccess(actorUserId: string): Promise<CommercialAccess> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    return {
      commercialData: permissions.includes(COMMERCIAL_PERMISSIONS.COMMERCIAL_DATA_ACCESS),
      quotationsView: permissions.includes(COMMERCIAL_PERMISSIONS.QUOTATIONS_VIEW),
      quotationsManage: permissions.includes(COMMERCIAL_PERMISSIONS.QUOTATIONS_MANAGE),
      contractsView: permissions.includes(COMMERCIAL_PERMISSIONS.CONTRACTS_VIEW),
      contractsManage: permissions.includes(COMMERCIAL_PERMISSIONS.CONTRACTS_MANAGE),
      purchaseOrdersView: permissions.includes(COMMERCIAL_PERMISSIONS.PURCHASE_ORDERS_VIEW),
      purchaseOrdersManage: permissions.includes(COMMERCIAL_PERMISSIONS.PURCHASE_ORDERS_MANAGE),
      invoicesView: permissions.includes(COMMERCIAL_PERMISSIONS.INVOICES_VIEW),
      invoicesManage: permissions.includes(COMMERCIAL_PERMISSIONS.INVOICES_MANAGE),
      clientsView: permissions.includes(CLIENT_PERMISSIONS.CLIENTS_VIEW),
      missionsView: permissions.includes(MISSION_PERMISSIONS.MISSIONS_VIEW),
      missionCandidatesTransfer: permissions.includes(
        MISSION_PERMISSIONS.MISSION_CANDIDATES_TRANSFER,
      ),
      placementsView: permissions.includes(MISSION_PERMISSIONS.PLACEMENTS_VIEW),
      placementCommercialEligibility: permissions.includes(
        COMMERCIAL_PERMISSIONS.PLACEMENT_COMMERCIAL_ELIGIBILITY_VIEW,
      ),
    };
  }

  private assertCommercialWrite(
    access: CommercialAccess,
    granted: boolean,
    permission: string,
  ): void {
    this.assertPermission(granted, permission, 'COMMERCIAL_MANAGE_REQUIRED');
    this.assertPermission(
      access.commercialData,
      COMMERCIAL_PERMISSIONS.COMMERCIAL_DATA_ACCESS,
      'COMMERCIAL_DATA_ACCESS_REQUIRED',
    );
  }

  private assertPermission(granted: boolean, permission: string, code: string): void {
    if (!granted) {
      throw forbidden(code, `This action requires ${permission}.`);
    }
  }

  private assertSameClient(actual: string, expected: string, code: string): void {
    if (actual !== expected) {
      throw conflict(code, 'Linked commercial records must belong to the same client.');
    }
  }

  private assertSameContext(actual: string | null, expected: string | null, code: string): void {
    if (actual !== expected) {
      throw conflict(code, 'Linked commercial records must use the same business context.');
    }
  }

  private assertSameCurrency(actual: string, expected: string, code: string): void {
    if (actual !== expected) {
      throw conflict(code, 'Linked commercial records must use the same currency.');
    }
  }

  private async assertAcyclicCorrection(invoiceId: string, tx: Tx): Promise<void> {
    const seen = new Set<string>();
    let cursor: string | null = invoiceId;
    while (cursor) {
      if (seen.has(cursor)) {
        throw conflict(
          'INVOICE_CORRECTION_CYCLE_BLOCKED',
          'Invoice correction chain cannot contain a cycle.',
        );
      }
      seen.add(cursor);
      const invoice: { correctionOfInvoiceId: string | null } | null = await tx.invoice.findUnique({
        where: { id: cursor },
        select: { correctionOfInvoiceId: true },
      });
      cursor = invoice?.correctionOfInvoiceId ?? null;
    }
  }

  private assertTransition<T>(map: Map<T, Set<T>>, from: T, to: T, code: string): void {
    if (!map.get(from)?.has(to)) {
      throw conflict(code, 'Commercial lifecycle transition is not allowed.');
    }
  }

  private rethrowKnownCreateError(error: unknown, code: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict(code, 'Commercial reference or source uniqueness constraint was violated.');
    }
    throw error;
  }

  private toQuotationSummary(quotation: QuotationRecord, access: CommercialAccess) {
    return {
      id: quotation.id,
      reference: quotation.reference,
      clientId: quotation.clientId,
      recruitmentMissionId: quotation.recruitmentMissionId,
      status: quotation.status,
      issueDate: isoOrNull(quotation.issueDate),
      validUntil: isoOrNull(quotation.validUntil),
      amounts: access.commercialData ? amountSummary(quotation) : null,
      archivedAt: isoOrNull(quotation.archivedAt),
      createdAt: quotation.createdAt.toISOString(),
      updatedAt: quotation.updatedAt.toISOString(),
    };
  }

  private toQuotationDetail(quotation: QuotationRecord, access: CommercialAccess) {
    return {
      ...this.toQuotationSummary(quotation, access),
      lines: access.commercialData ? quotation.lines.map(toLine) : null,
      history: quotation.events.map((event) => toEvent(event, access)),
    };
  }

  private toContractSummary(contract: ContractRecord, access: CommercialAccess) {
    return {
      id: contract.id,
      reference: contract.reference,
      businessType: contract.businessType,
      clientId: contract.clientId,
      recruitmentMissionId: contract.recruitmentMissionId,
      sourceQuotationId: contract.sourceQuotationId,
      status: contract.status,
      effectiveDate: isoOrNull(contract.effectiveDate),
      startDate: isoOrNull(contract.startDate),
      endDate: isoOrNull(contract.endDate),
      termsSummary: access.commercialData ? contract.termsSummary : null,
      amounts: access.commercialData
        ? {
            currency: contract.currency,
            subtotalCents: contract.contractValueCents,
            taxCents: contract.taxCents,
            totalCents: contract.totalCents,
          }
        : null,
      archivedAt: isoOrNull(contract.archivedAt),
      createdAt: contract.createdAt.toISOString(),
      updatedAt: contract.updatedAt.toISOString(),
    };
  }

  private toContractDetail(contract: ContractRecord, access: CommercialAccess) {
    return {
      ...this.toContractSummary(contract, access),
      history: contract.events.map((event) => toEvent(event, access)),
    };
  }

  private toPurchaseOrderSummary(po: PurchaseOrderRecord, access: CommercialAccess) {
    return {
      id: po.id,
      reference: po.reference,
      clientId: po.clientId,
      recruitmentMissionId: po.recruitmentMissionId,
      quotationId: po.quotationId,
      contractId: po.contractId,
      status: po.status,
      issueDate: isoOrNull(po.issueDate),
      receivedDate: isoOrNull(po.receivedDate),
      amounts: access.commercialData
        ? {
            currency: po.currency,
            subtotalCents: po.amountCents,
            taxCents: po.taxCents,
            totalCents: po.totalCents,
          }
        : null,
      archivedAt: isoOrNull(po.archivedAt),
      createdAt: po.createdAt.toISOString(),
      updatedAt: po.updatedAt.toISOString(),
    };
  }

  private toPurchaseOrderDetail(po: PurchaseOrderRecord, access: CommercialAccess) {
    return {
      ...this.toPurchaseOrderSummary(po, access),
      history: po.events.map((event) => toEvent(event, access)),
    };
  }

  private toInvoiceSummary(invoice: InvoiceRecord, access: CommercialAccess) {
    return {
      id: invoice.id,
      reference: invoice.reference,
      clientId: invoice.clientId,
      recruitmentMissionId: invoice.recruitmentMissionId,
      missionPlacementId: invoice.missionPlacementId,
      quotationId: invoice.quotationId,
      contractId: invoice.contractId,
      purchaseOrderId: invoice.purchaseOrderId,
      status: invoice.status,
      issueDate: isoOrNull(invoice.issueDate),
      dueDate: isoOrNull(invoice.dueDate),
      issuedAt: isoOrNull(invoice.issuedAt),
      canceledAt: isoOrNull(invoice.canceledAt),
      correctionOfInvoiceId: invoice.correctionOfInvoiceId,
      amounts: access.commercialData ? amountSummary(invoice) : null,
      archivedAt: isoOrNull(invoice.archivedAt),
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    };
  }

  private toInvoiceDetail(invoice: InvoiceRecord, access: CommercialAccess) {
    return {
      ...this.toInvoiceSummary(invoice, access),
      lines: access.commercialData ? invoice.lines.map(toLine) : null,
      history: invoice.events.map((event) => toEvent(event, access)),
    };
  }
}

const quotationInclude = {
  lines: { orderBy: { sortOrder: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CommercialQuotationInclude;

const contractInclude = {
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CommercialContractInclude;

const purchaseOrderInclude = {
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PurchaseOrderInclude;

const invoiceInclude = {
  lines: { orderBy: { sortOrder: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.InvoiceInclude;

function calculateLines(lines: CommercialLineInput[]): {
  lines: CalculatedLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
} {
  const calculatedLines = lines.map((line, index) => {
    const lineSubtotalCents = boundedMoney(
      line.quantity * line.unitPriceCents,
      'COMMERCIAL_MONEY_BOUNDS_EXCEEDED',
    );
    const lineTaxCents = boundedMoney(
      Math.round((lineSubtotalCents * line.taxRateBps) / 10_000),
      'COMMERCIAL_MONEY_BOUNDS_EXCEEDED',
    );
    return {
      ...line,
      sortOrder: index,
      lineSubtotalCents,
      lineTaxCents,
      lineTotalCents: calculateTotal(lineSubtotalCents, lineTaxCents),
    };
  });
  const subtotalCents = calculatedLines.reduce(
    (sum, line) => boundedMoney(sum + line.lineSubtotalCents, 'COMMERCIAL_MONEY_BOUNDS_EXCEEDED'),
    0,
  );
  const taxCents = calculatedLines.reduce(
    (sum, line) => boundedMoney(sum + line.lineTaxCents, 'COMMERCIAL_MONEY_BOUNDS_EXCEEDED'),
    0,
  );
  return {
    lines: calculatedLines,
    subtotalCents,
    taxCents,
    totalCents: calculateTotal(subtotalCents, taxCents),
  };
}

function calculateTotal(amountCents: number, taxCents: number): number {
  return boundedMoney(amountCents + taxCents, 'COMMERCIAL_MONEY_BOUNDS_EXCEEDED');
}

function boundedMoney(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > POSTGRES_INT_MAX) {
    throw badRequest(code, 'Commercial monetary amount exceeds the supported integer range.');
  }
  return value;
}

function amountSummary(record: {
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}) {
  return {
    currency: record.currency,
    subtotalCents: record.subtotalCents,
    taxCents: record.taxCents,
    totalCents: record.totalCents,
  };
}

function toLine(line: {
  id: string;
  sortOrder: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRateBps: number;
  lineSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
}) {
  return {
    id: line.id,
    sortOrder: line.sortOrder,
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    taxRateBps: line.taxRateBps,
    lineSubtotalCents: line.lineSubtotalCents,
    lineTaxCents: line.lineTaxCents,
    lineTotalCents: line.lineTotalCents,
  };
}

function toEvent(
  event: {
    id: string;
    actorUserId: string | null;
    action: string;
    previousStatus: string | null;
    nextStatus: string | null;
    reason: string | null;
    safeSummary: string | null;
    createdAt: Date;
  },
  access: CommercialAccess,
) {
  return {
    id: event.id,
    actorUserId: event.actorUserId,
    action: event.action,
    previousStatus: event.previousStatus,
    nextStatus: event.nextStatus,
    reason: access.commercialData ? event.reason : null,
    safeSummary: event.safeSummary,
    createdAt: event.createdAt.toISOString(),
  };
}

function taxBpsFromAmounts(subtotalCents: number, taxCents: number): number {
  return subtotalCents === 0 ? 0 : Math.round((taxCents * 10_000) / subtotalCents);
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
