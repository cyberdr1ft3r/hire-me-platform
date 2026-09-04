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
import { conflict, forbidden, notFound } from './commercial.errors.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
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
  missionCommercial: boolean;
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
    const where: Prisma.CommercialQuotationWhereInput = {
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
    return { quotation: this.toQuotationDetail(await this.requireQuotation(id), access) };
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
        await this.lockWritableClient(input.clientId, tx);
        await this.assertMissionContext(input.clientId, input.recruitmentMissionId, tx);
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
        return tx.commercialQuotation.findUniqueOrThrow({
          where: { id: created.id },
          include: quotationInclude,
        });
      });
      await this.audit.record('commercial.quotation.created', context, {
        actorUserId,
        entityType: 'CommercialQuotation',
        entityId: quotation.id,
        metadataSummary: 'Commercial quotation draft created.',
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
        return tx.commercialQuotation.findUniqueOrThrow({
          where: { id },
          include: quotationInclude,
        });
      });
      await this.audit.record('commercial.quotation.updated', context, {
        actorUserId,
        entityType: 'CommercialQuotation',
        entityId: quotation.id,
        metadataSummary: 'Editable quotation fields updated.',
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
    const { quotation, changed } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockQuotation(id, tx);
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
      return { quotation: await this.reloadQuotation(id, tx), changed: true };
    });
    if (changed) {
      await this.audit.record('commercial.quotation.status_changed', context, {
        actorUserId,
        entityType: 'CommercialQuotation',
        entityId: quotation.id,
        metadataSummary: `Quotation lifecycle changed to ${input.status}.`,
      });
    }
    return { quotation: this.toQuotationDetail(quotation, access) };
  }

  async archiveQuotation(
    id: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<QuotationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.quotationsManage, 'quotations:manage');
    const quotation = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockQuotation(id, tx);
      if (existing.status === QuotationStatus.ISSUED) {
        throw conflict('QUOTATION_ARCHIVE_BLOCKED', 'Issued quotations need a terminal outcome.');
      }
      if (existing.status === QuotationStatus.ARCHIVED) {
        return this.reloadQuotation(id, tx);
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
      return this.reloadQuotation(id, tx);
    });
    await this.audit.record('commercial.quotation.archived', context, {
      actorUserId,
      entityType: 'CommercialQuotation',
      entityId: quotation.id,
      metadataSummary: 'Quotation archived with history preserved.',
    });
    return { quotation: this.toQuotationDetail(quotation, access) };
  }

  async listContracts(
    query: CommercialContractListQuery,
    actorUserId: string,
  ): Promise<CommercialContractListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.contractsView, 'contracts:view', 'CONTRACTS_VIEW_REQUIRED');
    const where: Prisma.CommercialContractWhereInput = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.recruitmentMissionId ? { recruitmentMissionId: query.recruitmentMissionId } : {}),
      ...(query.sourceQuotationId ? { sourceQuotationId: query.sourceQuotationId } : {}),
      ...(query.businessType ? { businessType: query.businessType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.reference ? { reference: { contains: query.reference, mode: 'insensitive' } } : {}),
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
    return { contract: this.toContractDetail(await this.requireContract(id), access) };
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
        await this.lockWritableClient(input.clientId, tx);
        await this.assertMissionContext(input.clientId, input.recruitmentMissionId, tx);
        if (input.sourceQuotationId) {
          const quotation = await this.lockQuotation(input.sourceQuotationId, tx);
          this.assertSameClient(
            quotation.clientId,
            input.clientId,
            'CONTRACT_QUOTATION_CLIENT_MISMATCH',
          );
          if (quotation.status !== QuotationStatus.ACCEPTED) {
            throw conflict(
              'CONTRACT_ACCEPTED_QUOTATION_REQUIRED',
              'Source quotation must be accepted.',
            );
          }
        }
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
            totalCents: input.contractValueCents + input.taxCents,
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
        return tx.commercialContract.findUniqueOrThrow({
          where: { id: created.id },
          include: contractInclude,
        });
      });
      await this.audit.record('commercial.contract.created', context, {
        actorUserId,
        entityType: 'CommercialContract',
        entityId: contract.id,
        metadataSummary: 'Commercial contract business record created.',
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
        return this.reloadContract(id, tx);
      });
      await this.audit.record('commercial.contract.updated', context, {
        actorUserId,
        entityType: 'CommercialContract',
        entityId: contract.id,
        metadataSummary: 'Editable contract metadata updated.',
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
    const { contract, changed } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockContract(id, tx);
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
      return { contract: await this.reloadContract(id, tx), changed: true };
    });
    if (changed) {
      await this.audit.record('commercial.contract.status_changed', context, {
        actorUserId,
        entityType: 'CommercialContract',
        entityId: contract.id,
        metadataSummary: `Commercial contract lifecycle changed to ${input.status}.`,
      });
    }
    return { contract: this.toContractDetail(contract, access) };
  }

  async archiveContract(
    id: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<CommercialContractDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.contractsManage, 'contracts:manage');
    const contract = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockContract(id, tx);
      if (existing.status === CommercialContractStatus.ACTIVE) {
        throw conflict('CONTRACT_ARCHIVE_BLOCKED', 'Active contracts need a terminal outcome.');
      }
      if (existing.status === CommercialContractStatus.ARCHIVED) {
        return this.reloadContract(id, tx);
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
      return this.reloadContract(id, tx);
    });
    await this.audit.record('commercial.contract.archived', context, {
      actorUserId,
      entityType: 'CommercialContract',
      entityId: contract.id,
      metadataSummary: 'Commercial contract archived with history preserved.',
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
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.recruitmentMissionId ? { recruitmentMissionId: query.recruitmentMissionId } : {}),
      ...(query.quotationId ? { quotationId: query.quotationId } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.reference ? { reference: { contains: query.reference, mode: 'insensitive' } } : {}),
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
    return {
      purchaseOrder: this.toPurchaseOrderDetail(await this.requirePurchaseOrder(id), access),
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
        await this.lockWritableClient(input.clientId, tx);
        await this.assertMissionContext(input.clientId, input.recruitmentMissionId, tx);
        if (input.quotationId) {
          const quotation = await this.lockQuotation(input.quotationId, tx);
          this.assertSameClient(
            quotation.clientId,
            input.clientId,
            'PURCHASE_ORDER_QUOTATION_CLIENT_MISMATCH',
          );
        }
        if (input.contractId) {
          const contract = await this.lockContract(input.contractId, tx);
          this.assertSameClient(
            contract.clientId,
            input.clientId,
            'PURCHASE_ORDER_CONTRACT_CLIENT_MISMATCH',
          );
        }
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
            totalCents: input.amountCents + input.taxCents,
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
        return tx.purchaseOrder.findUniqueOrThrow({
          where: { id: created.id },
          include: purchaseOrderInclude,
        });
      });
      await this.audit.record('commercial.purchase_order.created', context, {
        actorUserId,
        entityType: 'PurchaseOrder',
        entityId: purchaseOrder.id,
        metadataSummary: 'Client purchase order business record created.',
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
        return this.reloadPurchaseOrder(id, tx);
      });
      await this.audit.record('commercial.purchase_order.updated', context, {
        actorUserId,
        entityType: 'PurchaseOrder',
        entityId: purchaseOrder.id,
        metadataSummary: 'Editable purchase order metadata updated.',
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
    const { purchaseOrder, changed } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockPurchaseOrder(id, tx);
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
      return { purchaseOrder: await this.reloadPurchaseOrder(id, tx), changed: true };
    });
    if (changed) {
      await this.audit.record('commercial.purchase_order.status_changed', context, {
        actorUserId,
        entityType: 'PurchaseOrder',
        entityId: purchaseOrder.id,
        metadataSummary: `Purchase order lifecycle changed to ${input.status}.`,
      });
    }
    return { purchaseOrder: this.toPurchaseOrderDetail(purchaseOrder, access) };
  }

  async archivePurchaseOrder(
    id: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PurchaseOrderDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.purchaseOrdersManage, 'purchase_orders:manage');
    const purchaseOrder = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockPurchaseOrder(id, tx);
      if (existing.status === PurchaseOrderStatus.ARCHIVED) {
        return this.reloadPurchaseOrder(id, tx);
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
      return this.reloadPurchaseOrder(id, tx);
    });
    await this.audit.record('commercial.purchase_order.archived', context, {
      actorUserId,
      entityType: 'PurchaseOrder',
      entityId: purchaseOrder.id,
      metadataSummary: 'Purchase order archived with history preserved.',
    });
    return { purchaseOrder: this.toPurchaseOrderDetail(purchaseOrder, access) };
  }

  async listInvoices(query: InvoiceListQuery, actorUserId: string): Promise<InvoiceListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.invoicesView, 'invoices:view', 'INVOICES_VIEW_REQUIRED');
    const where: Prisma.InvoiceWhereInput = {
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
    return { invoice: this.toInvoiceDetail(await this.requireInvoice(id), access) };
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
        await this.lockWritableClient(input.clientId, tx);
        await this.assertMissionContext(input.clientId, input.recruitmentMissionId, tx);
        const sourceLines = await this.validateInvoiceSourcesAndBuildLines(input, tx, access);
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
        return tx.invoice.findUniqueOrThrow({ where: { id: created.id }, include: invoiceInclude });
      });
      await this.audit.record('commercial.invoice.created', context, {
        actorUserId,
        entityType: 'Invoice',
        entityId: invoice.id,
        metadataSummary: 'Invoice draft created with server-calculated snapshot.',
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
        return this.reloadInvoice(id, tx);
      });
      await this.audit.record('commercial.invoice.updated', context, {
        actorUserId,
        entityType: 'Invoice',
        entityId: invoice.id,
        metadataSummary: 'Draft invoice metadata or snapshot lines updated.',
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
    const { invoice, changed } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockInvoice(id, tx);
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
      return { invoice: await this.reloadInvoice(id, tx), changed: true };
    });
    if (changed) {
      await this.audit.record('commercial.invoice.issued', context, {
        actorUserId,
        entityType: 'Invoice',
        entityId: invoice.id,
        metadataSummary: 'Invoice issued with immutable line snapshot retained.',
      });
    }
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
    const { invoice, changed } = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockInvoice(id, tx);
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
      return { invoice: await this.reloadInvoice(id, tx), changed: true };
    });
    if (changed) {
      await this.audit.record('commercial.invoice.canceled', context, {
        actorUserId,
        entityType: 'Invoice',
        entityId: invoice.id,
        metadataSummary: 'Invoice cancellation recorded without deleting its snapshot.',
      });
    }
    return { invoice: this.toInvoiceDetail(invoice, access) };
  }

  async archiveInvoice(
    id: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<InvoiceDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertCommercialWrite(access, access.invoicesManage, 'invoices:manage');
    const invoice = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockInvoice(id, tx);
      if (existing.status === InvoiceStatus.ISSUED) {
        throw conflict(
          'INVOICE_ARCHIVE_BLOCKED',
          'Issued invoices must be canceled before archive.',
        );
      }
      if (existing.status === InvoiceStatus.ARCHIVED) {
        return this.reloadInvoice(id, tx);
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
      return this.reloadInvoice(id, tx);
    });
    await this.audit.record('commercial.invoice.archived', context, {
      actorUserId,
      entityType: 'Invoice',
      entityId: invoice.id,
      metadataSummary: 'Invoice archived with history preserved.',
    });
    return { invoice: this.toInvoiceDetail(invoice, access) };
  }

  private async validateInvoiceSourcesAndBuildLines(
    input: InvoiceCreateRequest,
    tx: Tx,
    access: CommercialAccess,
  ): Promise<CommercialLineInput[]> {
    const sourceLines: CommercialLineInput[] = [];
    if (input.quotationId) {
      const quotation = await this.lockQuotation(input.quotationId, tx);
      this.assertSameClient(
        quotation.clientId,
        input.clientId,
        'INVOICE_QUOTATION_CLIENT_MISMATCH',
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
      this.assertSameClient(contract.clientId, input.clientId, 'INVOICE_CONTRACT_CLIENT_MISMATCH');
      if (contract.status !== CommercialContractStatus.ACTIVE) {
        throw conflict('INVOICE_ACTIVE_CONTRACT_REQUIRED', 'Contract must be active.');
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
      this.assertSameClient(po.clientId, input.clientId, 'INVOICE_PURCHASE_ORDER_CLIENT_MISMATCH');
      if (po.status !== PurchaseOrderStatus.RECEIVED) {
        throw conflict('INVOICE_RECEIVED_PO_REQUIRED', 'Purchase order must be received.');
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
    if (input.missionPlacementId) {
      this.assertPermission(
        access.placementCommercialEligibility,
        'placement_commercial_eligibility:view',
        'PLACEMENT_COMMERCIAL_ELIGIBILITY_REQUIRED',
      );
      const placement = await tx.missionPlacement.findUnique({
        where: { id: input.missionPlacementId },
      });
      if (!placement) {
        throw notFound('MISSION_PLACEMENT_NOT_FOUND', 'Mission placement was not found.');
      }
      await tx.$queryRaw`SELECT id FROM "MissionPlacement" WHERE id = ${placement.id}::uuid FOR UPDATE`;
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
      if (input.recruitmentMissionId && placement.missionId !== input.recruitmentMissionId) {
        throw conflict('INVOICE_PLACEMENT_MISSION_MISMATCH', 'Placement mission mismatch.');
      }
      const mission = await tx.recruitmentMission.findUniqueOrThrow({
        where: { id: placement.missionId },
      });
      this.assertSameClient(mission.clientId, input.clientId, 'INVOICE_PLACEMENT_CLIENT_MISMATCH');
    }
    if (!input.lines && sourceLines.length === 0) {
      throw conflict(
        'INVOICE_SOURCE_OR_LINES_REQUIRED',
        'Invoice requires source lines or input lines.',
      );
    }
    return sourceLines;
  }

  private async lockWritableClient(clientId: string, tx: Tx): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId}::uuid FOR UPDATE`;
    const client = await tx.client.findUnique({ where: { id: clientId } });
    if (!client) {
      throw notFound('CLIENT_NOT_FOUND', 'Client was not found.');
    }
    if (client.archivedAt || client.status === 'ARCHIVED') {
      throw conflict('CLIENT_ARCHIVED', 'Archived clients cannot receive commercial records.');
    }
  }

  private async assertMissionContext(
    clientId: string,
    missionId: string | undefined,
    tx: Tx,
  ): Promise<void> {
    if (!missionId) {
      return;
    }
    await tx.$queryRaw`SELECT id FROM "RecruitmentMission" WHERE id = ${missionId}::uuid FOR UPDATE`;
    const mission = await tx.recruitmentMission.findUnique({ where: { id: missionId } });
    if (!mission) {
      throw notFound('MISSION_NOT_FOUND', 'Recruitment mission was not found.');
    }
    this.assertSameClient(mission.clientId, clientId, 'COMMERCIAL_MISSION_CLIENT_MISMATCH');
    if (terminalMissionStates.has(mission.state) || mission.archivedAt) {
      throw conflict(
        'MISSION_TERMINAL',
        'Terminal missions cannot receive new commercial records.',
      );
    }
  }

  private async lockQuotation(id: string, tx: Tx) {
    await tx.$queryRaw`SELECT id FROM "CommercialQuotation" WHERE id = ${id}::uuid FOR UPDATE`;
    const quotation = await tx.commercialQuotation.findUnique({
      where: { id },
      include: quotationInclude,
    });
    if (!quotation || quotation.archivedAt) {
      throw notFound('COMMERCIAL_QUOTATION_NOT_FOUND', 'Commercial quotation was not found.');
    }
    return quotation;
  }

  private async lockContract(id: string, tx: Tx) {
    await tx.$queryRaw`SELECT id FROM "CommercialContract" WHERE id = ${id}::uuid FOR UPDATE`;
    const contract = await tx.commercialContract.findUnique({
      where: { id },
      include: contractInclude,
    });
    if (!contract || contract.archivedAt) {
      throw notFound('COMMERCIAL_CONTRACT_NOT_FOUND', 'Commercial contract was not found.');
    }
    return contract;
  }

  private async lockPurchaseOrder(id: string, tx: Tx) {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id}::uuid FOR UPDATE`;
    const po = await tx.purchaseOrder.findUnique({ where: { id }, include: purchaseOrderInclude });
    if (!po || po.archivedAt) {
      throw notFound('PURCHASE_ORDER_NOT_FOUND', 'Purchase order was not found.');
    }
    return po;
  }

  private async lockInvoice(id: string, tx: Tx) {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!invoice || invoice.archivedAt) {
      throw notFound('INVOICE_NOT_FOUND', 'Invoice was not found.');
    }
    return invoice;
  }

  private async requireQuotation(id: string): Promise<QuotationRecord> {
    const quotation = await this.prisma.commercialQuotation.findUnique({
      where: { id },
      include: quotationInclude,
    });
    if (!quotation || quotation.archivedAt) {
      throw notFound('COMMERCIAL_QUOTATION_NOT_FOUND', 'Commercial quotation was not found.');
    }
    return quotation;
  }

  private async requireContract(id: string): Promise<ContractRecord> {
    const contract = await this.prisma.commercialContract.findUnique({
      where: { id },
      include: contractInclude,
    });
    if (!contract || contract.archivedAt) {
      throw notFound('COMMERCIAL_CONTRACT_NOT_FOUND', 'Commercial contract was not found.');
    }
    return contract;
  }

  private async requirePurchaseOrder(id: string): Promise<PurchaseOrderRecord> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseOrderInclude,
    });
    if (!po || po.archivedAt) {
      throw notFound('PURCHASE_ORDER_NOT_FOUND', 'Purchase order was not found.');
    }
    return po;
  }

  private async requireInvoice(id: string): Promise<InvoiceRecord> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!invoice || invoice.archivedAt) {
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
      missionCommercial:
        permissions.includes(COMMERCIAL_PERMISSIONS.MISSION_COMMERCIAL_DATA_VIEW) ||
        permissions.includes(COMMERCIAL_PERMISSIONS.MISSION_COMMERCIAL_DATA_UPDATE),
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
      history: quotation.events.map(toEvent),
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
    return { ...this.toContractSummary(contract, access), history: contract.events.map(toEvent) };
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
    return { ...this.toPurchaseOrderSummary(po, access), history: po.events.map(toEvent) };
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
      history: invoice.events.map(toEvent),
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
    const lineSubtotalCents = line.quantity * line.unitPriceCents;
    const lineTaxCents = Math.round((lineSubtotalCents * line.taxRateBps) / 10_000);
    return {
      ...line,
      sortOrder: index,
      lineSubtotalCents,
      lineTaxCents,
      lineTotalCents: lineSubtotalCents + lineTaxCents,
    };
  });
  const subtotalCents = calculatedLines.reduce((sum, line) => sum + line.lineSubtotalCents, 0);
  const taxCents = calculatedLines.reduce((sum, line) => sum + line.lineTaxCents, 0);
  return { lines: calculatedLines, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
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

function toEvent(event: {
  id: string;
  actorUserId: string | null;
  action: string;
  previousStatus: string | null;
  nextStatus: string | null;
  reason: string | null;
  safeSummary: string | null;
  createdAt: Date;
}) {
  return {
    id: event.id,
    actorUserId: event.actorUserId,
    action: event.action,
    previousStatus: event.previousStatus,
    nextStatus: event.nextStatus,
    reason: event.reason,
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
