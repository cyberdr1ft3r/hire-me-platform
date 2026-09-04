import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CommercialContractCreateRequestSchema,
  CommercialContractDetailResponseSchema,
  CommercialContractListQuerySchema,
  CommercialContractListResponseSchema,
  CommercialContractStatusActionRequestSchema,
  CommercialContractUpdateRequestSchema,
  InvoiceCancelRequestSchema,
  InvoiceCreateRequestSchema,
  InvoiceDetailResponseSchema,
  InvoiceIssueRequestSchema,
  InvoiceListQuerySchema,
  InvoiceListResponseSchema,
  InvoiceUpdateRequestSchema,
  PurchaseOrderCreateRequestSchema,
  PurchaseOrderDetailResponseSchema,
  PurchaseOrderListQuerySchema,
  PurchaseOrderListResponseSchema,
  PurchaseOrderStatusActionRequestSchema,
  PurchaseOrderUpdateRequestSchema,
  QuotationCreateRequestSchema,
  QuotationDetailResponseSchema,
  QuotationListQuerySchema,
  QuotationListResponseSchema,
  QuotationStatusActionRequestSchema,
  QuotationUpdateRequestSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { CommercialService } from './commercial.service.js';
import { COMMERCIAL_PERMISSIONS } from './commercial-permissions.js';
import { badRequest } from './commercial.errors.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

@Controller('v1/commercial')
@UseGuards(AuthGuard, PermissionGuard)
export class CommercialController {
  constructor(@Inject(CommercialService) private readonly commercial: CommercialService) {}

