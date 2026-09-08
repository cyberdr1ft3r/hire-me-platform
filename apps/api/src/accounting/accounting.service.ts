import { Inject, Injectable } from '@nestjs/common';
import type {
  ClientReceivableSummaryResponse,
  ExpenseCorrectRequest,
  ExpenseCreateRequest,
  ExpenseDetailResponse,
  ExpenseListQuery,
  ExpenseListResponse,
  ExpenseUpdateRequest,
  InvoiceSettlementResponse,
  InvoiceSettlementState,
  OverdueReceivableListResponse,
  OverdueReceivableQuery,
  PaymentAllocationCreateRequest,
  PaymentAllocationDetailResponse,
  PaymentAllocationReverseRequest,
  PaymentAllocationSummary,
  PaymentCorrectRequest,
  PaymentCreateRequest,
  PaymentDetail,
  PaymentDetailResponse,
  PaymentListQuery,
  PaymentListResponse,
  PaymentSummary,
  PaymentUpdateRequest,
  ProfitabilityQuery,
  ProfitabilitySummaryResponse,
} from '@hire-me/contracts';

import { AccountingAuditService } from './accounting-audit.service.js';
import { ACCOUNTING_PERMISSIONS } from './accounting-permissions.js';
import { accountingNotFound, badRequest, conflict, forbidden } from './accounting.errors.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import { CLIENT_PERMISSIONS } from '../clients/client-permissions.js';
import { COMMERCIAL_PERMISSIONS } from '../commercial/commercial-permissions.js';
import { MISSION_PERMISSIONS } from '../missions/mission-permissions.js';
import {
  AssignmentStatus,
  ExpenseStatus,
  InvoiceStatus,
  PaymentAllocationStatus,
  PaymentRecordStatus,
  Prisma,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { TRAINING_PERMISSIONS } from '../training/training-permissions.js';

type Tx = Prisma.TransactionClient;
type PrismaLike = Tx | PrismaService;

const paymentInclude = {
  allocations: { orderBy: { createdAt: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PaymentInclude;

const expenseInclude = {
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ExpenseInclude;

type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
type ExpenseRecord = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;
type AllocationRecord = Prisma.PaymentAllocationGetPayload<Record<string, never>>;
type InvoiceRow = Prisma.InvoiceGetPayload<Record<string, never>>;

type AccountingAccess = {
  commercialData: boolean;
  paymentsView: boolean;
  paymentsManage: boolean;
  paymentsCorrect: boolean;
  expensesView: boolean;
  expensesManage: boolean;
  clientBalancesView: boolean;
  profitabilityView: boolean;
  invoicesView: boolean;
  clientsView: boolean;
  missionsView: boolean;
  missionCandidatesTransfer: boolean;
  placementsView: boolean;
  trainingProgramsView: boolean;
  trainingProgramsViewAll: boolean;
};

const UNIQUE_VIOLATION = 'P2002';

/** Predicate that can never match a row, used when an actor has no read scope at all. */
const NEVER_MATCHES = { id: { in: [] as string[] } };

/**
 * Issue #39 accounting service.
 *
 * Revenue policy (decision D-053): operational profitability recognises **issued
 * invoice revenue**. Immutable issued invoice totals are the source of truth;
 * canceled and archived invoices are excluded. Received/allocated cash is exposed
 * separately as settlement and receivables data and is never reinterpreted as the
 * profitability basis.
 *
 * Settlement is always derived, never stored: a payment cannot mark an invoice paid
 * merely by existing, only active allocations count.
 *
 * Currencies are never mixed. Every aggregate is returned per currency and no FX
 * conversion is performed anywhere.
 *
 * Deterministic lock order for every financial mutation:
 *   Client -> Payment -> Invoice -> PaymentAllocation
 * Taking payment before invoice in all paths means two concurrent allocations can
 * never form a lock cycle.
 */
@Injectable()
export class AccountingService {
  private readonly audit: AccountingAuditService;
  private readonly permissions: PermissionsService;
  private readonly prisma: PrismaService;

  constructor(
    @Inject(AccountingAuditService) audit: AccountingAuditService,
    @Inject(PermissionsService) permissions: PermissionsService,
    @Inject(PrismaService) prisma: PrismaService,
  ) {
    this.audit = audit;
    this.permissions = permissions;
    this.prisma = prisma;
  }

  // --------------------------------------------------------------------------
  // Payments
  // --------------------------------------------------------------------------

  async listPayments(query: PaymentListQuery, actorUserId: string): Promise<PaymentListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.paymentsView, ACCOUNTING_PERMISSIONS.PAYMENTS_VIEW);
    // Payments hang off a client, so without client read scope there is nothing
    // visible at all rather than a filtered subset.
    if (!access.clientsView) {
      return { payments: [], pagination: { page: query.page, pageSize: query.pageSize, total: 0 } };
    }

    const where: Prisma.PaymentWhereInput = {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.receivedFrom || query.receivedTo
        ? {
            receivedDate: {
              ...(query.receivedFrom ? { gte: new Date(query.receivedFrom) } : {}),
              ...(query.receivedTo ? { lte: new Date(query.receivedTo) } : {}),
            },
          }
        : {}),
    };

    const [payments, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: [{ receivedDate: query.sortDirection }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      payments: payments.map((payment) => this.toPaymentSummary(payment, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getPayment(id: string, actorUserId: string): Promise<PaymentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.paymentsView, ACCOUNTING_PERMISSIONS.PAYMENTS_VIEW);
    const payment = await this.getScopedPayment(id, access);
    return { payment: this.toPaymentDetail(payment, access) };
  }

  async createPayment(
    input: PaymentCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PaymentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertFinancialWrite(
      access,
      access.paymentsManage,
      ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE,
    );

    const payment = await this.prisma
      .$transaction(async (tx) => {
        await this.lockWritableClient(input.clientId, access, tx);
        const created = await tx.payment.create({
          data: {
            reference: input.reference,
            clientId: input.clientId,
            receivedDate: new Date(input.receivedDate),
            currency: input.currency,
            amountCents: input.amountCents,
            method: input.method,
            externalReference: input.externalReference ?? null,
            note: input.note ?? null,
            recordedByUserId: actorUserId,
            updatedByUserId: actorUserId,
          },
        });
        await this.writePaymentEvent(
          tx,
          created.id,
          actorUserId,
          'created',
          null,
          'Payment recorded.',
        );
        await this.audit.record(
          'accounting.payment.created',
          context,
          {
            actorUserId,
            entityType: 'Payment',
            entityId: created.id,
            metadataSummary: 'Payment record created.',
          },
          tx,
        );
        return this.reloadPayment(created.id, tx);
      })
      .catch((error: unknown) => {
        throw this.mapUnique(
          error,
          'PAYMENT_REFERENCE_TAKEN',
          'Payment reference is already used.',
        );
      });

    return { payment: this.toPaymentDetail(payment, access) };
  }

  async updatePayment(
    id: string,
    input: PaymentUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PaymentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertFinancialWrite(
      access,
      access.paymentsManage,
      ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE,
    );

    const payment = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockPayment(id, access, tx);
      this.assertPaymentMutable(current);
      await tx.payment.update({
        where: { id },
        data: {
          ...(input.receivedDate !== undefined
            ? { receivedDate: new Date(input.receivedDate) }
            : {}),
          ...(input.method !== undefined ? { method: input.method } : {}),
          ...(input.externalReference !== undefined
            ? { externalReference: input.externalReference }
            : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          updatedByUserId: actorUserId,
        },
      });
      await this.writePaymentEvent(
        tx,
        id,
        actorUserId,
        'updated',
        null,
        'Payment details updated.',
      );
      await this.audit.record(
        'accounting.payment.updated',
        context,
        {
          actorUserId,
          entityType: 'Payment',
          entityId: id,
          metadataSummary: 'Payment details updated.',
        },
        tx,
      );
      return this.reloadPayment(id, tx);
    });

    return { payment: this.toPaymentDetail(payment, access) };
  }

  /**
   * Correcting a recorded amount requires its own capability and a reason, and can
   * never drop the amount below what is already allocated: the caller must reverse
   * allocations first.
   */
  async correctPayment(
    id: string,
    input: PaymentCorrectRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PaymentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertFinancialWrite(
      access,
      access.paymentsCorrect,
      ACCOUNTING_PERMISSIONS.PAYMENTS_CORRECT,
    );

    const payment = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockPayment(id, access, tx);
      this.assertPaymentMutable(current);
      const allocated = await this.allocatedForPayment(id, tx);
      if (input.amountCents < allocated) {
        throw conflict(
          'PAYMENT_CORRECTION_BELOW_ALLOCATED',
          'Corrected payment amount cannot be lower than the amount already allocated.',
        );
      }
      await tx.payment.update({
        where: { id },
        data: {
          amountCents: input.amountCents,
          status: PaymentRecordStatus.CORRECTED,
          correctedAt: new Date(),
          correctionReason: input.correctionReason,
          updatedByUserId: actorUserId,
        },
      });
      await this.writePaymentEvent(
        tx,
        id,
        actorUserId,
        'corrected',
        input.correctionReason,
        'Payment amount corrected.',
      );
      await this.audit.record(
        'accounting.payment.corrected',
        context,
        {
          actorUserId,
          entityType: 'Payment',
          entityId: id,
          metadataSummary: 'Payment amount corrected with a recorded reason.',
        },
        tx,
      );
      return this.reloadPayment(id, tx);
    });

    return { payment: this.toPaymentDetail(payment, access) };
  }

  async archivePayment(
    id: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PaymentDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertFinancialWrite(
      access,
      access.paymentsManage,
      ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE,
    );

    const payment = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockPayment(id, access, tx);
      if (current.archivedAt) {
        return this.reloadPayment(id, tx);
      }
      const allocated = await this.allocatedForPayment(id, tx);
      if (allocated > 0) {
        throw conflict(
          'PAYMENT_HAS_ACTIVE_ALLOCATIONS',
          'Reverse the active allocations before archiving this payment.',
        );
      }
      await tx.payment.update({
        where: { id },
        data: {
          status: PaymentRecordStatus.ARCHIVED,
          archivedAt: new Date(),
          updatedByUserId: actorUserId,
        },
      });
      await this.writePaymentEvent(tx, id, actorUserId, 'archived', null, 'Payment archived.');
      await this.audit.record(
        'accounting.payment.archived',
        context,
        {
          actorUserId,
          entityType: 'Payment',
          entityId: id,
          metadataSummary: 'Payment archived without deleting history.',
        },
        tx,
      );
      return this.reloadPayment(id, tx);
    });

    return { payment: this.toPaymentDetail(payment, access) };
  }

  // --------------------------------------------------------------------------
  // Allocation
  // --------------------------------------------------------------------------

  /**
   * Allocates part of a payment to one invoice.
   *
   * Both the payment row and the invoice row are locked, in that fixed order, before
   * any remaining-balance arithmetic, so concurrent allocations serialize and cannot
   * over-allocate either side. A replayed request with the same idempotency key
   * returns the existing allocation instead of allocating twice, and the database
   * additionally allows at most one ACTIVE allocation per payment/invoice pair.
   */
  async allocatePayment(
    paymentId: string,
    input: PaymentAllocationCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PaymentAllocationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertFinancialWrite(
      access,
      access.paymentsManage,
      ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE,
    );
    this.assertPermission(access.invoicesView, COMMERCIAL_PERMISSIONS.INVOICES_VIEW);

    const result = await this.prisma
      .$transaction(async (tx) => {
        const payment = await this.lockPayment(paymentId, access, tx);
        this.assertPaymentMutable(payment);

        if (input.idempotencyKey) {
          const existing = await tx.paymentAllocation.findFirst({
            where: { paymentId, idempotencyKey: input.idempotencyKey },
          });
          if (existing) {
            // A replay is only idempotent when the effective request is the same.
            // Reusing one key for a different invoice or amount is a caller error and
            // must fail deterministically instead of returning an unrelated allocation.
            if (
              existing.invoiceId !== input.invoiceId ||
              existing.amountCents !== input.amountCents
            ) {
              throw conflict(
                'ALLOCATION_IDEMPOTENCY_KEY_CONFLICT',
                'This idempotency key was already used for a different invoice or amount.',
              );
            }
            // Idempotent replay: return the original allocation untouched, with no
            // second history or audit row.
            return { allocation: existing, replayed: true };
          }
        }

        const invoice = await this.lockInvoice(input.invoiceId, tx);
        await this.assertInvoiceScope(invoice, actorUserId, access, tx);
        this.assertInvoiceReceivable(invoice);

        if (invoice.clientId !== payment.clientId) {
          throw badRequest(
            'ALLOCATION_CLIENT_MISMATCH',
            'The invoice belongs to a different client than the payment.',
          );
        }
        if (invoice.currency !== payment.currency) {
          throw badRequest(
            'ALLOCATION_CURRENCY_MISMATCH',
            'Payment and invoice currency must match. No conversion is performed.',
          );
        }

        const paymentAllocated = await this.allocatedForPayment(paymentId, tx);
        const paymentRemaining = payment.amountCents - paymentAllocated;
        if (input.amountCents > paymentRemaining) {
          throw conflict(
            'ALLOCATION_EXCEEDS_PAYMENT_REMAINING',
            'Allocation exceeds the unallocated amount of this payment.',
          );
        }

        const invoiceAllocated = await this.allocatedForInvoice(invoice.id, tx);
        const invoiceRemaining = invoice.totalCents - invoiceAllocated;
        if (input.amountCents > invoiceRemaining) {
          throw conflict(
            'ALLOCATION_EXCEEDS_INVOICE_REMAINING',
            'Allocation exceeds the remaining receivable balance of this invoice.',
          );
        }

        const allocation = await tx.paymentAllocation.create({
          data: {
            paymentId,
            invoiceId: invoice.id,
            amountCents: input.amountCents,
            status: PaymentAllocationStatus.ACTIVE,
            activeAllocationKey: invoice.id,
            idempotencyKey: input.idempotencyKey ?? null,
            allocatedByUserId: actorUserId,
          },
        });

        await this.writePaymentEvent(
          tx,
          paymentId,
          actorUserId,
          'allocated',
          null,
          'Payment allocated to an invoice.',
        );
        await this.audit.record(
          'accounting.payment.allocated',
          context,
          {
            actorUserId,
            entityType: 'PaymentAllocation',
            entityId: allocation.id,
            metadataSummary: 'Payment allocated to an invoice.',
          },
          tx,
        );

        return { allocation, replayed: false };
      })
      .catch((error: unknown) => {
        throw this.mapUnique(
          error,
          'ALLOCATION_ALREADY_EXISTS',
          'This payment already has an active allocation for that invoice.',
        );
      });

    const payment = await this.reloadPayment(paymentId, this.prisma);
    return {
      allocation: this.toAllocationSummary(result.allocation, access),
      payment: this.toPaymentDetail(payment, access),
    };
  }

  /** Reversal preserves the allocation row and releases its active slot. */
  async reverseAllocation(
    paymentId: string,
    allocationId: string,
    input: PaymentAllocationReverseRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PaymentAllocationDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertFinancialWrite(
      access,
      access.paymentsManage,
      ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE,
    );

    const allocation = await this.prisma.$transaction(async (tx) => {
      const payment = await this.lockPayment(paymentId, access, tx);
      const existing = await tx.paymentAllocation.findFirst({
        where: { id: allocationId, paymentId: payment.id },
      });
      if (!existing) {
        throw accountingNotFound();
      }
      await this.lockInvoice(existing.invoiceId, tx);
      await tx.$queryRaw`SELECT id FROM "PaymentAllocation" WHERE id = ${allocationId}::uuid FOR UPDATE`;
      const locked = await tx.paymentAllocation.findUniqueOrThrow({ where: { id: allocationId } });
      if (locked.status === PaymentAllocationStatus.REVERSED) {
        return locked;
      }

      const reversed = await tx.paymentAllocation.update({
        where: { id: allocationId },
        data: {
          status: PaymentAllocationStatus.REVERSED,
          activeAllocationKey: null,
          reversedAt: new Date(),
          reversedByUserId: actorUserId,
          reversalReason: input.reversalReason,
        },
      });
      await this.writePaymentEvent(
        tx,
        paymentId,
        actorUserId,
        'allocation_reversed',
        input.reversalReason,
        'Payment allocation reversed.',
      );
      await this.audit.record(
        'accounting.payment.allocation_reversed',
        context,
        {
          actorUserId,
          entityType: 'PaymentAllocation',
          entityId: allocationId,
          metadataSummary: 'Payment allocation reversed with a recorded reason.',
        },
        tx,
      );
      return reversed;
    });

    const payment = await this.reloadPayment(paymentId, this.prisma);
    return {
      allocation: this.toAllocationSummary(allocation, access),
      payment: this.toPaymentDetail(payment, access),
    };
  }

  // --------------------------------------------------------------------------
  // Invoice settlement
  // --------------------------------------------------------------------------

  async getInvoiceSettlement(
    invoiceId: string,
    actorUserId: string,
  ): Promise<InvoiceSettlementResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.invoicesView, COMMERCIAL_PERMISSIONS.INVOICES_VIEW);
    this.assertPermission(access.paymentsView, ACCOUNTING_PERMISSIONS.PAYMENTS_VIEW);

    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw accountingNotFound();
    }
    await this.assertInvoiceScope(invoice, actorUserId, access, this.prisma);

    const allocations = await this.prisma.paymentAllocation.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'asc' },
    });
    const allocated = allocations
      .filter((a) => a.status === PaymentAllocationStatus.ACTIVE)
      .reduce((sum, a) => sum + a.amountCents, 0);
    const derived = deriveSettlement(invoice, allocated, new Date());

    return {
      settlement: {
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        status: invoice.status,
        settlementState: derived.state,
        overdue: derived.overdue,
        dueDate: isoOrNull(invoice.dueDate),
        amounts: access.commercialData
          ? {
              currency: invoice.currency,
              totalCents: invoice.totalCents,
              allocatedCents: allocated,
              outstandingCents: derived.outstanding,
            }
          : null,
        allocations: allocations.map((a) => this.toAllocationSummary(a, access)),
      },
    };
  }

  // --------------------------------------------------------------------------
  // Expenses
  // --------------------------------------------------------------------------

  async listExpenses(query: ExpenseListQuery, actorUserId: string): Promise<ExpenseListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.expensesView, ACCOUNTING_PERMISSIONS.EXPENSES_VIEW);

    const where: Prisma.ExpenseWhereInput = {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.recruitmentMissionId ? { recruitmentMissionId: query.recruitmentMissionId } : {}),
      ...(query.trainingProgramId ? { trainingProgramId: query.trainingProgramId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.expenseFrom || query.expenseTo
        ? {
            expenseDate: {
              ...(query.expenseFrom ? { gte: new Date(query.expenseFrom) } : {}),
              ...(query.expenseTo ? { lte: new Date(query.expenseTo) } : {}),
            },
          }
        : {}),
      // Row-level source scope, identical to the rule the detail path enforces.
      ...this.visibleExpenseScope(actorUserId, access),
    };

    const [expenses, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ expenseDate: query.sortDirection }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      expenses: expenses.map((expense) => this.toExpenseSummary(expense, access)),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getExpense(id: string, actorUserId: string): Promise<ExpenseDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.expensesView, ACCOUNTING_PERMISSIONS.EXPENSES_VIEW);
    const expense = await this.getScopedExpense(id, actorUserId, access);
    return { expense: this.toExpenseDetail(expense, access) };
  }

  async createExpense(
    input: ExpenseCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ExpenseDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertFinancialWrite(
      access,
      access.expensesManage,
      ACCOUNTING_PERMISSIONS.EXPENSES_MANAGE,
    );

    const expense = await this.prisma
      .$transaction(async (tx) => {
        await this.validateExpenseContext(input, actorUserId, access, tx);
        const created = await tx.expense.create({
          data: {
            reference: input.reference,
            expenseDate: new Date(input.expenseDate),
            category: input.category,
            currency: input.currency,
            amountCents: input.amountCents,
            clientId: input.clientId ?? null,
            recruitmentMissionId: input.recruitmentMissionId ?? null,
            missionPlacementId: input.missionPlacementId ?? null,
            trainingProgramId: input.trainingProgramId ?? null,
            vendorLabel: input.vendorLabel ?? null,
            description: input.description ?? null,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
          },
        });
        await this.writeExpenseEvent(
          tx,
          created.id,
          actorUserId,
          'created',
          null,
          'Expense recorded.',
        );
        await this.audit.record(
          'accounting.expense.created',
          context,
          {
            actorUserId,
            entityType: 'Expense',
            entityId: created.id,
            metadataSummary: 'Expense record created.',
          },
          tx,
        );
        return this.reloadExpense(created.id, tx);
      })
      .catch((error: unknown) => {
        throw this.mapUnique(
          error,
          'EXPENSE_REFERENCE_TAKEN',
          'Expense reference is already used.',
        );
      });

    return { expense: this.toExpenseDetail(expense, access) };
  }

  async updateExpense(
    id: string,
    input: ExpenseUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ExpenseDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertFinancialWrite(
      access,
      access.expensesManage,
      ACCOUNTING_PERMISSIONS.EXPENSES_MANAGE,
    );

    const expense = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockExpense(id, actorUserId, access, tx);
      this.assertExpenseMutable(current);
      await tx.expense.update({
        where: { id },
        data: {
          ...(input.expenseDate !== undefined ? { expenseDate: new Date(input.expenseDate) } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.vendorLabel !== undefined ? { vendorLabel: input.vendorLabel } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          updatedByUserId: actorUserId,
        },
      });
      await this.writeExpenseEvent(
        tx,
        id,
        actorUserId,
        'updated',
        null,
        'Expense details updated.',
      );
      await this.audit.record(
        'accounting.expense.updated',
        context,
        {
          actorUserId,
          entityType: 'Expense',
          entityId: id,
          metadataSummary: 'Expense details updated.',
        },
        tx,
      );
      return this.reloadExpense(id, tx);
    });

    return { expense: this.toExpenseDetail(expense, access) };
  }

  async correctExpense(
    id: string,
    input: ExpenseCorrectRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ExpenseDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertFinancialWrite(
      access,
      access.expensesManage,
      ACCOUNTING_PERMISSIONS.EXPENSES_MANAGE,
    );

    const expense = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockExpense(id, actorUserId, access, tx);
      this.assertExpenseMutable(current);
      await tx.expense.update({
        where: { id },
        data: {
          amountCents: input.amountCents,
          status: ExpenseStatus.CORRECTED,
          correctedAt: new Date(),
          correctionReason: input.correctionReason,
          updatedByUserId: actorUserId,
        },
      });
      await this.writeExpenseEvent(
        tx,
        id,
        actorUserId,
        'corrected',
        input.correctionReason,
        'Expense amount corrected.',
      );
      await this.audit.record(
        'accounting.expense.corrected',
        context,
        {
          actorUserId,
          entityType: 'Expense',
          entityId: id,
          metadataSummary: 'Expense amount corrected with a recorded reason.',
        },
        tx,
      );
      return this.reloadExpense(id, tx);
    });

    return { expense: this.toExpenseDetail(expense, access) };
  }

  async archiveExpense(
    id: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ExpenseDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertFinancialWrite(
      access,
      access.expensesManage,
      ACCOUNTING_PERMISSIONS.EXPENSES_MANAGE,
    );

    const expense = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockExpense(id, actorUserId, access, tx);
      if (current.archivedAt) {
        return this.reloadExpense(id, tx);
      }
      await tx.expense.update({
        where: { id },
        data: {
          status: ExpenseStatus.ARCHIVED,
          archivedAt: new Date(),
          updatedByUserId: actorUserId,
        },
      });
      await this.writeExpenseEvent(tx, id, actorUserId, 'archived', null, 'Expense archived.');
      await this.audit.record(
        'accounting.expense.archived',
        context,
        {
          actorUserId,
          entityType: 'Expense',
          entityId: id,
          metadataSummary: 'Expense archived without deleting history.',
        },
        tx,
      );
      return this.reloadExpense(id, tx);
    });

    return { expense: this.toExpenseDetail(expense, access) };
  }

  // --------------------------------------------------------------------------
  // Receivables and profitability
  // --------------------------------------------------------------------------

  /**
   * Aggregates are financial disclosure by definition, so they require
   * `commercial_data:access` outright rather than returning a redacted shell.
   */
  async getClientReceivables(
    clientId: string,
    actorUserId: string,
  ): Promise<ClientReceivableSummaryResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.clientBalancesView, ACCOUNTING_PERMISSIONS.CLIENT_BALANCES_VIEW);
    this.assertCommercialData(access);
    await this.assertClientScope(clientId, access, this.prisma);

    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: {
        clientId,
        status: InvoiceStatus.ISSUED,
        archivedAt: null,
        ...this.visibleInvoiceScope(actorUserId, access),
      },
    });
    const totals = new Map<
      string,
      { invoiced: number; allocated: number; overdueOutstanding: number }
    >();

    for (const invoice of invoices) {
      const allocated = await this.allocatedForInvoice(invoice.id, this.prisma);
      const derived = deriveSettlement(invoice, allocated, now);
      const row = totals.get(invoice.currency) ?? {
        invoiced: 0,
        allocated: 0,
        overdueOutstanding: 0,
      };
      row.invoiced += invoice.totalCents;
      row.allocated += allocated;
      if (derived.overdue) {
        row.overdueOutstanding += derived.outstanding;
      }
      totals.set(invoice.currency, row);
    }

    return {
      receivables: {
        clientId,
        asOf: now.toISOString(),
        totalsByCurrency: [...totals.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([currency, row]) => ({
            currency,
            invoicedCents: row.invoiced,
            allocatedCents: row.allocated,
            outstandingCents: row.invoiced - row.allocated,
            overdueOutstandingCents: row.overdueOutstanding,
          })),
      },
    };
  }

  async listOverdueReceivables(
    query: OverdueReceivableQuery,
    actorUserId: string,
  ): Promise<OverdueReceivableListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.clientBalancesView, ACCOUNTING_PERMISSIONS.CLIENT_BALANCES_VIEW);
    this.assertCommercialData(access);
    if (!access.clientsView) {
      throw forbidden('CLIENT_SCOPE_REQUIRED', 'This action requires clients:view.');
    }

    const now = new Date();
    const where: Prisma.InvoiceWhereInput = {
      status: InvoiceStatus.ISSUED,
      archivedAt: null,
      dueDate: { lt: now },
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...this.visibleInvoiceScope(actorUserId, access),
    };

    const candidates = await this.prisma.invoice.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });

    const rows = [];
    for (const invoice of candidates) {
      const allocated = await this.allocatedForInvoice(invoice.id, this.prisma);
      const derived = deriveSettlement(invoice, allocated, now);
      if (!derived.overdue) {
        continue;
      }
      rows.push({
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        reference: invoice.reference,
        dueDate: isoOrNull(invoice.dueDate),
        daysOverdue: invoice.dueDate ? daysBetween(invoice.dueDate, now) : 0,
        amounts: {
          currency: invoice.currency,
          totalCents: invoice.totalCents,
          allocatedCents: allocated,
          outstandingCents: derived.outstanding,
        },
      });
    }

    const start = (query.page - 1) * query.pageSize;
    return {
      asOf: now.toISOString(),
      rows: rows.slice(start, start + query.pageSize),
      pagination: { page: query.page, pageSize: query.pageSize, total: rows.length },
    };
  }

  /**
   * Operational profitability under decision D-053: issued invoice revenue minus
   * directly linked operational expenses, per currency.
   */
  async getProfitability(
    query: ProfitabilityQuery,
    actorUserId: string,
  ): Promise<ProfitabilitySummaryResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.profitabilityView, ACCOUNTING_PERMISSIONS.PROFITABILITY_VIEW);
    this.assertCommercialData(access);

    // Source scope is applied to every context, so a client total can never include
    // mission-linked revenue or expenses the actor is not allowed to see.
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      status: InvoiceStatus.ISSUED,
      archivedAt: null,
      AND: [this.visibleInvoiceScope(actorUserId, access)],
    };
    const expenseWhere: Prisma.ExpenseWhereInput = {
      archivedAt: null,
      AND: [this.visibleExpenseScope(actorUserId, access)],
    };

    if (query.context === 'CLIENT') {
      await this.assertClientScope(query.contextId, access, this.prisma);
      invoiceWhere.clientId = query.contextId;
      expenseWhere.clientId = query.contextId;
    } else if (query.context === 'RECRUITMENT_MISSION') {
      await this.assertMissionScope(query.contextId, actorUserId, access, this.prisma);
      invoiceWhere.recruitmentMissionId = query.contextId;
      expenseWhere.recruitmentMissionId = query.contextId;
    } else {
      await this.assertPlacementScope(query.contextId, actorUserId, access, this.prisma);
      invoiceWhere.missionPlacementId = query.contextId;
      expenseWhere.missionPlacementId = query.contextId;
    }

    const [invoices, expenses] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['currency'],
        where: invoiceWhere,
        _sum: { totalCents: true },
      }),
      this.prisma.expense.groupBy({
        by: ['currency'],
        where: expenseWhere,
        _sum: { amountCents: true },
      }),
    ]);

    const currencies = new Set<string>([
      ...invoices.map((row) => row.currency),
      ...expenses.map((row) => row.currency),
    ]);
    const revenueByCurrency = new Map(
      invoices.map((row) => [row.currency, row._sum.totalCents ?? 0]),
    );
    const expenseByCurrency = new Map(
      expenses.map((row) => [row.currency, row._sum.amountCents ?? 0]),
    );

    return {
      profitability: {
        context: query.context,
        contextId: query.contextId,
        revenuePolicy: 'ISSUED_INVOICE_REVENUE',
        asOf: new Date().toISOString(),
        totalsByCurrency: [...currencies].sort().map((currency) => {
          const revenue = revenueByCurrency.get(currency) ?? 0;
          const expense = expenseByCurrency.get(currency) ?? 0;
          return {
            currency,
            revenueCents: revenue,
            expenseCents: expense,
            marginCents: revenue - expense,
          };
        }),
      },
    };
  }

  // --------------------------------------------------------------------------
  // Access, scope, locking
  // --------------------------------------------------------------------------

  private async resolveAccess(actorUserId: string): Promise<AccountingAccess> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    const has = (code: string) => permissions.includes(code);
    return {
      commercialData: has(COMMERCIAL_PERMISSIONS.COMMERCIAL_DATA_ACCESS),
      paymentsView: has(ACCOUNTING_PERMISSIONS.PAYMENTS_VIEW),
      paymentsManage: has(ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE),
      paymentsCorrect: has(ACCOUNTING_PERMISSIONS.PAYMENTS_CORRECT),
      expensesView: has(ACCOUNTING_PERMISSIONS.EXPENSES_VIEW),
      expensesManage: has(ACCOUNTING_PERMISSIONS.EXPENSES_MANAGE),
      clientBalancesView: has(ACCOUNTING_PERMISSIONS.CLIENT_BALANCES_VIEW),
      profitabilityView: has(ACCOUNTING_PERMISSIONS.PROFITABILITY_VIEW),
      invoicesView: has(COMMERCIAL_PERMISSIONS.INVOICES_VIEW),
      clientsView: has(CLIENT_PERMISSIONS.CLIENTS_VIEW),
      missionsView: has(MISSION_PERMISSIONS.MISSIONS_VIEW),
      missionCandidatesTransfer: has(MISSION_PERMISSIONS.MISSION_CANDIDATES_TRANSFER),
      placementsView: has(MISSION_PERMISSIONS.PLACEMENTS_VIEW),
      trainingProgramsView: has(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW),
      trainingProgramsViewAll: has(TRAINING_PERMISSIONS.TRAINING_PROGRAMS_VIEW_ALL),
    };
  }

  private assertPermission(granted: boolean, permission: string): void {
    if (!granted) {
      throw forbidden('ACCOUNTING_PERMISSION_REQUIRED', `This action requires ${permission}.`);
    }
  }

  private assertCommercialData(access: AccountingAccess): void {
    if (!access.commercialData) {
      throw forbidden(
        'COMMERCIAL_DATA_ACCESS_REQUIRED',
        `This action requires ${COMMERCIAL_PERMISSIONS.COMMERCIAL_DATA_ACCESS}.`,
      );
    }
  }

  /** Financial writes need the capability and commercial-data access together. */
  private assertFinancialWrite(
    access: AccountingAccess,
    granted: boolean,
    permission: string,
  ): void {
    this.assertPermission(granted, permission);
    this.assertCommercialData(access);
  }

  /**
   * Mission assignment fragment matching the merged commercial source-scope rule.
   * Expressed as a Prisma predicate so lists and aggregates apply exactly the rule
   * `assertMissionScope` enforces on the detail paths.
   */
  private assignedMissionFilter(actorUserId: string): Prisma.RecruitmentMissionWhereInput {
    return {
      recruiters: {
        some: { userId: actorUserId, status: AssignmentStatus.ACTIVE, archivedAt: null },
      },
    };
  }

  /**
   * Training program visibility, mirroring the merged `TrainingService` source rule
   * exactly: broad oversight needs `training_programs:view_all`, otherwise the actor
   * must own the program or train one of its sessions, and a client-linked program
   * additionally needs client read capability.
   *
   * Mirrored as a Prisma predicate rather than injected, so accounting does not create
   * a circular module dependency with training. `clients:view` alone must never become
   * an alternate path to a program the training domain hides.
   */
  private visibleTrainingProgramScope(
    actorUserId: string,
    access: AccountingAccess,
  ): Prisma.TrainingProgramWhereInput {
    if (!access.trainingProgramsView && !access.trainingProgramsViewAll) {
      return NEVER_MATCHES;
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

  /**
   * Invoice rows this actor may aggregate over.
   *
   * Mission-linked invoices outside the actor's mission scope must not contribute to
   * any total, otherwise accounting would disclose through sums what the commercial
   * module hides record by record.
   */
  private visibleInvoiceScope(
    actorUserId: string,
    access: AccountingAccess,
  ): Prisma.InvoiceWhereInput {
    if (!access.clientsView) {
      return NEVER_MATCHES;
    }
    if (!access.missionsView) {
      return { recruitmentMissionId: null };
    }
    if (access.missionCandidatesTransfer) {
      return {};
    }
    return {
      OR: [
        { recruitmentMissionId: null },
        { recruitmentMission: this.assignedMissionFilter(actorUserId) },
      ],
    };
  }

  /**
   * Expense rows this actor may read.
   *
   * Every context is scoped, not only the direct client column: a placement-linked or
   * training-linked expense must not become visible merely because `clientId` and
   * `recruitmentMissionId` are null.
   */
  private visibleExpenseScope(
    actorUserId: string,
    access: AccountingAccess,
  ): Prisma.ExpenseWhereInput {
    const clauses: Prisma.ExpenseWhereInput[] = [];

    if (!access.clientsView) {
      clauses.push({ clientId: null });
    }

    // Training context follows the merged training source rule, not client scope.
    clauses.push({
      OR: [
        { trainingProgramId: null },
        { trainingProgram: this.visibleTrainingProgramScope(actorUserId, access) },
      ],
    });

    // Mission scope requires client scope as well, mirroring `assertMissionScope`.
    if (!access.missionsView || !access.clientsView) {
      clauses.push({ recruitmentMissionId: null, missionPlacementId: null });
    } else {
      if (!access.missionCandidatesTransfer) {
        clauses.push({
          OR: [
            { recruitmentMissionId: null },
            { recruitmentMission: this.assignedMissionFilter(actorUserId) },
          ],
        });
        clauses.push({
          OR: [
            { missionPlacementId: null },
            { missionPlacement: { mission: this.assignedMissionFilter(actorUserId) } },
          ],
        });
      }
      // A placement context is only readable with the authoritative placement
      // capability, matching the merged placement API and commercial invoice path.
      if (!access.placementsView) {
        clauses.push({ missionPlacementId: null });
      }
    }

    return clauses.length > 0 ? { AND: clauses } : {};
  }

  private async assertClientScope(
    clientId: string,
    access: AccountingAccess,
    prisma: PrismaLike,
  ): Promise<void> {
    if (!access.clientsView) {
      throw accountingNotFound();
    }
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw accountingNotFound();
    }
  }

  private async assertMissionScope(
    missionId: string,
    actorUserId: string,
    access: AccountingAccess,
    prisma: PrismaLike,
  ): Promise<void> {
    if (!access.missionsView) {
      throw accountingNotFound();
    }
    const mission = await prisma.recruitmentMission.findUnique({
      where: { id: missionId },
      select: { id: true, clientId: true },
    });
    if (!mission) {
      throw accountingNotFound();
    }
    await this.assertClientScope(mission.clientId, access, prisma);
    if (access.missionCandidatesTransfer) {
      return;
    }
    const assignment = await prisma.missionRecruiter.findFirst({
      where: {
        missionId,
        userId: actorUserId,
        status: AssignmentStatus.ACTIVE,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!assignment) {
      throw accountingNotFound();
    }
  }

  /**
   * Placement read scope.
   *
   * The authoritative placement API and the merged commercial invoice path both require
   * `placements:view` before a `MissionPlacement` may be used, so accounting requires it
   * too. Mission assignment scope still applies on top. A missing capability collapses
   * into the same not-found envelope as a hidden or nonexistent placement.
   */
  private async assertPlacementScope(
    placementId: string,
    actorUserId: string,
    access: AccountingAccess,
    prisma: PrismaLike,
  ): Promise<{ missionId: string; clientId: string }> {
    if (!access.placementsView) {
      throw accountingNotFound();
    }
    const placement = await prisma.missionPlacement.findUnique({
      where: { id: placementId },
      select: { missionId: true, mission: { select: { clientId: true } } },
    });
    if (!placement) {
      throw accountingNotFound();
    }
    await this.assertMissionScope(placement.missionId, actorUserId, access, prisma);
    return { missionId: placement.missionId, clientId: placement.mission.clientId };
  }

  /** Training program read scope, evaluated through the merged training source rule. */
  private async assertTrainingProgramScope(
    programId: string,
    actorUserId: string,
    access: AccountingAccess,
    prisma: PrismaLike,
  ): Promise<{ clientId: string | null }> {
    const program = await prisma.trainingProgram.findFirst({
      where: { id: programId, ...this.visibleTrainingProgramScope(actorUserId, access) },
      select: { clientId: true },
    });
    if (!program) {
      throw accountingNotFound();
    }
    return program;
  }

  private async assertInvoiceScope(
    invoice: { clientId: string; recruitmentMissionId: string | null },
    actorUserId: string,
    access: AccountingAccess,
    prisma: PrismaLike,
  ): Promise<void> {
    await this.assertClientScope(invoice.clientId, access, prisma);
    if (invoice.recruitmentMissionId) {
      await this.assertMissionScope(invoice.recruitmentMissionId, actorUserId, access, prisma);
    }
  }

  private assertInvoiceReceivable(invoice: InvoiceRow): void {
    if (invoice.archivedAt || invoice.status !== InvoiceStatus.ISSUED) {
      throw conflict(
        'INVOICE_NOT_RECEIVABLE',
        'Only an issued, non-canceled, non-archived invoice can receive an allocation.',
      );
    }
  }

  private assertPaymentMutable(payment: { archivedAt: Date | null }): void {
    if (payment.archivedAt) {
      throw conflict('PAYMENT_ARCHIVED', 'Archived payments cannot be changed.');
    }
  }

  private assertExpenseMutable(expense: { archivedAt: Date | null }): void {
    if (expense.archivedAt) {
      throw conflict('EXPENSE_ARCHIVED', 'Archived expenses cannot be changed.');
    }
  }

  private async lockWritableClient(
    clientId: string,
    access: AccountingAccess,
    tx: Tx,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId}::uuid FOR UPDATE`;
    await this.assertClientScope(clientId, access, tx);
  }

  private async lockPayment(id: string, access: AccountingAccess, tx: Tx): Promise<PaymentRecord> {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${id}::uuid FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id }, include: paymentInclude });
    if (!payment) {
      throw accountingNotFound();
    }
    await this.assertClientScope(payment.clientId, access, tx);
    return payment;
  }

  private async lockInvoice(id: string, tx: Tx): Promise<InvoiceRow> {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id}::uuid FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw accountingNotFound();
    }
    return invoice;
  }

  private async lockExpense(
    id: string,
    actorUserId: string,
    access: AccountingAccess,
    tx: Tx,
  ): Promise<ExpenseRecord> {
    await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id}::uuid FOR UPDATE`;
    const expense = await tx.expense.findUnique({ where: { id }, include: expenseInclude });
    if (!expense) {
      throw accountingNotFound();
    }
    await this.assertExpenseScope(expense, actorUserId, access, tx);
    return expense;
  }

  /**
   * Read scope for one expense. Every context is checked: a placement resolves through
   * its mission, and a client-linked training program through client scope, so a null
   * `clientId` or `recruitmentMissionId` never opens a side door.
   */
  private async assertExpenseScope(
    expense: {
      clientId: string | null;
      recruitmentMissionId: string | null;
      missionPlacementId: string | null;
      trainingProgramId: string | null;
    },
    actorUserId: string,
    access: AccountingAccess,
    prisma: PrismaLike,
  ): Promise<void> {
    if (expense.clientId) {
      await this.assertClientScope(expense.clientId, access, prisma);
    }
    if (expense.recruitmentMissionId) {
      await this.assertMissionScope(expense.recruitmentMissionId, actorUserId, access, prisma);
    }
    if (expense.missionPlacementId) {
      await this.assertPlacementScope(expense.missionPlacementId, actorUserId, access, prisma);
    }
    if (expense.trainingProgramId) {
      await this.assertTrainingProgramScope(expense.trainingProgramId, actorUserId, access, prisma);
    }
  }

  /**
   * Server-side expense context integrity.
   *
   * Each supplied context is first resolved to its own business chain
   * (placement -> mission -> client, mission -> client, training program -> optional
   * client), and only then are the chains required to agree. Resolving before
   * comparing is what rejects a client combined with a placement from another client,
   * which the earlier pairwise comparison missed whenever the mission field was
   * omitted.
   */
  private async validateExpenseContext(
    input: ExpenseCreateRequest,
    actorUserId: string,
    access: AccountingAccess,
    tx: Tx,
  ): Promise<void> {
    if (input.clientId) {
      await this.assertClientScope(input.clientId, access, tx);
    }

    let missionClientId: string | null = null;
    let placementMissionId: string | null = null;
    let placementClientId: string | null = null;
    let programClientId: string | null = null;

    if (input.recruitmentMissionId) {
      const mission = await tx.recruitmentMission.findUnique({
        where: { id: input.recruitmentMissionId },
        select: { id: true, clientId: true },
      });
      if (!mission) {
        throw accountingNotFound();
      }
      await this.assertMissionScope(mission.id, actorUserId, access, tx);
      missionClientId = mission.clientId;
    }

    if (input.missionPlacementId) {
      const placement = await this.assertPlacementScope(
        input.missionPlacementId,
        actorUserId,
        access,
        tx,
      );
      placementMissionId = placement.missionId;
      placementClientId = placement.clientId;
    }

    if (input.trainingProgramId) {
      const program = await this.assertTrainingProgramScope(
        input.trainingProgramId,
        actorUserId,
        access,
        tx,
      );
      programClientId = program.clientId;
    }

    const mismatch = (message: string): never => {
      throw badRequest('EXPENSE_CONTEXT_MISMATCH', message);
    };

    if (
      input.recruitmentMissionId &&
      placementMissionId &&
      placementMissionId !== input.recruitmentMissionId
    ) {
      mismatch('The placement belongs to a different recruitment mission.');
    }
    if (input.clientId) {
      if (missionClientId && missionClientId !== input.clientId) {
        mismatch('The recruitment mission belongs to a different client.');
      }
      if (placementClientId && placementClientId !== input.clientId) {
        mismatch('The placement belongs to a different client.');
      }
      if (programClientId && programClientId !== input.clientId) {
        mismatch('The training program belongs to a different client.');
      }
    }
    // The derived chains must agree even when no client was supplied explicitly.
    if (missionClientId && placementClientId && missionClientId !== placementClientId) {
      mismatch('The placement and the recruitment mission belong to different clients.');
    }
    if (programClientId && missionClientId && programClientId !== missionClientId) {
      mismatch('The training program and the recruitment mission belong to different clients.');
    }
    if (programClientId && placementClientId && programClientId !== placementClientId) {
      mismatch('The training program and the placement belong to different clients.');
    }
  }

  private async getScopedPayment(id: string, access: AccountingAccess): Promise<PaymentRecord> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!payment) {
      throw accountingNotFound();
    }
    await this.assertClientScope(payment.clientId, access, this.prisma);
    return payment;
  }

  private async getScopedExpense(
    id: string,
    actorUserId: string,
    access: AccountingAccess,
  ): Promise<ExpenseRecord> {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: expenseInclude,
    });
    if (!expense) {
      throw accountingNotFound();
    }
    await this.assertExpenseScope(expense, actorUserId, access, this.prisma);
    return expense;
  }

  private async allocatedForPayment(paymentId: string, prisma: PrismaLike): Promise<number> {
    const result = await prisma.paymentAllocation.aggregate({
      where: { paymentId, status: PaymentAllocationStatus.ACTIVE },
      _sum: { amountCents: true },
    });
    return result._sum.amountCents ?? 0;
  }

  private async allocatedForInvoice(invoiceId: string, prisma: PrismaLike): Promise<number> {
    const result = await prisma.paymentAllocation.aggregate({
      where: { invoiceId, status: PaymentAllocationStatus.ACTIVE },
      _sum: { amountCents: true },
    });
    return result._sum.amountCents ?? 0;
  }

  private reloadPayment(id: string, prisma: PrismaLike): Promise<PaymentRecord> {
    return prisma.payment.findUniqueOrThrow({ where: { id }, include: paymentInclude });
  }

  private reloadExpense(id: string, prisma: PrismaLike): Promise<ExpenseRecord> {
    return prisma.expense.findUniqueOrThrow({ where: { id }, include: expenseInclude });
  }

  private writePaymentEvent(
    tx: Tx,
    paymentId: string,
    actorUserId: string,
    action: string,
    reason: string | null,
    safeSummary: string,
  ) {
    return tx.paymentEvent.create({
      data: { paymentId, actorUserId, action, reason, safeSummary },
    });
  }

  private writeExpenseEvent(
    tx: Tx,
    expenseId: string,
    actorUserId: string,
    action: string,
    reason: string | null,
    safeSummary: string,
  ) {
    return tx.expenseEvent.create({
      data: { expenseId, actorUserId, action, reason, safeSummary },
    });
  }

  private mapUnique(error: unknown, code: string, message: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      return conflict(code, message);
    }
    return error;
  }

  // --------------------------------------------------------------------------
  // Shaping
  // --------------------------------------------------------------------------

  private toPaymentSummary(payment: PaymentRecord, access: AccountingAccess): PaymentSummary {
    const allocated = payment.allocations
      .filter((a) => a.status === PaymentAllocationStatus.ACTIVE)
      .reduce((sum, a) => sum + a.amountCents, 0);
    return {
      id: payment.id,
      reference: payment.reference,
      clientId: payment.clientId,
      receivedDate: payment.receivedDate.toISOString(),
      method: payment.method,
      externalReference: payment.externalReference,
      note: payment.note,
      status: payment.status,
      amounts: access.commercialData
        ? {
            currency: payment.currency,
            amountCents: payment.amountCents,
            allocatedCents: allocated,
            unallocatedCents: payment.amountCents - allocated,
          }
        : null,
      correctedAt: isoOrNull(payment.correctedAt),
      correctionReason: access.commercialData ? payment.correctionReason : null,
      recordedByUserId: payment.recordedByUserId,
      archivedAt: isoOrNull(payment.archivedAt),
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }

  private toPaymentDetail(payment: PaymentRecord, access: AccountingAccess): PaymentDetail {
    return {
      ...this.toPaymentSummary(payment, access),
      allocations: payment.allocations.map((a) => this.toAllocationSummary(a, access)),
      history: payment.events.map((event) => ({
        id: event.id,
        action: event.action,
        actorUserId: event.actorUserId,
        reason: access.commercialData ? event.reason : null,
        safeSummary: event.safeSummary,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  private toAllocationSummary(
    allocation: AllocationRecord,
    access: AccountingAccess,
  ): PaymentAllocationSummary {
    return {
      id: allocation.id,
      paymentId: allocation.paymentId,
      invoiceId: allocation.invoiceId,
      status: allocation.status,
      amountCents: access.commercialData ? allocation.amountCents : null,
      allocatedByUserId: allocation.allocatedByUserId,
      reversedAt: isoOrNull(allocation.reversedAt),
      reversalReason: access.commercialData ? allocation.reversalReason : null,
      createdAt: allocation.createdAt.toISOString(),
      updatedAt: allocation.updatedAt.toISOString(),
    };
  }

  private toExpenseSummary(expense: ExpenseRecord, access: AccountingAccess) {
    return {
      id: expense.id,
      reference: expense.reference,
      expenseDate: expense.expenseDate.toISOString(),
      category: expense.category,
      context: {
        clientId: expense.clientId,
        recruitmentMissionId: expense.recruitmentMissionId,
        missionPlacementId: expense.missionPlacementId,
        trainingProgramId: expense.trainingProgramId,
      },
      vendorLabel: access.commercialData ? expense.vendorLabel : null,
      description: access.commercialData ? expense.description : null,
      status: expense.status,
      amounts: access.commercialData
        ? { currency: expense.currency, amountCents: expense.amountCents }
        : null,
      correctedAt: isoOrNull(expense.correctedAt),
      correctionReason: access.commercialData ? expense.correctionReason : null,
      createdByUserId: expense.createdByUserId,
      archivedAt: isoOrNull(expense.archivedAt),
      createdAt: expense.createdAt.toISOString(),
      updatedAt: expense.updatedAt.toISOString(),
    };
  }

  private toExpenseDetail(expense: ExpenseRecord, access: AccountingAccess) {
    return {
      ...this.toExpenseSummary(expense, access),
      history: expense.events.map((event) => ({
        id: event.id,
        action: event.action,
        actorUserId: event.actorUserId,
        reason: access.commercialData ? event.reason : null,
        safeSummary: event.safeSummary,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}

/**
 * Settlement is derived, never stored.
 *
 * Only ISSUED, non-archived invoices are receivable; DRAFT, CANCELED, and ARCHIVED
 * invoices are `NOT_RECEIVABLE` and never contribute to balances. `OVERDUE` takes
 * precedence over UNPAID/PARTIALLY_PAID once the due date has passed with a balance
 * still outstanding.
 */
function deriveSettlement(
  invoice: InvoiceRow,
  allocatedCents: number,
  now: Date,
): { state: InvoiceSettlementState; overdue: boolean; outstanding: number } {
  if (invoice.archivedAt || invoice.status !== InvoiceStatus.ISSUED) {
    return { state: 'NOT_RECEIVABLE', overdue: false, outstanding: 0 };
  }
  const outstanding = invoice.totalCents - allocatedCents;
  if (outstanding <= 0) {
    return { state: 'PAID', overdue: false, outstanding: 0 };
  }
  const overdue = invoice.dueDate !== null && invoice.dueDate.getTime() < now.getTime();
  if (overdue) {
    return { state: 'OVERDUE', overdue: true, outstanding };
  }
  return {
    state: allocatedCents > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
    overdue: false,
    outstanding,
  };
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}
