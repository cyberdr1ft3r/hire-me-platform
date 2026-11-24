import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClientDemandFieldsSchema,
  clientPortalPermissions,
  type ClientDemandDecision,
  type ClientDemandFields,
  type ClientPublicationCommit,
  type ClientPublicationRequest,
} from '@hire-me/contracts';

import { ClientPortalAuth, clientAudit, lockClient } from './client-portal-auth.service.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PermissionsService } from '../auth/permissions.service.js';
import { MissionCandidatesService } from '../missions/mission-candidates.service.js';
import { MissionsService } from '../missions/missions.service.js';
import type { Prisma } from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

const pageSize = 20;
const history = {
  history: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30 },
} as const satisfies Prisma.ClientPortalDemandInclude;
type Demand = Prisma.ClientPortalDemandGetPayload<{ include: typeof history }>;
const publicationSelect = {
  id: true,
  demandId: true,
  title: true,
  city: true,
  country: true,
  summaryDocument: true,
  publishedAt: true,
} as const satisfies Prisma.ClientPortalPublicationSelect;
type Publication = Prisma.ClientPortalPublicationGetPayload<{ select: typeof publicationSelect }>;
const candidateConsent = {
  consentStatus: 'GRANTED',
  consentRecordedAt: { not: null },
  archivedAt: null,
  status: { in: ['ACTIVE', 'TALENT_POOL'] },
} satisfies Prisma.CandidateWhereInput;
const submitted = { status: { not: 'DRAFT' } } as const;
const closedMissions = [
  'CANCELED',
  'CLOSED_WITH_RECRUITMENT',
  'CLOSED_WITHOUT_RECRUITMENT',
  'DEADLINE_EXPIRED_WITHOUT_RENEWAL',
  'ARCHIVED',
] as const;
const shortlistStates = [
  'PRESENTED_TO_CLIENT',
  'CLIENT_INTERVIEW_1',
  'CLIENT_INTERVIEW_2',
  'CLIENT_OFFER',
  'ACCEPTED',
] as const;

function visibleDemand(member: { id: string; clientId: string }) {
  return { clientId: member.clientId, OR: [{ creatorId: member.id }, submitted] };
}

function editable(row: Demand) {
  return row.status === 'DRAFT' || row.status === 'CHANGES_REQUESTED';
}

function demandView(row: Demand, memberId?: string) {
  const own = memberId === row.creatorId;
  const draft = {
    title: row.title,
    description: row.description,
    location: row.location ?? '',
    numberOfPositions: row.numberOfPositions,
  };
  const content =
    !own && row.status === 'CHANGES_REQUESTED'
      ? ClientDemandFieldsSchema.parse(row.submittedSnapshot)
      : draft;
  return {
    ...content,
    id: row.id,
    revision: row.revision,
    status: row.status,
    editable: own && editable(row),
    updatedAt: row.updatedAt.toISOString(),
    history: row.history
      .filter((event) => own || event.status !== 'DRAFT')
      .map(({ status, reason, createdAt }) => ({
        status,
        reason,
        createdAt: createdAt.toISOString(),
      })),
  };
}

function publicationView(row: Publication) {
  return { ...row, publishedAt: row.publishedAt.toISOString() };
}

