import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ClientReceivableQuerySchema,
  ClientReceivableSummaryResponseSchema,
  ExpenseCorrectRequestSchema,
  ExpenseCreateRequestSchema,
  ExpenseDetailResponseSchema,
  ExpenseListQuerySchema,
  ExpenseListResponseSchema,
  ExpenseUpdateRequestSchema,
  InvoiceSettlementResponseSchema,
  OverdueReceivableListResponseSchema,
  OverdueReceivableQuerySchema,
  PaymentAllocationCreateRequestSchema,
  PaymentAllocationDetailResponseSchema,
  PaymentAllocationReverseRequestSchema,
  PaymentCorrectRequestSchema,
  PaymentCreateRequestSchema,
  PaymentDetailResponseSchema,
  PaymentListQuerySchema,
  PaymentListResponseSchema,
  PaymentUpdateRequestSchema,
  ProfitabilityQuerySchema,
  ProfitabilitySummaryResponseSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { ACCOUNTING_PERMISSIONS } from './accounting-permissions.js';
import { badRequest } from './accounting.errors.js';
import { AccountingService } from './accounting.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { COMMERCIAL_PERMISSIONS } from '../commercial/commercial-permissions.js';

const UuidParamSchema = z.string().uuid();

/**
 * Issue #39 accounting endpoints.
 *
 * Route guards check the coarse capability; the service then re-checks the exact
 * capability, commercial-data access, and the underlying client/mission record scope,
 * so financial data is never exposed by route reachability alone.
 */
@Controller('v1/accounting')
@UseGuards(AuthGuard, PermissionGuard)
export class AccountingController {
  constructor(@Inject(AccountingService) private readonly accounting: AccountingService) {}

  // --- Payments ---------------------------------------------------------------

