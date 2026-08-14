import { Inject, Injectable } from '@nestjs/common';
import type {
  OfferCreateRequest,
  OfferDetailResponse,
  OfferListResponse,
  OfferMarkSentRequest,
  OfferResponseRequest,
  OfferReviseRequest,
  OfferWithdrawRequest,
  PlacementConfirmRequest,
  PlacementCorrectRequest,
  PlacementDetailResponse,
} from '@hire-me/contracts';

import { MissionAuditService } from './mission-audit.service.js';
import { conflict, forbidden, notFound } from './mission.errors.js';
import { MISSION_PERMISSIONS } from './mission-permissions.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
  CandidateStatus,
  MissionCandidateEventAction,
  MissionCandidateState,
  OfferEventAction,
  OfferStatus,
  PlacementEventAction,
  PlacementStatus,
  Prisma,
  RecruitmentMissionState,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type PrismaTransaction = Prisma.TransactionClient;
type OfferRecord = Prisma.RecruitmentOfferGetPayload<{ include: typeof offerInclude }>;
type OfferVersionRecord = Prisma.RecruitmentOfferVersionGetPayload<Record<string, never>>;
type PlacementRecord = Prisma.MissionPlacementGetPayload<{ include: typeof placementInclude }>;
type LockedProcess = Prisma.MissionCandidateGetPayload<Record<string, never>>;
type LockedMission = Prisma.RecruitmentMissionGetPayload<Record<string, never>>;

type OfferAccess = {
  view: boolean;
  create: boolean;
  update: boolean;
  send: boolean;
  recordResponse: boolean;
  withdraw: boolean;
  placementView: boolean;
  placementConfirm: boolean;
  placementCorrect: boolean;
  commercialEligibilityView: boolean;
};

const terminalMissionStates = new Set<RecruitmentMissionState>([
  RecruitmentMissionState.CLOSED_WITH_RECRUITMENT,
  RecruitmentMissionState.CLOSED_WITHOUT_RECRUITMENT,
  RecruitmentMissionState.DEADLINE_EXPIRED_WITHOUT_RENEWAL,
  RecruitmentMissionState.CANCELED,
  RecruitmentMissionState.ARCHIVED,
]);

const terminalProcessStates = new Set<MissionCandidateState>([
  MissionCandidateState.CANDIDATE_REJECTED,
  MissionCandidateState.CLIENT_REJECTED,
  MissionCandidateState.WITHDRAWN,
  MissionCandidateState.TALENT_POOL,
  MissionCandidateState.PROCESS_COMPLETED,
]);

const offerEligibleProcessStates = new Set<MissionCandidateState>([
  MissionCandidateState.CLIENT_OFFER,
  MissionCandidateState.ACCEPTED,
  MissionCandidateState.INTEGRATED,
  MissionCandidateState.PROBATION_COMPLETED,
]);

const allowedOfferTransitions = new Map<OfferStatus, Set<OfferStatus>>([
  [OfferStatus.DRAFT, new Set([OfferStatus.SENT, OfferStatus.WITHDRAWN, OfferStatus.ARCHIVED])],
  [
    OfferStatus.SENT,
    new Set([
      OfferStatus.NEGOTIATING,
      OfferStatus.ACCEPTED,
      OfferStatus.REJECTED,
      OfferStatus.EXPIRED,
      OfferStatus.WITHDRAWN,
    ]),
  ],
  [
    OfferStatus.NEGOTIATING,
    new Set([
      OfferStatus.ACCEPTED,
      OfferStatus.REJECTED,
      OfferStatus.EXPIRED,
      OfferStatus.WITHDRAWN,
    ]),
  ],
  [OfferStatus.ACCEPTED, new Set([OfferStatus.WITHDRAWN])],
  [OfferStatus.REJECTED, new Set([OfferStatus.ARCHIVED])],
  [OfferStatus.EXPIRED, new Set([OfferStatus.ARCHIVED])],
  [OfferStatus.WITHDRAWN, new Set([OfferStatus.ARCHIVED])],
]);