@Injectable()
export class ClientPortalWorkflow {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ClientPortalAuth) private readonly auth: ClientPortalAuth,
    @Inject(MissionsService) private readonly missions: MissionsService,
    @Inject(MissionCandidatesService) private readonly missionCandidates: MissionCandidatesService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
  ) {}

  async assertStaff(
    actorId: string,
    db: Prisma.TransactionClient = this.prisma,
    extra: readonly string[] = [],
  ) {
    const actor = await db.user.findFirst({
      where: { id: actorId, userType: 'INTERNAL', status: 'ACTIVE', archivedAt: null },
      select: { id: true },
    });
    if (!actor) throw new ForbiddenException();
    const effective = await this.permissions.getEffectivePermissionCodes(actorId, db);
    if (![...clientPortalPermissions.staff, ...extra].every((code) => effective.includes(code)))
      throw new ForbiddenException();
    return effective;
  }

  async dashboard(token: string | undefined, cursor?: string) {
    return this.prisma.$transaction(
      async (db) => {
        const member = await this.auth.requireSession(token, db);
        const organization = await db.client.findUniqueOrThrow({
          where: { id: member.clientId },
          select: { name: true, industry: true, website: true, city: true, country: true },
        });
        const where = visibleDemand(member);
        if (
          cursor &&
          !(await db.clientPortalDemand.findFirst({
            where: { ...where, id: cursor },
            select: { id: true },
          }))
        )
          throw new NotFoundException();
        const rows = await db.clientPortalDemand.findMany({
          where,
          include: history,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: pageSize + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        return {
          principal: 'CLIENT' as const,
          organization,
          demands: rows.slice(0, pageSize).map((row) => demandView(row, member.id)),
          nextCursor: rows.length > pageSize ? rows[pageSize - 1]!.id : null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async demand(token: string | undefined, id: string) {
    return this.prisma.$transaction(
      async (db) => {
        const member = await this.auth.requireSession(token, db);
        const row = await db.clientPortalDemand.findFirst({
          where: { ...visibleDemand(member), id },
          include: history,
        });
        if (!row) throw new NotFoundException();
        return demandView(row, member.id);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async saveDemand(
    token: string | undefined,
    fields: ClientDemandFields,
    current?: { id: string; revision: number },
  ) {
    return this.clientWrite(token, async (db, member) => {
      if (!current) {
        const row = await db.clientPortalDemand.create({
          data: {
            ...fields,
            clientId: member.clientId,
            creatorId: member.id,
            history: { create: { status: 'DRAFT' } },
          },
          include: history,
        });
        await clientAudit(db, row.id, 'demand.created');
        return demandView(row, member.id);
      }
      const row = await this.ownedDraft(
        db,
        member.id,
        member.clientId,
        current.id,
        current.revision,
      );
      const updated = await db.clientPortalDemand.update({
        where: { id: row.id },
        data: { ...fields, revision: { increment: 1 } },
        include: history,
      });
      await clientAudit(db, row.id, 'demand.updated');
      return demandView(updated, member.id);
    });
  }

  async submit(token: string | undefined, id: string, revision: number) {
    return this.clientWrite(token, async (db, member) => {
      const row = await this.ownedDraft(db, member.id, member.clientId, id, revision);
      const snapshot = ClientDemandFieldsSchema.parse({
        title: row.title,
        description: row.description,
        location: row.location ?? '',
        numberOfPositions: row.numberOfPositions,
      });
      const updated = await db.clientPortalDemand.update({
        where: { id },
        data: {
          status: 'SUBMITTED',
          submittedSnapshot: snapshot,
          revision: { increment: 1 },
          history: { create: { status: 'SUBMITTED' } },
        },
        include: history,
      });
      await clientAudit(db, id, 'demand.submitted');
      return demandView(updated, member.id);
    });
  }

  async staffOrganization(actorId: string, clientId: string) {
    const effective = await this.assertStaff(actorId);
    if (
      !(await this.prisma.client.findFirst({
        where: { id: clientId, status: 'ACTIVE', archivedAt: null },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    const [members, demands, publications] = await Promise.all([
      effective.includes('client_contacts:view')
        ? this.prisma.clientPortalMember.findMany({
            where: { clientId },
            select: {
              id: true,
              contactId: true,
              acceptedAt: true,
              revokedAt: true,
              email: true,
              contact: { select: { displayName: true } },
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      this.prisma.clientPortalDemand.findMany({
        where: { clientId, ...submitted },
        include: history,
        orderBy: { updatedAt: 'desc' },
      }),
      clientPortalPermissions.publish.every((code) => effective.includes(code))
        ? this.prisma.clientPortalPublication.findMany({
            where: { clientId, revokedAt: null },
            select: publicationSelect,
            orderBy: { publishedAt: 'desc' },
          })
        : [],
    ]);
    return {
      members: members.map(({ id, contactId, acceptedAt, revokedAt, email, contact }) => ({
        id,
        contactId,
        email,
        name: contact.displayName,
        state: revokedAt ? 'REVOKED' : acceptedAt ? 'ACTIVE' : 'INVITED',
      })),
      demands: demands.map((row) => ({ ...demandView(row), missionId: row.missionId })),
      publications: publications.map((row) => ({ ...publicationView(row), revoked: false })),
    };
  }

  async decide(
    actorId: string,
    clientId: string,
    demandId: string,
    decision: ClientDemandDecision,
    context: RequestContext,
  ) {
    return this.prisma.$transaction(async (db) => {
      await this.assertStaff(
        actorId,
        db,
        decision.action === 'CONVERT' ? clientPortalPermissions.convert : [],
      );
      await lockClient(db, clientId);
      const row = await db.clientPortalDemand.findFirst({
        where: { id: demandId, clientId, ...submitted },
        include: history,
      });
      if (!row) throw new NotFoundException();
      if (decision.action === 'CONVERT' && row.status === 'CONVERTED' && row.missionId)
        return { ...demandView(row), missionId: row.missionId };
      if (row.revision !== decision.revision)
        throw new ConflictException('The request has changed.');
      const requiredStatus = {
        REVIEW: 'SUBMITTED',
        APPROVE: 'IN_REVIEW',
        REJECT: 'IN_REVIEW',
        REVISE: 'IN_REVIEW',
        CONVERT: 'APPROVED',
      } as const;
      const nextStatus = {
        REVIEW: 'IN_REVIEW',
        APPROVE: 'APPROVED',
        REJECT: 'REJECTED',
        REVISE: 'CHANGES_REQUESTED',
        CONVERT: 'CONVERTED',
      } as const;
      if (row.status !== requiredStatus[decision.action])
        throw new ConflictException('Decision is not allowed in the current status.');
      const status = nextStatus[decision.action];
      const missionId =
        decision.action === 'CONVERT'
          ? (
              await this.missions.createMissionInTransaction(
                {
                  ...ClientDemandFieldsSchema.parse(row.submittedSnapshot),
                  clientId,
                  state: 'DRAFT',
                },
                actorId,
                context,
                db,
              )
            ).mission.id
          : undefined;
      const updated = await db.clientPortalDemand.update({
        where: { id: demandId },
        data: {
          status,
          missionId,
          revision: { increment: 1 },
          history: { create: { status, reason: decision.reason } },
        },
        include: history,
      });
      await clientAudit(db, demandId, 'demand.' + decision.action.toLowerCase(), actorId);
      return { ...demandView(updated), missionId: updated.missionId };
    });
  }

  async preview(actorId: string, clientId: string, request: ClientPublicationRequest) {
    await this.assertStaff(actorId, this.prisma, this.publicationPermissions(request.demandId));
    const { title, city, country } = await this.findPublicationSource(
      this.prisma,
      actorId,
      clientId,
      request,
    );
    return { title, city, country };
  }

  async publish(
    actorId: string,
    clientId: string,
    { preview, consentConfirmed, ...request }: ClientPublicationCommit,
  ) {
    return this.prisma.$transaction(async (db) => {
      await this.assertStaff(actorId, db, this.publicationPermissions(request.demandId));
      await lockClient(db, clientId);
      await db.$queryRaw`SELECT id FROM "Candidate" WHERE id = ${request.candidateId}::uuid FOR SHARE`;
      const card = await this.findPublicationSource(db, actorId, clientId, request);
      if (
        !consentConfirmed ||
        card.title !== preview.title ||
        card.city !== preview.city ||
        card.country !== preview.country
      ) {
        throw new ConflictException('Preview the current profile before publishing.');
      }
      const previous = await db.clientPortalPublication.findFirst({
        where: {
          clientId,
          candidateId: request.candidateId,
          demandId: request.demandId ?? null,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (previous) {
        await db.clientPortalPublication.update({
          where: { id: previous.id },
          data: { revokedAt: new Date() },
        });
        await clientAudit(db, previous.id, 'publication.replaced', actorId);
      }
      const row = await db.clientPortalPublication.create({
        data: { ...card, ...request, clientId },
        select: publicationSelect,
      });
      await clientAudit(db, row.id, 'publication.published', actorId);
      return publicationView(row);
    });
  }

  async revokePublication(actorId: string, clientId: string, id: string) {
    await this.prisma.$transaction(async (db) => {
      await this.assertStaff(actorId, db, clientPortalPermissions.publish);
      await lockClient(db, clientId);
      const row = await db.clientPortalPublication.findFirst({
        where: { id, clientId },
        select: { id: true, demandId: true, revokedAt: true },
      });
      if (!row) throw new NotFoundException();
      if (row.demandId) await this.assertStaff(actorId, db, clientPortalPermissions.shortlist);
      if (row.revokedAt) return;
      await db.clientPortalPublication.update({ where: { id }, data: { revokedAt: new Date() } });
      await clientAudit(db, id, 'publication.revoked', actorId);
    });
  }

  async publications(token: string | undefined, demandId?: string, cursor?: string) {
    return this.prisma.$transaction(
      async (db) => {
        const member = await this.auth.requireSession(token, db);
        if (
          demandId &&
          !(await db.clientPortalDemand.findFirst({
            where: { id: demandId, clientId: member.clientId, status: 'CONVERTED' },
            select: { id: true },
          }))
        )
          throw new NotFoundException();
        const where = { ...this.visiblePublication(member.clientId), demandId: demandId ?? null };
        if (
          cursor &&
          !(await db.clientPortalPublication.findFirst({
            where: { ...where, id: cursor },
            select: { id: true },
          }))
        )
          throw new NotFoundException();
        const rows = await db.clientPortalPublication.findMany({
          where,
          select: publicationSelect,
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
          take: pageSize + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        return {
          publications: rows.slice(0, pageSize).map(publicationView),
          nextCursor: rows.length > pageSize ? rows[pageSize - 1]!.id : null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async document(token: string | undefined, id: string) {
    return this.prisma.$transaction(
      async (db) => {
        const member = await this.auth.requireSession(token, db);
        const row = await db.clientPortalPublication.findFirst({
          where: { ...this.visiblePublication(member.clientId), id, summaryDocument: true },
          select: publicationSelect,
        });
        if (!row) throw new NotFoundException();
        return [row.title, row.city, row.country].filter(Boolean).join('\n') + '\n';
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  private visiblePublication(clientId: string): Prisma.ClientPortalPublicationWhereInput {
    return {
      clientId,
      revokedAt: null,
      candidate: candidateConsent,
      OR: [
        { demandId: null },
        {
          missionCandidate: {
            clientVisible: true,
            presentedAt: { not: null },
            archivedAt: null,
            state: { in: [...shortlistStates] },
            mission: { archivedAt: null, state: { notIn: [...closedMissions] } },
          },
        },
      ],
    };
  }

  private publicationPermissions(demandId?: string) {
    return demandId
      ? [...clientPortalPermissions.publish, ...clientPortalPermissions.shortlist]
      : clientPortalPermissions.publish;
  }

  private async findPublicationSource(
    db: Prisma.TransactionClient,
    actorId: string,
    clientId: string,
    request: ClientPublicationRequest,
  ) {
    if (
      !(await db.client.findFirst({
        where: { id: clientId, archivedAt: null, status: 'ACTIVE' },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    let missionCandidateId: string | undefined;
    if (request.demandId) {
      const demand = await db.clientPortalDemand.findFirst({
        where: {
          id: request.demandId,
          clientId,
          status: 'CONVERTED',
          mission: { archivedAt: null, state: { notIn: [...closedMissions] } },
        },
        select: { missionId: true },
      });
      if (!demand?.missionId) throw new NotFoundException();
      const process = await db.missionCandidate.findFirst({
        where: {
          missionId: demand.missionId,
          candidateId: request.candidateId,
          clientVisible: true,
          presentedAt: { not: null },
          archivedAt: null,
          state: { in: [...shortlistStates] },
        },
        select: { id: true, responsibleRecruiterUserId: true },
      });
      if (!process)
        throw new NotFoundException('An active presentation for this request is required.');
      await this.missionCandidates.assertPortalPresentationScope(
        demand.missionId,
        process,
        actorId,
        db,
      );
      missionCandidateId = process.id;
    }
    const candidate = await db.candidate.findFirst({
      where: { id: request.candidateId, ...candidateConsent },
      select: { currentJobTitle: true, city: true, country: true },
    });
    if (!candidate?.currentJobTitle)
      throw new NotFoundException(
        'A candidate with recorded consent and a role title is required.',
      );
    return {
      title: candidate.currentJobTitle,
      city: candidate.city,
      country: candidate.country,
      missionCandidateId,
    };
  }

  private async clientWrite<T>(
    token: string | undefined,
    action: (db: Prisma.TransactionClient, member: { id: string; clientId: string }) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (db) => {
      const initial = await this.auth.requireSession(token, db);
      await lockClient(db, initial.clientId);
      return action(db, await this.auth.requireSession(token, db));
    });
  }

  private async ownedDraft(
    db: Prisma.TransactionClient,
    creatorId: string,
    clientId: string,
    id: string,
    revision: number,
  ) {
    const row = await db.clientPortalDemand.findFirst({
      where: { id, clientId, creatorId },
      include: history,
    });
    if (!row) throw new NotFoundException();
    if (!editable(row) || row.revision !== revision)
      throw new ConflictException('The request is no longer editable at this revision.');
    return row;
  }
}
