import { Inject, Injectable } from '@nestjs/common';
import type {
  ReportingAppliedFilters,
  ReportingBreakdownsResponse,
  ReportingDistributionEntry,
  ReportingDrilldownQuery,
  ReportingDrilldownResponse,
  ReportingFilterQuery,
  ReportingPipelineResponse,
  ReportingScope,
  ReportingSummary,
  ReportingTrendSeries,
  ReportingTrendsQuery,
  ReportingTrendsResponse,
  ReportingWindow,
} from '@hire-me/contracts';
import { ReportingMaxBreakdownEntries, ReportingMaxWindowDays } from '@hire-me/contracts';

import { badRequest } from './reporting.errors.js';
import { REPORTING_BROAD_SCOPE_PERMISSION } from './reporting-permissions.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
  AssignmentStatus,
  InterviewStatus,
  MissionCandidateState,
  OfferStatus,
  PlacementStatus,
  Prisma,
  RecruitmentMissionState,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 90;
// Non-terminal recruitment mission states that still count as open/active work.
const TERMINAL_MISSION_STATES: RecruitmentMissionState[] = [
  RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
  RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
  RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
  RecruitmentMissionState.CANCELED,
  RecruitmentMissionState.ARCHIVED,
];
// Missions that reached a closure state. ARCHIVED is a post-closure lifecycle end
// and is reported separately through the byState distribution.
const CLOSED_MISSION_STATES: RecruitmentMissionState[] = [
  RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
  RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
  RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
  RecruitmentMissionState.CANCELED,
];
const NON_OPEN_MISSION_STATES = new Set<RecruitmentMissionState>([
  RecruitmentMissionState.DRAFT,
  ...TERMINAL_MISSION_STATES,
]);
const TERMINAL_PROCESS_STATES: MissionCandidateState[] = [
  MissionCandidateState.CANDIDATE_REJECTED,
  MissionCandidateState.CLIENT_REJECTED,
  MissionCandidateState.WITHDRAWN,
  MissionCandidateState.TALENT_POOL,
  MissionCandidateState.PROCESS_COMPLETED,
];
// A non-terminal process not updated within this many days is reported as stale.
const STALE_PROCESS_DAYS = 30;

type ResolvedScope = {
  kind: ReportingScope['kind'];
  broad: boolean;
  actorUserId: string;
};

type ResolvedFilters = {
  clientId?: string;
  missionId?: string;
  recruiterUserId?: string;
  pipelineState?: MissionCandidateState;
  offerStatus?: OfferStatus;
  placementStatus?: PlacementStatus;
  source?: string;
};

type ResolvedWindow = { start: Date; end: Date };