@Injectable()
export class MissionOffersService {
  constructor(
    @Inject(MissionAuditService) private readonly audit: MissionAuditService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async getOffer(
    missionId: string,
    processId: string,
    actorUserId: string,
  ): Promise<OfferListResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.view, 'offers:view', 'OFFERS_VIEW_REQUIRED');
    await this.assertMissionProcessScope(missionId, processId, actorUserId);
    const offer = await this.findOffer(missionId, processId);
    return { offer: offer ? this.toOffer(offer) : null };
  }

  async createOffer(
    missionId: string,
    processId: string,
    input: OfferCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<OfferDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.create, 'offers:create', 'OFFERS_CREATE_REQUIRED');
    const offer = await this.withWritableProcessLock(
      missionId,
      processId,
      async (tx, _mission, process) => {
        this.assertOfferEligibleProcessState(process.state);
        const existingOffer = await tx.recruitmentOffer.findUnique({
          where: { missionCandidateId: processId },
        });
        if (existingOffer) {
          throw conflict('OFFER_ALREADY_EXISTS', 'This process already has an offer aggregate.');
        }
        const createdOffer = await tx.recruitmentOffer.create({
          data: { missionId, missionCandidateId: processId, createdByUserId: actorUserId },
        });
        const version = await tx.recruitmentOfferVersion.create({
          data: {
            ...this.offerVersionData(input),
            offerId: createdOffer.id,
            missionId,
            missionCandidateId: processId,
            versionNumber: 1,
            status: OfferStatus.DRAFT,
            isCurrent: true,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
          },
        });
        await this.createOfferEvent(tx, {
          offerId: createdOffer.id,
          offerVersionId: version.id,
          actorUserId,
          action: OfferEventAction.CREATED,
          nextStatus: OfferStatus.DRAFT,
          nextVersionId: version.id,
        });
        return this.requireOffer(tx, createdOffer.id);
      },
    );
    await this.audit.record('offers.created', context, {
      actorUserId,
      entityType: 'RecruitmentOffer',
      entityId: offer.id,
      metadataSummary: 'Offer draft created for mission candidate process.',
    });
    return { offer: this.toOffer(offer) };
  }

  async reviseOffer(
    missionId: string,
    processId: string,
    versionId: string,
    input: OfferReviseRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<OfferDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.update, 'offers:update', 'OFFERS_UPDATE_REQUIRED');
    const offer = await this.withOfferLock(missionId, processId, versionId, async (tx, current) => {
      this.assertCurrentOfferVersion(current);
      const maxVersion = await tx.recruitmentOfferVersion.aggregate({
        where: { offerId: current.offerId },
        _max: { versionNumber: true },
      });
      await tx.recruitmentOfferVersion.updateMany({
        where: { offerId: current.offerId, isCurrent: true },
        data: { isCurrent: false },
      });
      const next = await tx.recruitmentOfferVersion.create({
        data: {
          ...this.offerVersionData(input),
          offerId: current.offerId,
          missionId,
          missionCandidateId: processId,
          versionNumber: (maxVersion._max.versionNumber ?? 0) + 1,
          status: OfferStatus.DRAFT,
          isCurrent: true,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        },
      });
      await tx.recruitmentOffer.update({
        where: { id: current.offerId },
        data: { updatedByUserId: actorUserId },
      });
      await this.createOfferEvent(tx, {
        offerId: current.offerId,
        offerVersionId: next.id,
        actorUserId,
        action: OfferEventAction.REVISED,
        previousStatus: current.status,
        nextStatus: OfferStatus.DRAFT,
        previousVersionId: current.id,
        nextVersionId: next.id,
        reason: input.reason,
      });
      return this.requireOffer(tx, current.offerId);
    });
    await this.audit.record('offers.revised', context, {
      actorUserId,
      entityType: 'RecruitmentOffer',
      entityId: offer.id,
      metadataSummary: 'Offer revised into a new immutable version.',
    });
    return { offer: this.toOffer(offer) };
  }

  async markSent(
    missionId: string,
    processId: string,
    versionId: string,
    input: OfferMarkSentRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<OfferDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.send, 'offers:send_or_mark_sent', 'OFFERS_SEND_REQUIRED');
    const { offer, changed } = await this.updateOfferStatus({
      missionId,
      processId,
      versionId,
      nextStatus: OfferStatus.SENT,
      actorUserId,
      reason: input.reason,
      action: OfferEventAction.MARKED_SENT,
      data: { sentAt: new Date(), sentByUserId: actorUserId },
    });
    if (changed) {
      await this.audit.record('offers.marked_sent', context, {
        actorUserId,
        entityType: 'RecruitmentOffer',
        entityId: offer.id,
        metadataSummary: 'Offer version marked as sent.',
      });
    }
    return { offer: this.toOffer(offer) };
  }

  async recordResponse(
    missionId: string,
    processId: string,
    versionId: string,
    input: OfferResponseRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<OfferDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(
      access.recordResponse,
      'offers:record_response',
      'OFFERS_RECORD_RESPONSE_REQUIRED',
    );
    const nextStatus = input.status as OfferStatus;
    const { offer, changed } = await this.updateOfferStatus({
      missionId,
      processId,
      versionId,
      nextStatus,
      actorUserId,
      reason: input.reason,
      safeComment: input.comment,
      action:
        nextStatus === OfferStatus.EXPIRED
          ? OfferEventAction.EXPIRED
          : OfferEventAction.RESPONSE_RECORDED,
      data: {
        responseRecordedAt: new Date(),
        responseRecordedByUserId: actorUserId,
        responseReason: input.reason,
        ...(nextStatus === OfferStatus.EXPIRED ? { expiredAt: new Date() } : {}),
      },
    });
    if (changed) {
      await this.audit.record('offers.response_recorded', context, {
        actorUserId,
        entityType: 'RecruitmentOffer',
        entityId: offer.id,
        metadataSummary: 'Offer response recorded by staff.',
      });
    }
    return { offer: this.toOffer(offer) };
  }

  async withdrawOffer(
    missionId: string,
    processId: string,
    versionId: string,
    input: OfferWithdrawRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<OfferDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.withdraw, 'offers:withdraw', 'OFFERS_WITHDRAW_REQUIRED');
    const { offer, changed } = await this.updateOfferStatus({
      missionId,
      processId,
      versionId,
      nextStatus: OfferStatus.WITHDRAWN,
      actorUserId,
      reason: input.reason,
      action: OfferEventAction.WITHDRAWN,
      data: {
        withdrawnAt: new Date(),
        withdrawnByUserId: actorUserId,
        withdrawalReason: input.reason,
      },
    });
    if (changed) {
      await this.audit.record('offers.withdrawn', context, {
        actorUserId,
        entityType: 'RecruitmentOffer',
        entityId: offer.id,
        metadataSummary: 'Offer version withdrawn by staff.',
      });
    }
    return { offer: this.toOffer(offer) };
  }

  async getPlacement(
    missionId: string,
    processId: string,
    actorUserId: string,
  ): Promise<PlacementDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(access.placementView, 'placements:view', 'PLACEMENTS_VIEW_REQUIRED');
    await this.assertMissionProcessScope(missionId, processId, actorUserId);
    const placement = await this.prisma.missionPlacement.findUnique({
      where: { missionCandidateId: processId },
      include: placementInclude,
    });
    return {
      placement: placement
        ? this.toPlacement(placement, access, await this.closureEligible(missionId))
        : null,
    };
  }

  async confirmPlacement(
    missionId: string,
    processId: string,
    versionId: string,
    input: PlacementConfirmRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PlacementDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(
      access.placementConfirm,
      'placements:confirm',
      'PLACEMENTS_CONFIRM_REQUIRED',
    );
    const { placement, changed, closureEligible } = await this.withOfferLock(
      missionId,
      processId,
      versionId,
      async (tx, offerVersion, mission, process) => {
        if (offerVersion.status !== OfferStatus.ACCEPTED || !offerVersion.isCurrent) {
          throw conflict(
            'PLACEMENT_ACCEPTED_CURRENT_OFFER_REQUIRED',
            'Placement confirmation requires the current accepted offer version.',
          );
        }
        const existing = await tx.missionPlacement.findUnique({
          where: { missionCandidateId: processId },
          include: placementInclude,
        });
        if (existing) {
          return {
            placement: existing,
            changed: false,
            closureEligible: mission.filledPlacementCount >= mission.numberOfPositions,
          };
        }
        const updatedMission = await tx.recruitmentMission.update({
          where: { id: missionId },
          data: { filledPlacementCount: { increment: 1 } },
        });
        const placement = await tx.missionPlacement.create({
          data: {
            missionId,
            missionCandidateId: processId,
            offerVersionId: versionId,
            integrationStartDate: new Date(input.integrationStartDate),
            confirmedByUserId: actorUserId,
            operationalNote: input.operationalNote,
            eligibleForInvoicing: input.eligibleForInvoicing,
            invoicingEligibleAt: input.eligibleForInvoicing ? new Date() : null,
            commercialEligibilityByUserId: input.eligibleForInvoicing ? actorUserId : null,
          },
          include: placementInclude,
        });
        await tx.missionCandidate.update({
          where: { id: processId },
          data: {
            state: MissionCandidateState.INTEGRATED,
            placementConfirmedAt: placement.confirmedAt,
            placementConfirmedByUserId: actorUserId,
          },
        });
        await tx.missionCandidateEvent.create({
          data: {
            missionCandidateId: processId,
            actorUserId,
            action: MissionCandidateEventAction.INTEGRATION_CONFIRMED,
            previousState: process.state,
            nextState: MissionCandidateState.INTEGRATED,
            reason: 'Offer-backed placement confirmation.',
          },
        });
        await tx.placementEvent.create({
          data: {
            placementId: placement.id,
            actorUserId,
            action: PlacementEventAction.CONFIRMED,
            nextStatus: PlacementStatus.CONFIRMED,
            safeComment: 'Placement confirmed from accepted offer.',
          },
        });
        if (input.eligibleForInvoicing) {
          await tx.placementEvent.create({
            data: {
              placementId: placement.id,
              actorUserId,
              action: PlacementEventAction.COMMERCIAL_ELIGIBILITY_CREATED,
              nextStatus: PlacementStatus.CONFIRMED,
              safeComment: 'Placement marked eligible for later invoicing.',
            },
          });
        }
        return {
          placement,
          changed: true,
          closureEligible: updatedMission.filledPlacementCount >= updatedMission.numberOfPositions,
        };
      },
    );
    if (changed) {
      await this.audit.record('placements.confirmed', context, {
        actorUserId,
        entityType: 'MissionPlacement',
        entityId: placement.id,
        metadataSummary: 'Placement confirmed from current accepted offer.',
      });
      if (placement.eligibleForInvoicing) {
        await this.audit.record('placements.commercial_eligibility.created', context, {
          actorUserId,
          entityType: 'MissionPlacement',
          entityId: placement.id,
          metadataSummary: 'Placement marked eligible for later invoicing.',
        });
      }
    }
    return { placement: this.toPlacement(placement, access, closureEligible) };
  }

  async correctPlacement(
    missionId: string,
    processId: string,
    input: PlacementCorrectRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<PlacementDetailResponse> {
    const access = await this.resolveAccess(actorUserId);
    this.assertPermission(
      access.placementCorrect,
      'placements:correct',
      'PLACEMENTS_CORRECT_REQUIRED',
    );
    const { placement, changed, closureEligible, commercialEligibilityRemoved } =
      await this.withWritableProcessLock(missionId, processId, async (tx) => {
        const existing = await tx.missionPlacement.findUnique({
          where: { missionCandidateId: processId },
          include: placementInclude,
        });
        if (!existing) {
          throw conflict(
            'PLACEMENT_NOT_CONFIRMED',
            'Placement must be confirmed before correction.',
          );
        }
        await tx.$queryRaw`SELECT id FROM "MissionPlacement" WHERE id = ${existing.id}::uuid FOR UPDATE`;
        if (existing.status === PlacementStatus.CORRECTED) {
          return {
            placement: existing,
            changed: false,
            commercialEligibilityRemoved: false,
            closureEligible: await this.closureEligibleInTransaction(tx, missionId),
          };
        }
        const mission = await tx.recruitmentMission.findUniqueOrThrow({ where: { id: missionId } });
        if (mission.filledPlacementCount <= 0) {
          throw conflict(
            'PLACEMENT_COUNT_NEGATIVE',
            'Placement correction cannot make count negative.',
          );
        }
        const updatedMission = await tx.recruitmentMission.update({
          where: { id: missionId },
          data: { filledPlacementCount: { decrement: 1 } },
        });
        const corrected = await tx.missionPlacement.update({
          where: { id: existing.id },
          data: {
            status: PlacementStatus.CORRECTED,
            correctedAt: new Date(),
            correctedByUserId: actorUserId,
            correctionReason: input.reason,
            correctionComment: input.comment,
            eligibleForInvoicing: false,
            invoicingEligibleAt: null,
            commercialEligibilityByUserId: null,
          },
          include: placementInclude,
        });
        await tx.placementEvent.create({
          data: {
            placementId: existing.id,
            actorUserId,
            action: PlacementEventAction.CORRECTED,
            previousStatus: PlacementStatus.CONFIRMED,
            nextStatus: PlacementStatus.CORRECTED,
            reason: input.reason,
            safeComment: 'Placement correction recorded.',
          },
        });
        if (existing.eligibleForInvoicing) {
          await tx.placementEvent.create({
            data: {
              placementId: existing.id,
              actorUserId,
              action: PlacementEventAction.COMMERCIAL_ELIGIBILITY_REMOVED,
              previousStatus: PlacementStatus.CONFIRMED,
              nextStatus: PlacementStatus.CORRECTED,
              reason: input.reason,
              safeComment: 'Commercial eligibility removed after placement correction.',
            },
          });
        }
        return {
          placement: corrected,
          changed: true,
          commercialEligibilityRemoved: existing.eligibleForInvoicing,
          closureEligible: updatedMission.filledPlacementCount >= updatedMission.numberOfPositions,
        };
      });
    if (changed) {
      await this.audit.record('placements.corrected', context, {
        actorUserId,
        entityType: 'MissionPlacement',
        entityId: placement.id,
        metadataSummary: 'Placement correction recorded with preserved original confirmation.',
      });
      if (commercialEligibilityRemoved) {
        await this.audit.record('placements.commercial_eligibility.removed', context, {
          actorUserId,
          entityType: 'MissionPlacement',
          entityId: placement.id,
          metadataSummary: 'Placement commercial eligibility removed after correction.',
        });
      }
    }
    return { placement: this.toPlacement(placement, access, closureEligible) };
  }

  private async updateOfferStatus(options: {
    missionId: string;
    processId: string;
    versionId: string;
    nextStatus: OfferStatus;
    actorUserId: string;
    reason?: string;
    safeComment?: string;
    action: OfferEventAction;
    data: Prisma.RecruitmentOfferVersionUncheckedUpdateInput;
  }): Promise<{ offer: OfferRecord; changed: boolean }> {
    return this.withOfferLock(
      options.missionId,
      options.processId,
      options.versionId,
      async (tx, current) => {
        this.assertCurrentOfferVersion(current);
        if (current.status === options.nextStatus) {
          return { offer: await this.requireOffer(tx, current.offerId), changed: false };
        }
        this.assertOfferTransition(current.status, options.nextStatus);
        const updated = await tx.recruitmentOfferVersion.update({
          where: { id: options.versionId },
          data: {
            ...options.data,
            status: options.nextStatus,
            updatedByUserId: options.actorUserId,
          },
        });
        await this.createOfferEvent(tx, {
          offerId: current.offerId,
          offerVersionId: updated.id,
          actorUserId: options.actorUserId,
          action: options.action,
          previousStatus: current.status,
          nextStatus: updated.status,
          previousVersionId: current.id,
          nextVersionId: updated.id,
          reason: options.reason,
          safeComment: options.safeComment,
        });
        return { offer: await this.requireOffer(tx, current.offerId), changed: true };
      },
    );
  }

  private async withOfferLock<T>(
    missionId: string,
    processId: string,
    versionId: string,
    callback: (
      tx: PrismaTransaction,
      offerVersion: OfferVersionRecord,
      mission: LockedMission,
      process: LockedProcess,
    ) => Promise<T>,
  ): Promise<T> {
    return this.withWritableProcessLock(missionId, processId, async (tx, mission, process) => {
      const offer = await tx.recruitmentOffer.findUnique({
        where: { missionCandidateId: processId },
      });
      if (!offer || offer.missionId !== missionId || offer.archivedAt) {
        throw notFound('OFFER_NOT_FOUND', 'Offer was not found for this process.');
      }
      await tx.$queryRaw`SELECT id FROM "RecruitmentOffer" WHERE id = ${offer.id}::uuid FOR UPDATE`;
      const offerVersion = await tx.recruitmentOfferVersion.findFirst({
        where: { id: versionId, offerId: offer.id, missionId, missionCandidateId: processId },
      });
      if (!offerVersion || offerVersion.archivedAt) {
        throw notFound('OFFER_VERSION_NOT_FOUND', 'Offer version was not found for this process.');
      }
      await tx.$queryRaw`SELECT id FROM "RecruitmentOfferVersion" WHERE id = ${versionId}::uuid FOR UPDATE`;
      return callback(tx, offerVersion, mission, process);
    });
  }

  private async withWritableProcessLock<T>(
    missionId: string,
    processId: string,
    callback: (tx: PrismaTransaction, mission: LockedMission, process: LockedProcess) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RecruitmentMission" WHERE id = ${missionId}::uuid FOR UPDATE`;
      const mission = await tx.recruitmentMission.findUnique({ where: { id: missionId } });
      if (!mission) {
        throw notFound('MISSION_NOT_FOUND', 'Recruitment mission was not found.');
      }
      if (terminalMissionStates.has(mission.state) || mission.archivedAt) {
        throw conflict('MISSION_TERMINAL', 'Terminal recruitment missions cannot be changed.');
      }
      await tx.$queryRaw`SELECT id FROM "MissionCandidate" WHERE id = ${processId}::uuid AND "missionId" = ${missionId}::uuid FOR UPDATE`;
      const process = await tx.missionCandidate.findFirst({
        where: { id: processId, missionId },
      });
      if (!process) {
        throw notFound('MISSION_CANDIDATE_NOT_FOUND', 'Mission candidate process was not found.');
      }
      if (terminalProcessStates.has(process.state) || process.archivedAt) {
        throw conflict(
          'MISSION_CANDIDATE_TERMINAL',
          'Terminal mission candidate processes cannot be changed.',
        );
      }
      await tx.$queryRaw`SELECT id FROM "Candidate" WHERE id = ${process.candidateId}::uuid FOR UPDATE`;
      const candidate = await tx.candidate.findUnique({ where: { id: process.candidateId } });
      if (!candidate || candidate.status === CandidateStatus.ARCHIVED || candidate.archivedAt) {
        throw conflict('CANDIDATE_ARCHIVED', 'Archived candidates cannot be changed in missions.');
      }
      return callback(tx, mission, process);
    });
  }

  private async assertMissionProcessScope(
    missionId: string,
    processId: string,
    actorUserId: string,
  ): Promise<void> {
    const process = await this.prisma.missionCandidate.findFirst({
      where: { id: processId, missionId },
    });
    if (!process) {
      throw notFound('MISSION_CANDIDATE_NOT_FOUND', 'Mission candidate process was not found.');
    }
    const assignment = await this.prisma.missionRecruiter.findFirst({
      where: { missionId, userId: actorUserId, status: 'ACTIVE', archivedAt: null },
    });
    if (!assignment) {
      throw forbidden(
        'MISSION_SCOPE_REQUIRED',
        'This mission candidate is outside the actor scope.',
      );
    }
  }

  private async resolveAccess(actorUserId: string): Promise<OfferAccess> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    return {
      view: permissions.includes(MISSION_PERMISSIONS.OFFERS_VIEW),
      create: permissions.includes(MISSION_PERMISSIONS.OFFERS_CREATE),
      update: permissions.includes(MISSION_PERMISSIONS.OFFERS_UPDATE),
      send: permissions.includes(MISSION_PERMISSIONS.OFFERS_SEND_OR_MARK_SENT),
      recordResponse: permissions.includes(MISSION_PERMISSIONS.OFFERS_RECORD_RESPONSE),
      withdraw: permissions.includes(MISSION_PERMISSIONS.OFFERS_WITHDRAW),
      placementView: permissions.includes(MISSION_PERMISSIONS.PLACEMENTS_VIEW),
      placementConfirm: permissions.includes(MISSION_PERMISSIONS.PLACEMENTS_CONFIRM),
      placementCorrect: permissions.includes(MISSION_PERMISSIONS.PLACEMENTS_CORRECT),
      commercialEligibilityView: permissions.includes(
        MISSION_PERMISSIONS.PLACEMENT_COMMERCIAL_ELIGIBILITY_VIEW,
      ),
    };
  }

  private assertPermission(granted: boolean, permission: string, code: string): void {
    if (!granted) {
      throw forbidden(code, `This action requires ${permission}.`);
    }
  }

  private assertOfferTransition(from: OfferStatus, to: OfferStatus): void {
    if (!allowedOfferTransitions.get(from)?.has(to)) {
      throw conflict('OFFER_INVALID_TRANSITION', 'Offer lifecycle transition is not allowed.');
    }
  }

  private assertOfferEligibleProcessState(state: MissionCandidateState): void {
    if (!offerEligibleProcessStates.has(state)) {
      throw conflict(
        'OFFER_PROCESS_STATE_REQUIRED',
        'Offer creation requires the candidate process to be in the offer stage.',
      );
    }
  }

  private assertCurrentOfferVersion(version: OfferVersionRecord): void {
    if (!version.isCurrent) {
      throw conflict(
        'OFFER_CURRENT_VERSION_REQUIRED',
        'Offer action requires the current offer version.',
      );
    }
  }

  private offerVersionData(
    input: OfferCreateRequest,
  ): Pick<
    Prisma.RecruitmentOfferVersionUncheckedCreateInput,
    | 'offeredSalaryAmountCents'
    | 'offeredSalaryCurrency'
    | 'contractType'
    | 'proposedStartDate'
    | 'probationPeriod'
    | 'bonuses'
    | 'benefits'
    | 'allowances'
    | 'compensationNotes'
    | 'clientFacingRemarks'
    | 'internalRecruiterRemarks'
    | 'expiresAt'
  > {
    return {
      offeredSalaryAmountCents: input.offeredSalaryAmountCents,
      offeredSalaryCurrency: input.offeredSalaryCurrency,
      contractType: input.contractType,
      proposedStartDate: input.proposedStartDate ? new Date(input.proposedStartDate) : undefined,
      probationPeriod: input.probationPeriod,
      bonuses: input.bonuses,
      benefits: input.benefits,
      allowances: input.allowances,
      compensationNotes: input.compensationNotes,
      clientFacingRemarks: input.clientFacingRemarks,
      internalRecruiterRemarks: input.internalRecruiterRemarks,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    };
  }

  private async findOffer(missionId: string, processId: string): Promise<OfferRecord | null> {
    return this.prisma.recruitmentOffer.findFirst({
      where: { missionId, missionCandidateId: processId, archivedAt: null },
      include: offerInclude,
    });
  }

  private async requireOffer(tx: PrismaTransaction, offerId: string): Promise<OfferRecord> {
    return tx.recruitmentOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
  }

  private async createOfferEvent(
    tx: PrismaTransaction,
    data: Prisma.OfferEventUncheckedCreateInput,
  ): Promise<void> {
    await tx.offerEvent.create({ data });
  }

  private async closureEligible(missionId: string): Promise<boolean> {
    const mission = await this.prisma.recruitmentMission.findUniqueOrThrow({
      where: { id: missionId },
    });
    return mission.filledPlacementCount >= mission.numberOfPositions;
  }

  private async closureEligibleInTransaction(
    tx: PrismaTransaction,
    missionId: string,
  ): Promise<boolean> {
    const mission = await tx.recruitmentMission.findUniqueOrThrow({ where: { id: missionId } });
    return mission.filledPlacementCount >= mission.numberOfPositions;
  }

  private toOffer(offer: OfferRecord) {
    const current = offer.versions.find((version) => version.isCurrent && !version.archivedAt);
    return {
      id: offer.id,
      missionId: offer.missionId,
      missionCandidateId: offer.missionCandidateId,
      currentVersionId: current?.id ?? null,
      versions: offer.versions
        .sort((a, b) => b.versionNumber - a.versionNumber)
        .map((version) => ({
          id: version.id,
          offerId: version.offerId,
          missionId: version.missionId,
          missionCandidateId: version.missionCandidateId,
          versionNumber: version.versionNumber,
          status: version.status,
          isCurrent: version.isCurrent,
          offeredSalaryAmountCents: version.offeredSalaryAmountCents,
          offeredSalaryCurrency: version.offeredSalaryCurrency,
          contractType: version.contractType,
          proposedStartDate: isoOrNull(version.proposedStartDate),
          probationPeriod: version.probationPeriod,
          bonuses: version.bonuses,
          benefits: version.benefits,
          allowances: version.allowances,
          compensationNotes: version.compensationNotes,
          clientFacingRemarks: version.clientFacingRemarks,
          internalRecruiterRemarks: version.internalRecruiterRemarks,
          sentAt: isoOrNull(version.sentAt),
          responseRecordedAt: isoOrNull(version.responseRecordedAt),
          responseReason: version.responseReason,
          withdrawnAt: isoOrNull(version.withdrawnAt),
          withdrawalReason: version.withdrawalReason,
          expiresAt: isoOrNull(version.expiresAt),
          expiredAt: isoOrNull(version.expiredAt),
          archivedAt: isoOrNull(version.archivedAt),
          createdAt: version.createdAt.toISOString(),
          updatedAt: version.updatedAt.toISOString(),
        })),
      history: offer.events
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((event) => ({
          id: event.id,
          offerId: event.offerId,
          offerVersionId: event.offerVersionId,
          actorUserId: event.actorUserId,
          action: event.action,
          previousStatus: event.previousStatus,
          nextStatus: event.nextStatus,
          previousVersionId: event.previousVersionId,
          nextVersionId: event.nextVersionId,
          reason: event.reason,
          safeComment: event.safeComment,
          createdAt: event.createdAt.toISOString(),
        })),
      archivedAt: isoOrNull(offer.archivedAt),
      createdAt: offer.createdAt.toISOString(),
      updatedAt: offer.updatedAt.toISOString(),
    };
  }

  private toPlacement(placement: PlacementRecord, access: OfferAccess, closureEligible: boolean) {
    return {
      id: placement.id,
      missionId: placement.missionId,
      missionCandidateId: placement.missionCandidateId,
      offerVersionId: placement.offerVersionId,
      status: placement.status,
      integrationStartDate: placement.integrationStartDate.toISOString(),
      confirmedAt: placement.confirmedAt.toISOString(),
      confirmedByUserId: placement.confirmedByUserId,
      operationalNote: placement.operationalNote,
      eligibleForInvoicing: access.commercialEligibilityView
        ? placement.eligibleForInvoicing
        : false,
      invoicingEligibleAt: access.commercialEligibilityView
        ? isoOrNull(placement.invoicingEligibleAt)
        : null,
      correctedAt: isoOrNull(placement.correctedAt),
      correctedByUserId: placement.correctedByUserId,
      correctionReason: placement.correctionReason,
      correctionComment: placement.correctionComment,
      closureEligible,
      archivedAt: isoOrNull(placement.archivedAt),
      createdAt: placement.createdAt.toISOString(),
      updatedAt: placement.updatedAt.toISOString(),
      history: placement.events.map((event) => ({
        id: event.id,
        placementId: event.placementId,
        actorUserId: event.actorUserId,
        action: event.action,
        previousStatus: event.previousStatus,
        nextStatus: event.nextStatus,
        reason: event.reason,
        safeComment: event.safeComment,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}

const offerInclude = {
  versions: true,
  events: true,
} satisfies Prisma.RecruitmentOfferInclude;

const placementInclude = {
  events: true,
} satisfies Prisma.MissionPlacementInclude;

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