  @Get('payments')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.PAYMENTS_VIEW)
  async listPayments(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = PaymentListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_PAYMENT_LIST_QUERY', 'Invalid payment list query.');
    }

    return PaymentListResponseSchema.parse(
      await this.accounting.listPayments(parsed.data, request.user!.id),
    );
  }

  @Post('payments')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE)
  async createPayment(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = PaymentCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_PAYMENT_REQUEST', 'Invalid create payment request.');
    }

    return PaymentDetailResponseSchema.parse(
      await this.accounting.createPayment(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Get('payments/:paymentId')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.PAYMENTS_VIEW)
  async getPayment(@Param('paymentId') paymentId: string, @Req() request: RequestWithUser) {
    return PaymentDetailResponseSchema.parse(
      await this.accounting.getPayment(this.uuid(paymentId), request.user!.id),
    );
  }

  @Patch('payments/:paymentId')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE)
  async updatePayment(
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = PaymentUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_UPDATE_PAYMENT_REQUEST', 'Invalid update payment request.');
    }

    return PaymentDetailResponseSchema.parse(
      await this.accounting.updatePayment(
        this.uuid(paymentId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('payments/:paymentId/correct')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.PAYMENTS_CORRECT)
  async correctPayment(
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = PaymentCorrectRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_PAYMENT_CORRECTION_REQUEST',
        'A payment correction amount and reason are required.',
      );
    }

    return PaymentDetailResponseSchema.parse(
      await this.accounting.correctPayment(
        this.uuid(paymentId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('payments/:paymentId/archive')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE)
  async archivePayment(@Param('paymentId') paymentId: string, @Req() request: RequestWithUser) {
    return PaymentDetailResponseSchema.parse(
      await this.accounting.archivePayment(
        this.uuid(paymentId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  // --- Allocation -------------------------------------------------------------

  @Post('payments/:paymentId/allocations')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE, COMMERCIAL_PERMISSIONS.INVOICES_VIEW)
  async allocatePayment(
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = PaymentAllocationCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_ALLOCATION_REQUEST', 'Invalid payment allocation request.');
    }

    return PaymentAllocationDetailResponseSchema.parse(
      await this.accounting.allocatePayment(
        this.uuid(paymentId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('payments/:paymentId/allocations/:allocationId/reverse')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.PAYMENTS_MANAGE)
  async reverseAllocation(
    @Param('paymentId') paymentId: string,
    @Param('allocationId') allocationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = PaymentAllocationReverseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_ALLOCATION_REVERSAL_REQUEST',
        'An allocation reversal reason is required.',
      );
    }

    return PaymentAllocationDetailResponseSchema.parse(
      await this.accounting.reverseAllocation(
        this.uuid(paymentId),
        this.uuid(allocationId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  // --- Invoice settlement -----------------------------------------------------

  @Get('invoices/:invoiceId/settlement')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.INVOICES_VIEW, ACCOUNTING_PERMISSIONS.PAYMENTS_VIEW)
  async getInvoiceSettlement(
    @Param('invoiceId') invoiceId: string,
    @Req() request: RequestWithUser,
  ) {
    return InvoiceSettlementResponseSchema.parse(
      await this.accounting.getInvoiceSettlement(this.uuid(invoiceId), request.user!.id),
    );
  }

  // --- Expenses ---------------------------------------------------------------

  @Get('expenses')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.EXPENSES_VIEW)
  async listExpenses(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = ExpenseListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_EXPENSE_LIST_QUERY', 'Invalid expense list query.');
    }

    return ExpenseListResponseSchema.parse(
      await this.accounting.listExpenses(parsed.data, request.user!.id),
    );
  }

  @Post('expenses')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.EXPENSES_MANAGE)
  async createExpense(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = ExpenseCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_EXPENSE_REQUEST', 'Invalid create expense request.');
    }

    return ExpenseDetailResponseSchema.parse(
      await this.accounting.createExpense(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Get('expenses/:expenseId')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.EXPENSES_VIEW)
  async getExpense(@Param('expenseId') expenseId: string, @Req() request: RequestWithUser) {
    return ExpenseDetailResponseSchema.parse(
      await this.accounting.getExpense(this.uuid(expenseId), request.user!.id),
    );
  }

  @Patch('expenses/:expenseId')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.EXPENSES_MANAGE)
  async updateExpense(
    @Param('expenseId') expenseId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = ExpenseUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_UPDATE_EXPENSE_REQUEST', 'Invalid update expense request.');
    }

    return ExpenseDetailResponseSchema.parse(
      await this.accounting.updateExpense(
        this.uuid(expenseId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('expenses/:expenseId/correct')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.EXPENSES_MANAGE)
  async correctExpense(
    @Param('expenseId') expenseId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = ExpenseCorrectRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_EXPENSE_CORRECTION_REQUEST',
        'An expense correction amount and reason are required.',
      );
    }

    return ExpenseDetailResponseSchema.parse(
      await this.accounting.correctExpense(
        this.uuid(expenseId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('expenses/:expenseId/archive')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.EXPENSES_MANAGE)
  async archiveExpense(@Param('expenseId') expenseId: string, @Req() request: RequestWithUser) {
    return ExpenseDetailResponseSchema.parse(
      await this.accounting.archiveExpense(
        this.uuid(expenseId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  // --- Receivables and profitability ------------------------------------------

  @Get('receivables/client')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.CLIENT_BALANCES_VIEW)
  async getClientReceivables(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = ClientReceivableQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_CLIENT_RECEIVABLE_QUERY', 'A valid clientId is required.');
    }

    return ClientReceivableSummaryResponseSchema.parse(
      await this.accounting.getClientReceivables(parsed.data.clientId, request.user!.id),
    );
  }

  @Get('receivables/overdue')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.CLIENT_BALANCES_VIEW)
  async listOverdueReceivables(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = OverdueReceivableQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_OVERDUE_RECEIVABLE_QUERY', 'Invalid overdue receivable query.');
    }

    return OverdueReceivableListResponseSchema.parse(
      await this.accounting.listOverdueReceivables(parsed.data, request.user!.id),
    );
  }

  @Get('profitability')
  @RequirePermissions(ACCOUNTING_PERMISSIONS.PROFITABILITY_VIEW)
  async getProfitability(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = ProfitabilityQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_PROFITABILITY_QUERY', 'Invalid profitability query.');
    }

    return ProfitabilitySummaryResponseSchema.parse(
      await this.accounting.getProfitability(parsed.data, request.user!.id),
    );
  }

  private uuid(value: string): string {
    const parsed = UuidParamSchema.safeParse(value);
    if (!parsed.success) {
      throw badRequest('INVALID_UUID', 'Invalid identifier.');
    }

    return parsed.data;
  }

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'unknown',
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