@Injectable()
export class ReportingService {
  constructor(
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async getSummary(query: ReportingFilterQuery, actorUserId: string): Promise<ReportingSummary> {
    const scope = await this.resolveScope(actorUserId);
    const filters = this.resolveFilters(query);
    const window = this.resolveWindow(query.start, query.end);

    const missionWhere = this.missionWhere(scope, filters);
    const missionRows = await this.prisma.recruitmentMission.findMany({
      where: missionWhere,
      select: {
        state: true,
        numberOfPositions: true,
        filledPlacementCount: true,
        applicationDeadline: true,
      },
    });

    const now = new Date();
    const missionByState = new Map<string, number>();
    let openMissions = 0;
    let closedMissions = 0;
    let closureEligible = 0;
    let requestedPositions = 0;
    let overdueMissions = 0;
    for (const mission of missionRows) {
      missionByState.set(mission.state, (missionByState.get(mission.state) ?? 0) + 1);
      requestedPositions += mission.numberOfPositions;
      if (!NON_OPEN_MISSION_STATES.has(mission.state)) {
        openMissions += 1;
      }
      if (CLOSED_MISSION_STATES.includes(mission.state)) {
        closedMissions += 1;
      }
      if (
        !TERMINAL_MISSION_STATES.includes(mission.state) &&
        mission.filledPlacementCount >= mission.numberOfPositions
      ) {
        closureEligible += 1;
      }
      if (
        !TERMINAL_MISSION_STATES.includes(mission.state) &&
        mission.applicationDeadline !== null &&
        mission.applicationDeadline.getTime() < now.getTime()
      ) {
        overdueMissions += 1;
      }
    }

    const processWhere = this.processWhere(scope, filters);
    const [processGroups, presentedToClient, stalePipelineProcesses] = await Promise.all([
      this.prisma.missionCandidate.groupBy({
        by: ['state'],
        where: processWhere,
        _count: { _all: true },
      }),
      this.prisma.missionCandidate.count({
        where: { ...processWhere, presentedAt: { not: null } },
      }),
      this.prisma.missionCandidate.count({
        where: {
          ...processWhere,
          state: { notIn: TERMINAL_PROCESS_STATES },
          updatedAt: { lt: new Date(now.getTime() - STALE_PROCESS_DAYS * DAY_MS) },
        },
      }),
    ]);
    const totalProcesses = processGroups.reduce((sum, group) => sum + group._count._all, 0);

    const newApplications = await this.prisma.publicCandidateApplication.count({
      where: {
        missionCandidate: this.processWhere(scope, filters),
        submittedAt: { gte: window.start, lte: window.end },
      },
    });

    const [interviewStatusGroups, interviewTypeGroups] = await Promise.all([
      this.prisma.interview.groupBy({
        by: ['status'],
        where: this.interviewWhere(scope, filters),
        _count: { _all: true },
      }),
      this.prisma.interview.groupBy({
        by: ['type'],
        where: this.interviewWhere(scope, filters),
        _count: { _all: true },
      }),
    ]);
    const interviewByStatus = this.toDistribution(
      interviewStatusGroups.map((group) => [group.status, group._count._all]),
    );
    const interviewByType = this.toDistribution(
      interviewTypeGroups.map((group) => [group.type, group._count._all]),
    );

    const offerGroups = await this.prisma.recruitmentOfferVersion.groupBy({
      by: ['status'],
      where: this.offerWhere(scope, filters),
      _count: { _all: true },
    });
    const offerByStatus = this.toDistribution(
      offerGroups.map((group) => [group.status, group._count._all]),
    );
    const offerTotals = new Map(offerGroups.map((group) => [group.status, group._count._all]));

    const placementGroups = await this.prisma.missionPlacement.groupBy({
      by: ['status'],
      where: this.placementWhere(scope, filters),
      _count: { _all: true },
    });
    const placementByStatus = this.toDistribution(
      placementGroups.map((group) => [group.status, group._count._all]),
    );
    const placementTotals = new Map(
      placementGroups.map((group) => [group.status, group._count._all]),
    );

    return {
      window: this.toWindow(window),
      scope: await this.toScope(scope),
      filters: this.toAppliedFilters(filters),
      missions: {
        total: missionRows.length,
        open: openMissions,
        closureEligible,
        closed: closedMissions,
        requestedPositions,
        byState: this.toDistribution([...missionByState.entries()]),
      },
      pipeline: {
        totalProcesses,
        presentedToClient,
        byState: this.toDistribution(
          processGroups.map((group) => [group.state, group._count._all]),
        ),
      },
      applications: {
        newInWindow: newApplications,
      },
      interviews: {
        scheduled: interviewTotals(interviewStatusGroups, InterviewStatus.SCHEDULED),
        completed: interviewTotals(interviewStatusGroups, InterviewStatus.COMPLETED),
        canceled: interviewTotals(interviewStatusGroups, InterviewStatus.CANCELED),
        byStatus: interviewByStatus,
        byType: interviewByType,
      },
      offers: {
        total: [...offerTotals.values()].reduce((sum, count) => sum + count, 0),
        accepted: offerTotals.get(OfferStatus.ACCEPTED) ?? 0,
        rejected: offerTotals.get(OfferStatus.REJECTED) ?? 0,
        withdrawn: offerTotals.get(OfferStatus.WITHDRAWN) ?? 0,
        byCurrentStatus: offerByStatus,
      },
      placements: {
        confirmed: placementTotals.get(PlacementStatus.CONFIRMED) ?? 0,
        corrected: placementTotals.get(PlacementStatus.CORRECTED) ?? 0,
        requestedPositions,
        byStatus: placementByStatus,
      },
      aging: {
        overdueMissions,
        stalePipelineProcesses,
      },
    };
  }

  async getPipeline(
    query: ReportingFilterQuery,
    actorUserId: string,
  ): Promise<ReportingPipelineResponse> {
    const scope = await this.resolveScope(actorUserId);
    const filters = this.resolveFilters(query);
    const window = this.resolveWindow(query.start, query.end);

    const [
      missionGroups,
      processGroups,
      interviewStatus,
      interviewType,
      offerGroups,
      placementGroups,
    ] = await Promise.all([
      this.prisma.recruitmentMission.groupBy({
        by: ['state'],
        where: this.missionWhere(scope, filters),
        _count: { _all: true },
      }),
      this.prisma.missionCandidate.groupBy({
        by: ['state'],
        where: this.processWhere(scope, filters),
        _count: { _all: true },
      }),
      this.prisma.interview.groupBy({
        by: ['status'],
        where: this.interviewWhere(scope, filters),
        _count: { _all: true },
      }),
      this.prisma.interview.groupBy({
        by: ['type'],
        where: this.interviewWhere(scope, filters),
        _count: { _all: true },
      }),
      this.prisma.recruitmentOfferVersion.groupBy({
        by: ['status'],
        where: this.offerWhere(scope, filters),
        _count: { _all: true },
      }),
      this.prisma.missionPlacement.groupBy({
        by: ['status'],
        where: this.placementWhere(scope, filters),
        _count: { _all: true },
      }),
    ]);

    return {
      window: this.toWindow(window),
      scope: await this.toScope(scope),
      filters: this.toAppliedFilters(filters),
      distributions: {
        missionsByState: this.toDistribution(
          missionGroups.map((group) => [group.state, group._count._all]),
        ),
        processesByState: this.toDistribution(
          processGroups.map((group) => [group.state, group._count._all]),
        ),
        interviewsByStatus: this.toDistribution(
          interviewStatus.map((group) => [group.status, group._count._all]),
        ),
        interviewsByType: this.toDistribution(
          interviewType.map((group) => [group.type, group._count._all]),
        ),
        offersByCurrentStatus: this.toDistribution(
          offerGroups.map((group) => [group.status, group._count._all]),
        ),
        placementsByStatus: this.toDistribution(
          placementGroups.map((group) => [group.status, group._count._all]),
        ),
      },
    };
  }

  async getTrends(
    query: ReportingTrendsQuery,
    actorUserId: string,
  ): Promise<ReportingTrendsResponse> {
    const scope = await this.resolveScope(actorUserId);
    const filters = this.resolveFilters(query);
    const window = this.resolveWindow(query.start, query.end);
    const buckets = this.buildBuckets(window, query.interval);

    const [processes, applications, interviews, offers, placements] = await Promise.all([
      this.prisma.missionCandidate.findMany({
        where: {
          ...this.processWhere(scope, filters),
          createdAt: { gte: window.start, lte: window.end },
        },
        select: { createdAt: true },
      }),
      this.prisma.publicCandidateApplication.findMany({
        where: {
          missionCandidate: this.processWhere(scope, filters),
          submittedAt: { gte: window.start, lte: window.end },
        },
        select: { submittedAt: true },
      }),
      this.prisma.interview.findMany({
        where: {
          ...this.interviewWhere(scope, filters),
          scheduledStartAt: { gte: window.start, lte: window.end },
        },
        select: { scheduledStartAt: true },
      }),
      // offersCreated: offers whose current version satisfies every accepted filter
      // (including offerStatus), routed through the canonical process filter.
      this.prisma.recruitmentOffer.findMany({
        where: {
          missionCandidate: this.processWhere(scope, filters),
          createdAt: { gte: window.start, lte: window.end },
        },
        select: { createdAt: true },
      }),
      this.prisma.missionPlacement.findMany({
        where: {
          ...this.placementWhere(scope, filters),
          confirmedAt: { gte: window.start, lte: window.end },
        },
        select: { confirmedAt: true },
      }),
    ]);

    const series: ReportingTrendSeries[] = [
      {
        metric: 'processesCreated',
        points: this.bucketize(
          buckets,
          processes.map((r) => r.createdAt),
        ),
      },
      {
        metric: 'publicApplications',
        points: this.bucketize(
          buckets,
          applications.map((r) => r.submittedAt),
        ),
      },
      {
        metric: 'interviewsScheduled',
        points: this.bucketize(
          buckets,
          interviews.map((r) => r.scheduledStartAt),
        ),
      },
      {
        metric: 'offersCreated',
        points: this.bucketize(
          buckets,
          offers.map((r) => r.createdAt),
        ),
      },
      {
        metric: 'placementsConfirmed',
        points: this.bucketize(
          buckets,
          placements.map((r) => r.confirmedAt),
        ),
      },
    ];

    return {
      window: this.toWindow(window),
      scope: await this.toScope(scope),
      filters: this.toAppliedFilters(filters),
      interval: query.interval,
      series,
    };
  }

  async getBreakdowns(
    query: ReportingFilterQuery,
    actorUserId: string,
  ): Promise<ReportingBreakdownsResponse> {
    const scope = await this.resolveScope(actorUserId);
    const filters = this.resolveFilters(query);
    const window = this.resolveWindow(query.start, query.end);

    const missions = await this.prisma.recruitmentMission.findMany({
      where: this.missionWhere(scope, filters),
      select: {
        id: true,
        title: true,
        state: true,
        numberOfPositions: true,
        clientId: true,
        client: { select: { name: true } },
      },
    });

    const [processByMission, processByRecruiter, activeProcessByRecruiter, placementRows] =
      await Promise.all([
        this.prisma.missionCandidate.groupBy({
          by: ['missionId'],
          where: this.processWhere(scope, filters),
          _count: { _all: true },
        }),
        this.prisma.missionCandidate.groupBy({
          by: ['responsibleRecruiterUserId'],
          where: this.processWhere(scope, filters),
          _count: { _all: true },
        }),
        this.prisma.missionCandidate.groupBy({
          by: ['responsibleRecruiterUserId'],
          where: {
            ...this.processWhere(scope, filters),
            state: { notIn: TERMINAL_PROCESS_STATES },
          },
          _count: { _all: true },
        }),
        this.prisma.missionPlacement.findMany({
          where: this.placementWhere(scope, filters, PlacementStatus.CONFIRMED),
          select: {
            missionId: true,
            missionCandidate: { select: { responsibleRecruiterUserId: true } },
          },
        }),
      ]);

    const processCountByMission = new Map(
      processByMission.map((group) => [group.missionId, group._count._all]),
    );
    const placementCountByMission = new Map<string, number>();
    const placementCountByRecruiter = new Map<string, number>();
    for (const placement of placementRows) {
      placementCountByMission.set(
        placement.missionId,
        (placementCountByMission.get(placement.missionId) ?? 0) + 1,
      );
      const recruiterId = placement.missionCandidate.responsibleRecruiterUserId;
      placementCountByRecruiter.set(
        recruiterId,
        (placementCountByRecruiter.get(recruiterId) ?? 0) + 1,
      );
    }

    // Per-mission breakdown.
    const byMission = missions
      .map((mission) => ({
        missionId: mission.id,
        missionTitle: mission.title,
        clientId: mission.clientId,
        clientName: mission.client.name,
        state: mission.state,
        totalProcesses: processCountByMission.get(mission.id) ?? 0,
        confirmedPlacements: placementCountByMission.get(mission.id) ?? 0,
        requestedPositions: mission.numberOfPositions,
      }))
      .sort(
        (a, b) =>
          b.confirmedPlacements - a.confirmedPlacements ||
          b.totalProcesses - a.totalProcesses ||
          a.missionId.localeCompare(b.missionId),
      )
      .slice(0, ReportingMaxBreakdownEntries);

    // Per-client breakdown.
    const clientAccumulator = new Map<
      string,
      {
        clientName: string;
        openMissions: number;
        totalProcesses: number;
        confirmedPlacements: number;
      }
    >();
    for (const mission of missions) {
      const entry = clientAccumulator.get(mission.clientId) ?? {
        clientName: mission.client.name,
        openMissions: 0,
        totalProcesses: 0,
        confirmedPlacements: 0,
      };
      if (!NON_OPEN_MISSION_STATES.has(mission.state)) {
        entry.openMissions += 1;
      }
      entry.totalProcesses += processCountByMission.get(mission.id) ?? 0;
      entry.confirmedPlacements += placementCountByMission.get(mission.id) ?? 0;
      clientAccumulator.set(mission.clientId, entry);
    }
    const byClient = [...clientAccumulator.entries()]
      .map(([clientId, entry]) => ({ clientId, ...entry }))
      .sort(
        (a, b) =>
          b.confirmedPlacements - a.confirmedPlacements ||
          b.totalProcesses - a.totalProcesses ||
          a.clientId.localeCompare(b.clientId),
      )
      .slice(0, ReportingMaxBreakdownEntries);

    // Per-recruiter breakdown.
    const recruiterIds = new Set<string>([
      ...processByRecruiter.map((group) => group.responsibleRecruiterUserId),
      ...activeProcessByRecruiter.map((group) => group.responsibleRecruiterUserId),
      ...placementCountByRecruiter.keys(),
    ]);
    const recruiterUsers = await this.prisma.user.findMany({
      where: { id: { in: [...recruiterIds] } },
      select: { id: true, displayName: true },
    });
    const recruiterNameById = new Map(recruiterUsers.map((user) => [user.id, user.displayName]));
    const activeByRecruiter = new Map(
      activeProcessByRecruiter.map((group) => [
        group.responsibleRecruiterUserId,
        group._count._all,
      ]),
    );
    const byRecruiter = [...recruiterIds]
      .map((recruiterUserId) => ({
        recruiterUserId,
        recruiterDisplayName: recruiterNameById.get(recruiterUserId) ?? 'Unknown',
        activeProcesses: activeByRecruiter.get(recruiterUserId) ?? 0,
        confirmedPlacements: placementCountByRecruiter.get(recruiterUserId) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.confirmedPlacements - a.confirmedPlacements ||
          b.activeProcesses - a.activeProcesses ||
          a.recruiterUserId.localeCompare(b.recruiterUserId),
      )
      .slice(0, ReportingMaxBreakdownEntries);

    return {
      window: this.toWindow(window),
      scope: await this.toScope(scope),
      filters: this.toAppliedFilters(filters),
      byClient,
      byMission,
      byRecruiter,
    };
  }

  async getDrilldown(
    query: ReportingDrilldownQuery,
    actorUserId: string,
  ): Promise<ReportingDrilldownResponse> {
    const scope = await this.resolveScope(actorUserId);
    const filters = this.resolveFilters(query);
    const window = this.resolveWindow(query.start, query.end);
    const where: Prisma.MissionCandidateWhereInput = {
      ...this.processWhere(scope, filters),
      createdAt: { gte: window.start, lte: window.end },
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.missionCandidate.count({ where }),
      this.prisma.missionCandidate.findMany({
        where,
        select: drilldownSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      window: this.toWindow(window),
      scope: await this.toScope(scope),
      filters: this.toAppliedFilters(filters),
      rows: rows.map((row) => this.toDrilldownRow(row)),
      pageInfo: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasNextPage: query.page * query.pageSize < total,
      },
    };
  }

  // Returns the ordered drilldown rows for CSV export. Never silently truncates: it
  // fetches one row beyond maxRows and rejects the whole export when more rows match,
  // so the caller can never receive an apparently complete but incomplete CSV.
  async getDrilldownRowsForExport(
    query: ReportingFilterQuery,
    actorUserId: string,
    maxRows: number,
  ): Promise<{ rows: ReportingDrilldownResponse['rows']; window: ReportingWindow }> {
    const scope = await this.resolveScope(actorUserId);
    const filters = this.resolveFilters(query);
    const window = this.resolveWindow(query.start, query.end);
    const rows = await this.prisma.missionCandidate.findMany({
      where: {
        ...this.processWhere(scope, filters),
        createdAt: { gte: window.start, lte: window.end },
      },
      select: drilldownSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: maxRows + 1,
    });
    if (rows.length > maxRows) {
      throw badRequest(
        'REPORTING_EXPORT_TOO_LARGE',
        `Reporting export matches more than ${maxRows} rows. Narrow the reporting filters (date range, client, mission, recruiter, or status) and try again.`,
      );
    }
    return { rows: rows.map((row) => this.toDrilldownRow(row)), window: this.toWindow(window) };
  }

  private async resolveScope(actorUserId: string): Promise<ResolvedScope> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    const broad = permissions.includes(REPORTING_BROAD_SCOPE_PERMISSION);
    return { kind: broad ? 'broad' : 'assigned', broad, actorUserId };
  }

  private resolveFilters(query: ReportingFilterQuery): ResolvedFilters {
    return {
      clientId: query.clientId,
      missionId: query.missionId,
      recruiterUserId: query.recruiterUserId,
      pipelineState: query.pipelineState,
      offerStatus: query.offerStatus,
      placementStatus: query.placementStatus,
      source: query.source,
    };
  }

  private resolveWindow(start?: string, end?: string): ResolvedWindow {
    const endDate = end ? new Date(end) : new Date();
    const startDate = start
      ? new Date(start)
      : new Date(endDate.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw badRequest('INVALID_REPORTING_RANGE', 'Reporting date range is invalid.');
    }
    if (startDate.getTime() > endDate.getTime()) {
      throw badRequest('INVALID_REPORTING_RANGE', 'Reporting start must not be after end.');
    }
    if (endDate.getTime() - startDate.getTime() > ReportingMaxWindowDays * DAY_MS) {
      throw badRequest(
        'REPORTING_RANGE_TOO_LARGE',
        `Reporting window must not exceed ${ReportingMaxWindowDays} days.`,
      );
    }
    return { start: startDate, end: endDate };
  }

  // Mission-level scope + identity filters (client, mission, recruiter assignment).
  private missionWhere(
    scope: ResolvedScope,
    filters: ResolvedFilters,
  ): Prisma.RecruitmentMissionWhereInput {
    const and: Prisma.RecruitmentMissionWhereInput[] = [];
    if (!scope.broad) {
      and.push({
        recruiters: {
          some: {
            userId: scope.actorUserId,
            status: AssignmentStatus.ACTIVE,
            archivedAt: null,
          },
        },
      });
    }
    if (filters.clientId) {
      and.push({ clientId: filters.clientId });
    }
    if (filters.missionId) {
      and.push({ id: filters.missionId });
    }
    if (filters.recruiterUserId) {
      and.push({
        recruiters: {
          some: {
            userId: filters.recruiterUserId,
            status: AssignmentStatus.ACTIVE,
            archivedAt: null,
          },
        },
      });
    }
    return and.length > 0 ? { AND: and } : {};
  }

  // Mission-level scope without the recruiter-assignment filter. Child metrics apply
  // the recruiter filter at the process level (responsibleRecruiterUserId) instead.
  private missionScopeWhere(
    scope: ResolvedScope,
    filters: ResolvedFilters,
  ): Prisma.RecruitmentMissionWhereInput {
    return this.missionWhere(scope, { clientId: filters.clientId, missionId: filters.missionId });
  }

  // Canonical process-level filter. It encodes mission scope plus every accepted
  // process-scope filter so that all process-derived datasets (pipeline, drilldown,
  // export, interviews, offers, placements, applications, and trends) compose the
  // same filters. `offerStatus` constrains by the process's authoritative CURRENT
  // offer version; `placementStatus` constrains by the process's MissionPlacement.
  private processWhere(
    scope: ResolvedScope,
    filters: ResolvedFilters,
    options: { skipOfferStatus?: boolean; skipPlacementStatus?: boolean } = {},
  ): Prisma.MissionCandidateWhereInput {
    return {
      mission: this.missionScopeWhere(scope, filters),
      ...(filters.recruiterUserId ? { responsibleRecruiterUserId: filters.recruiterUserId } : {}),
      ...(filters.pipelineState ? { state: filters.pipelineState } : {}),
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.offerStatus && !options.skipOfferStatus
        ? { offerVersions: { some: { isCurrent: true, status: filters.offerStatus } } }
        : {}),
      ...(filters.placementStatus && !options.skipPlacementStatus
        ? { placement: { status: filters.placementStatus } }
        : {}),
    };
  }

  private interviewWhere(
    scope: ResolvedScope,
    filters: ResolvedFilters,
  ): Prisma.InterviewWhereInput {
    return { missionCandidate: this.processWhere(scope, filters) };
  }

  // Offer distribution counts each process's current offer version. Routing through
  // processWhere applies every accepted filter (including offerStatus via the current
  // version) so the distribution narrows truthfully.
  private offerWhere(
    scope: ResolvedScope,
    filters: ResolvedFilters,
  ): Prisma.RecruitmentOfferVersionWhereInput {
    return {
      isCurrent: true,
      missionCandidate: this.processWhere(scope, filters),
    };
  }

  private placementWhere(
    scope: ResolvedScope,
    filters: ResolvedFilters,
    forceStatus?: PlacementStatus,
  ): Prisma.MissionPlacementWhereInput {
    // When a status is forced (e.g. breakdown "confirmed placements"), the fixed
    // status governs and the placementStatus filter is skipped to avoid conflicts.
    return {
      missionCandidate: this.processWhere(scope, filters, {
        skipPlacementStatus: forceStatus !== undefined,
      }),
      ...(forceStatus ? { status: forceStatus } : {}),
    };
  }

  private buildBuckets(window: ResolvedWindow, interval: 'day' | 'week'): Date[] {
    const stepMs = interval === 'week' ? 7 * DAY_MS : DAY_MS;
    const buckets: Date[] = [];
    // Align the first bucket to the UTC start of day of the window start.
    const start = new Date(
      Date.UTC(
        window.start.getUTCFullYear(),
        window.start.getUTCMonth(),
        window.start.getUTCDate(),
      ),
    );
    for (
      let time = start.getTime();
      time <= window.end.getTime() && buckets.length < 366;
      time += stepMs
    ) {
      buckets.push(new Date(time));
    }
    if (buckets.length === 0) {
      buckets.push(start);
    }
    return buckets;
  }

  private bucketize(buckets: Date[], timestamps: Date[]): { bucketStart: string; count: number }[] {
    const counts = new Array<number>(buckets.length).fill(0);
    const boundaries = buckets.map((bucket) => bucket.getTime());
    for (const timestamp of timestamps) {
      const time = timestamp.getTime();
      let index = 0;
      for (let candidate = 0; candidate < boundaries.length; candidate += 1) {
        if (time >= boundaries[candidate]!) {
          index = candidate;
        } else {
          break;
        }
      }
      counts[index] = (counts[index] ?? 0) + 1;
    }
    return buckets.map((bucket, index) => ({
      bucketStart: bucket.toISOString(),
      count: counts[index] ?? 0,
    }));
  }

  private toDistribution(entries: [string, number][]): ReportingDistributionEntry[] {
    return entries
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  private async toScope(scope: ResolvedScope): Promise<ReportingScope> {
    const authorizedMissionCount = await this.prisma.recruitmentMission.count({
      where: this.missionScopeWhere(scope, {}),
    });
    return { kind: scope.kind, authorizedMissionCount };
  }

  private toWindow(window: ResolvedWindow): ReportingWindow {
    return { start: window.start.toISOString(), end: window.end.toISOString() };
  }

  private toAppliedFilters(filters: ResolvedFilters): ReportingAppliedFilters {
    return {
      clientId: filters.clientId ?? null,
      missionId: filters.missionId ?? null,
      recruiterUserId: filters.recruiterUserId ?? null,
      pipelineState: filters.pipelineState ?? null,
      offerStatus: filters.offerStatus ?? null,
      placementStatus: filters.placementStatus ?? null,
      source: filters.source ?? null,
    };
  }

  private toDrilldownRow(
    row: Prisma.MissionCandidateGetPayload<{ select: typeof drilldownSelect }>,
  ): ReportingDrilldownResponse['rows'][number] {
    return {
      processId: row.id,
      missionId: row.missionId,
      missionTitle: row.mission.title,
      clientId: row.mission.clientId,
      clientName: row.mission.client.name,
      candidateId: row.candidateId,
      candidateDisplayName: row.candidate.displayName,
      pipelineState: row.state,
      responsibleRecruiterUserId: row.responsibleRecruiterUserId,
      responsibleRecruiterDisplayName: row.responsibleRecruiter.displayName,
      source: row.source,
      clientVisible: row.clientVisible,
      presentedAt: row.presentedAt ? row.presentedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function interviewTotals(
  groups: { status: InterviewStatus; _count: { _all: number } }[],
  status: InterviewStatus,
): number {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}

const drilldownSelect = {
  id: true,
  missionId: true,
  candidateId: true,
  responsibleRecruiterUserId: true,
  state: true,
  source: true,
  clientVisible: true,
  presentedAt: true,
  createdAt: true,
  updatedAt: true,
  mission: { select: { title: true, clientId: true, client: { select: { name: true } } } },
  candidate: { select: { displayName: true } },
  responsibleRecruiter: { select: { displayName: true } },
} satisfies Prisma.MissionCandidateSelect;