  @Get('quotations')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.QUOTATIONS_VIEW)
  async listQuotations(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = QuotationListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_QUOTATION_LIST_QUERY', 'Invalid quotation list query.');
    }
    return QuotationListResponseSchema.parse(
      await this.commercial.listQuotations(parsed.data, request.user!.id),
    );
  }

  @Post('quotations')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.QUOTATIONS_MANAGE)
  async createQuotation(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = QuotationCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_QUOTATION_CREATE_REQUEST', 'Invalid quotation create request.');
    }
    return QuotationDetailResponseSchema.parse(
      await this.commercial.createQuotation(parsed.data, request.user!.id, this.context(request)),
    );
  }

  @Get('quotations/:quotationId')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.QUOTATIONS_VIEW)
  async getQuotation(@Param('quotationId') id: string, @Req() request: RequestWithUser) {
    return QuotationDetailResponseSchema.parse(
      await this.commercial.getQuotation(this.uuid(id), request.user!.id),
    );
  }

  @Patch('quotations/:quotationId')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.QUOTATIONS_MANAGE)
  async updateQuotation(
    @Param('quotationId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = QuotationUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_QUOTATION_UPDATE_REQUEST', 'Invalid quotation update request.');
    }
    return QuotationDetailResponseSchema.parse(
      await this.commercial.updateQuotation(
        this.uuid(id),
        parsed.data,
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('quotations/:quotationId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(COMMERCIAL_PERMISSIONS.QUOTATIONS_MANAGE)
  async updateQuotationStatus(
    @Param('quotationId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = QuotationStatusActionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_QUOTATION_STATUS_REQUEST', 'Invalid quotation status request.');
    }
    return QuotationDetailResponseSchema.parse(
      await this.commercial.updateQuotationStatus(
        this.uuid(id),
        parsed.data,
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('quotations/:quotationId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(COMMERCIAL_PERMISSIONS.QUOTATIONS_MANAGE)
  async archiveQuotation(@Param('quotationId') id: string, @Req() request: RequestWithUser) {
    return QuotationDetailResponseSchema.parse(
      await this.commercial.archiveQuotation(
        this.uuid(id),
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Get('contracts')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.CONTRACTS_VIEW)
  async listContracts(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = CommercialContractListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_CONTRACT_LIST_QUERY', 'Invalid contract list query.');
    }
    return CommercialContractListResponseSchema.parse(
      await this.commercial.listContracts(parsed.data, request.user!.id),
    );
  }

  @Post('contracts')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.CONTRACTS_MANAGE)
  async createContract(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = CommercialContractCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CONTRACT_CREATE_REQUEST', 'Invalid contract create request.');
    }
    return CommercialContractDetailResponseSchema.parse(
      await this.commercial.createContract(parsed.data, request.user!.id, this.context(request)),
    );
  }

  @Get('contracts/:contractId')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.CONTRACTS_VIEW)
  async getContract(@Param('contractId') id: string, @Req() request: RequestWithUser) {
    return CommercialContractDetailResponseSchema.parse(
      await this.commercial.getContract(this.uuid(id), request.user!.id),
    );
  }

  @Patch('contracts/:contractId')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.CONTRACTS_MANAGE)
  async updateContract(
    @Param('contractId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CommercialContractUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CONTRACT_UPDATE_REQUEST', 'Invalid contract update request.');
    }
    return CommercialContractDetailResponseSchema.parse(
      await this.commercial.updateContract(
        this.uuid(id),
        parsed.data,
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('contracts/:contractId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(COMMERCIAL_PERMISSIONS.CONTRACTS_MANAGE)
  async updateContractStatus(
    @Param('contractId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = CommercialContractStatusActionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CONTRACT_STATUS_REQUEST', 'Invalid contract status request.');
    }
    return CommercialContractDetailResponseSchema.parse(
      await this.commercial.updateContractStatus(
        this.uuid(id),
        parsed.data,
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('contracts/:contractId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(COMMERCIAL_PERMISSIONS.CONTRACTS_MANAGE)
  async archiveContract(@Param('contractId') id: string, @Req() request: RequestWithUser) {
    return CommercialContractDetailResponseSchema.parse(
      await this.commercial.archiveContract(this.uuid(id), request.user!.id, this.context(request)),
    );
  }

  @Get('purchase-orders')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.PURCHASE_ORDERS_VIEW)
  async listPurchaseOrders(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = PurchaseOrderListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_PURCHASE_ORDER_LIST_QUERY', 'Invalid purchase order list query.');
    }
    return PurchaseOrderListResponseSchema.parse(
      await this.commercial.listPurchaseOrders(parsed.data, request.user!.id),
    );
  }

  @Post('purchase-orders')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.PURCHASE_ORDERS_MANAGE)
  async createPurchaseOrder(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = PurchaseOrderCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_PURCHASE_ORDER_CREATE_REQUEST', 'Invalid purchase order request.');
    }
    return PurchaseOrderDetailResponseSchema.parse(
      await this.commercial.createPurchaseOrder(
        parsed.data,
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Get('purchase-orders/:purchaseOrderId')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.PURCHASE_ORDERS_VIEW)
  async getPurchaseOrder(@Param('purchaseOrderId') id: string, @Req() request: RequestWithUser) {
    return PurchaseOrderDetailResponseSchema.parse(
      await this.commercial.getPurchaseOrder(this.uuid(id), request.user!.id),
    );
  }

  @Patch('purchase-orders/:purchaseOrderId')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.PURCHASE_ORDERS_MANAGE)
  async updatePurchaseOrder(
    @Param('purchaseOrderId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = PurchaseOrderUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_PURCHASE_ORDER_UPDATE_REQUEST', 'Invalid purchase order update.');
    }
    return PurchaseOrderDetailResponseSchema.parse(
      await this.commercial.updatePurchaseOrder(
        this.uuid(id),
        parsed.data,
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('purchase-orders/:purchaseOrderId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(COMMERCIAL_PERMISSIONS.PURCHASE_ORDERS_MANAGE)
  async updatePurchaseOrderStatus(
    @Param('purchaseOrderId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = PurchaseOrderStatusActionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_PURCHASE_ORDER_STATUS_REQUEST', 'Invalid purchase order status.');
    }
    return PurchaseOrderDetailResponseSchema.parse(
      await this.commercial.updatePurchaseOrderStatus(
        this.uuid(id),
        parsed.data,
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('purchase-orders/:purchaseOrderId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(COMMERCIAL_PERMISSIONS.PURCHASE_ORDERS_MANAGE)
  async archivePurchaseOrder(
    @Param('purchaseOrderId') id: string,
    @Req() request: RequestWithUser,
  ) {
    return PurchaseOrderDetailResponseSchema.parse(
      await this.commercial.archivePurchaseOrder(
        this.uuid(id),
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Get('invoices')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.INVOICES_VIEW)
  async listInvoices(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = InvoiceListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_INVOICE_LIST_QUERY', 'Invalid invoice list query.');
    }
    return InvoiceListResponseSchema.parse(
      await this.commercial.listInvoices(parsed.data, request.user!.id),
    );
  }

  @Post('invoices')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.INVOICES_MANAGE)
  async createInvoice(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = InvoiceCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_INVOICE_CREATE_REQUEST', 'Invalid invoice create request.');
    }
    return InvoiceDetailResponseSchema.parse(
      await this.commercial.createInvoice(parsed.data, request.user!.id, this.context(request)),
    );
  }

  @Get('invoices/:invoiceId')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.INVOICES_VIEW)
  async getInvoice(@Param('invoiceId') id: string, @Req() request: RequestWithUser) {
    return InvoiceDetailResponseSchema.parse(
      await this.commercial.getInvoice(this.uuid(id), request.user!.id),
    );
  }

  @Patch('invoices/:invoiceId')
  @RequirePermissions(COMMERCIAL_PERMISSIONS.INVOICES_MANAGE)
  async updateInvoice(
    @Param('invoiceId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InvoiceUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_INVOICE_UPDATE_REQUEST', 'Invalid invoice update request.');
    }
    return InvoiceDetailResponseSchema.parse(
      await this.commercial.updateInvoice(
        this.uuid(id),
        parsed.data,
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('invoices/:invoiceId/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(COMMERCIAL_PERMISSIONS.INVOICES_MANAGE)
  async issueInvoice(
    @Param('invoiceId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InvoiceIssueRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_INVOICE_ISSUE_REQUEST', 'Invalid invoice issue request.');
    }
    return InvoiceDetailResponseSchema.parse(
      await this.commercial.issueInvoice(
        this.uuid(id),
        parsed.data,
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('invoices/:invoiceId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(COMMERCIAL_PERMISSIONS.INVOICES_MANAGE)
  async cancelInvoice(
    @Param('invoiceId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = InvoiceCancelRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_INVOICE_CANCEL_REQUEST', 'Invalid invoice cancel request.');
    }
    return InvoiceDetailResponseSchema.parse(
      await this.commercial.cancelInvoice(
        this.uuid(id),
        parsed.data,
        request.user!.id,
        this.context(request),
      ),
    );
  }

  @Post('invoices/:invoiceId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(COMMERCIAL_PERMISSIONS.INVOICES_MANAGE)
  async archiveInvoice(@Param('invoiceId') id: string, @Req() request: RequestWithUser) {
    return InvoiceDetailResponseSchema.parse(
      await this.commercial.archiveInvoice(this.uuid(id), request.user!.id, this.context(request)),
    );
  }

  private uuid(value: string): string {
    const parsed = UuidParamSchema.safeParse(value);
    if (!parsed.success) {
      throw badRequest('INVALID_UUID', 'Invalid identifier.');
    }
    return parsed.data;
  }

  private context(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'unknown',
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
