import { Controller, Get, Header, Inject, Query, Req, Res, UseGuards } from '@nestjs/common';
import {
  ReportingBreakdownsResponseSchema,
  ReportingDrilldownQuerySchema,
  ReportingDrilldownResponseSchema,
  ReportingFilterQuerySchema,
  ReportingMaxExportRows,
  ReportingPipelineResponseSchema,
  ReportingSummaryResponseSchema,
  ReportingTrendsQuerySchema,
  ReportingTrendsResponseSchema,
} from '@hire-me/contracts';

import { badRequest } from './reporting.errors.js';
import { ReportingAuditService } from './reporting-audit.service.js';
import {
  REPORTING_EXPORT_REQUIRED_PERMISSIONS,
  REPORTING_VIEW_REQUIRED_PERMISSIONS,
} from './reporting-permissions.js';
import { buildReportingCsv, buildReportingCsvFilename } from './reporting-csv.js';
import { ReportingService } from './reporting.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

// Minimal response contract for setting the CSV download headers without coupling
// the controller to a specific HTTP framework type package.
type CsvResponse = { setHeader(name: string, value: string): void };

@Controller('v1/reporting/recruitment')
@UseGuards(AuthGuard, PermissionGuard)
export class ReportingController {
  constructor(
    @Inject(ReportingService) private readonly reporting: ReportingService,
    @Inject(ReportingAuditService) private readonly audit: ReportingAuditService,
  ) {}

  @Get('summary')
  @RequirePermissions(...REPORTING_VIEW_REQUIRED_PERMISSIONS)
  async getSummary(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = ReportingFilterQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_REPORTING_QUERY', 'Invalid reporting query.');
    }
    return ReportingSummaryResponseSchema.parse({
      summary: await this.reporting.getSummary(parsed.data, request.user!.id),
    });
  }

  @Get('pipeline')
  @RequirePermissions(...REPORTING_VIEW_REQUIRED_PERMISSIONS)
  async getPipeline(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = ReportingFilterQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_REPORTING_QUERY', 'Invalid reporting query.');
    }
    return ReportingPipelineResponseSchema.parse(
      await this.reporting.getPipeline(parsed.data, request.user!.id),
    );
  }

  @Get('trends')
  @RequirePermissions(...REPORTING_VIEW_REQUIRED_PERMISSIONS)
  async getTrends(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = ReportingTrendsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_REPORTING_QUERY', 'Invalid reporting query.');
    }
    return ReportingTrendsResponseSchema.parse(
      await this.reporting.getTrends(parsed.data, request.user!.id),
    );
  }

  @Get('breakdowns')
  @RequirePermissions(...REPORTING_VIEW_REQUIRED_PERMISSIONS)
  async getBreakdowns(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = ReportingFilterQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_REPORTING_QUERY', 'Invalid reporting query.');
    }
    return ReportingBreakdownsResponseSchema.parse(
      await this.reporting.getBreakdowns(parsed.data, request.user!.id),
    );
  }

  @Get('drilldown')
  @RequirePermissions(...REPORTING_VIEW_REQUIRED_PERMISSIONS)
  async getDrilldown(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = ReportingDrilldownQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_REPORTING_QUERY', 'Invalid reporting query.');
    }
    return ReportingDrilldownResponseSchema.parse(
      await this.reporting.getDrilldown(parsed.data, request.user!.id),
    );
  }

  @Get('export.csv')
  @RequirePermissions(...REPORTING_EXPORT_REQUIRED_PERMISSIONS)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Query() query: unknown,
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: CsvResponse,
  ): Promise<string> {
    const parsed = ReportingFilterQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_REPORTING_QUERY', 'Invalid reporting query.');
    }
    const { rows, window } = await this.reporting.getDrilldownRowsForExport(
      parsed.data,
      request.user!.id,
      ReportingMaxExportRows,
    );
    const csv = buildReportingCsv(rows);
    const filename = buildReportingCsvFilename(new Date());
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await this.audit.recordExport(this.getContext(request), {
      actorUserId: request.user!.id,
      metadataSummary: this.exportSummary(parsed.data, rows.length, window.start, window.end),
    });

    return csv;
  }

  private exportSummary(
    filters: {
      clientId?: string;
      missionId?: string;
      recruiterUserId?: string;
      pipelineState?: string;
      offerStatus?: string;
      placementStatus?: string;
      source?: string;
    },
    rowCount: number,
    windowStart: string,
    windowEnd: string,
  ): string {
    const parts = [
      `rows=${rowCount}`,
      `window=${windowStart}..${windowEnd}`,
      filters.clientId ? `clientId=${filters.clientId}` : undefined,
      filters.missionId ? `missionId=${filters.missionId}` : undefined,
      filters.recruiterUserId ? `recruiterUserId=${filters.recruiterUserId}` : undefined,
      filters.pipelineState ? `pipelineState=${filters.pipelineState}` : undefined,
      filters.offerStatus ? `offerStatus=${filters.offerStatus}` : undefined,
      filters.placementStatus ? `placementStatus=${filters.placementStatus}` : undefined,
      filters.source ? 'source=set' : undefined,
    ].filter((part): part is string => part !== undefined);
    return `Recruitment reporting CSV export (${parts.join(', ')}).`;
  }

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'unknown',
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
