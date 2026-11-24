import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PasswordService } from '../auth/password.service.js';
import { loadEnvironment } from '../config/environment.js';
import type { Prisma } from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

export const clientSessionMs = 8 * 3600_000;
const tokenShape = /^[A-Za-z0-9_-]{43}$/;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const denied = () => new UnauthorizedException('Client authentication failed.');
const liveContact = {
  status: 'ACTIVE',
  archivedAt: null,
  client: { status: 'ACTIVE', archivedAt: null },
} as const;
const liveMember = {
  acceptedAt: { not: null },
  revokedAt: null,
  contact: liveContact,
} satisfies Prisma.ClientPortalMemberWhereInput;
type Purpose = 'INVITE' | 'RESET';

export async function lockClient(db: Prisma.TransactionClient, clientId: string) {
  await db.$queryRaw`SELECT id FROM "Client" WHERE id = ${clientId}::uuid FOR UPDATE`;
  if (
    !(await db.client.findFirst({
      where: { id: clientId, status: 'ACTIVE', archivedAt: null },
      select: { id: true },
    }))
  ) {
    throw new NotFoundException();
  }
}

export async function clientAudit(
  db: Prisma.TransactionClient,
  entityId: string,
  action: string,
  actorUserId?: string,
) {
  await db.auditLog.create({
    data: { action: 'client_portal.' + action, entityType: 'ClientPortal', entityId, actorUserId },
  });
}

@Injectable()
export class ClientPortalMail {
  async send(email: string, purpose: Purpose, link: string) {
    const env = loadEnvironment();
    if (env.CLIENT_PORTAL_MAIL_OUTBOX) {
      await mkdir(env.CLIENT_PORTAL_MAIL_OUTBOX, { recursive: true, mode: 0o700 });
      await writeFile(
        join(env.CLIENT_PORTAL_MAIL_OUTBOX, randomUUID() + '.json'),
        JSON.stringify({ email, purpose, link }),
        { mode: 0o600, flag: 'wx' },
      );
      return;
    }
    const subject =
      purpose === 'INVITE'
        ? 'Your HireMe invitation / Votre invitation HireMe'
        : 'Reset your HireMe password / Réinitialisez votre mot de passe HireMe';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + env.CLIENT_PORTAL_RESEND_API_KEY,
      },
      body: JSON.stringify({ from: env.CLIENT_PORTAL_MAIL_FROM, to: [email], subject, text: link }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Email delivery failed');
  }
}

@Injectable()
export class ClientPortalAuth {
  private readonly logger = new Logger(ClientPortalAuth.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(ClientPortalMail) private readonly mail: ClientPortalMail,
  ) {}

  enabled() {
    return loadEnvironment().CLIENT_PORTAL_ENABLED === 'true';
  }

  assertEnabled() {
    if (!this.enabled()) throw new NotFoundException();
  }

  async invite(clientId: string, contactId: string, actorId: string) {
    const proof = await this.prisma
      .$transaction(async (db) => {
        await lockClient(db, clientId);
        const contact = await db.clientContact.findFirst({
          where: { id: contactId, clientId, ...liveContact },
          select: { normalizedEmail: true },
        });
        if (!contact) throw new NotFoundException();
        const existing = await db.clientPortalMember.findFirst({
          where: { OR: [{ contactId }, { email: contact.normalizedEmail }] },
          select: { id: true, contactId: true, email: true, acceptedAt: true, revokedAt: true },
        });
        if (
          existing &&
          (existing.contactId !== contactId ||
            existing.email !== contact.normalizedEmail ||
            (existing.acceptedAt && !existing.revokedAt))
        ) {
          throw new ConflictException(
            'Contact already has portal access or cannot be re-enrolled.',
          );
        }
        const member = existing
          ? await db.clientPortalMember.update({
              where: { id: existing.id },
              data: { acceptedAt: null, revokedAt: null, passwordHash: null },
            })
          : await db.clientPortalMember.create({
              data: { clientId, contactId, email: contact.normalizedEmail },
            });
        await clientAudit(db, member.id, 'member.invited', actorId);
        return this.newProof(db, member.id, member.email, 'INVITE');
      })
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
          throw new ConflictException('Contact cannot be enrolled.');
        }
        throw error;
      });
    if (!(await this.deliver(proof)))
      throw new ServiceUnavailableException(
        'Unable to send the invitation. Retry to send a fresh link.',
      );
  }

  async revoke(clientId: string, memberId: string, actorId: string) {
    await this.prisma.$transaction(async (db) => {
      await lockClient(db, clientId);
      const member = await db.clientPortalMember.findFirst({ where: { id: memberId, clientId } });
      if (!member) throw new NotFoundException();
      if (member.revokedAt) return;
      await db.clientPortalMember.update({
        where: { id: memberId },
        data: { revokedAt: new Date(), passwordHash: null },
      });
      await db.clientPortalToken.deleteMany({ where: { memberId } });
      await db.clientPortalSession.deleteMany({ where: { memberId } });
      await clientAudit(db, memberId, 'member.revoked', actorId);
    });
  }

  async forgot(email: string) {
    const member = await this.prisma.clientPortalMember.findFirst({
      where: { email: email.toLowerCase(), ...liveMember },
      include: { contact: { select: { normalizedEmail: true } } },
    });
    if (!member || member.email !== member.contact.normalizedEmail) return;
    const proof = await this.prisma
      .$transaction(async (db) => {
        await lockClient(db, member.clientId);
        if (
          !(await db.clientPortalMember.findFirst({
            where: {
              id: member.id,
              ...liveMember,
              contact: { ...liveContact, normalizedEmail: member.email },
            },
            select: { id: true },
          }))
        )
          return null;
        return this.newProof(db, member.id, member.email, 'RESET');
      })
      .catch((error: unknown) => {
        if (error instanceof NotFoundException) return null;
        throw error;
      });
    if (proof) await this.deliver(proof);
  }

  async complete(value: string, password: string, purpose: Purpose) {
    if (!this.passwords.validatePasswordPolicy(password))
      throw new BadRequestException('Password does not meet policy.');
    const tokenHash = hash(value);
    const proof = await this.prisma.clientPortalToken.findFirst({
      where: { tokenHash, purpose, expiresAt: { gt: new Date() } },
      include: { member: true },
    });
    if (!proof) throw denied();
    const passwordHash = await this.passwords.hashPassword(password);
    return this.prisma.$transaction(async (db) => {
      await this.lockForAuth(db, proof.member.clientId);
      const updated = await db.clientPortalMember.updateMany({
        where: {
          id: proof.memberId,
          revokedAt: null,
          acceptedAt: purpose === 'INVITE' ? null : { not: null },
          contact: { ...liveContact, normalizedEmail: proof.member.email },
        },
        data: { acceptedAt: proof.member.acceptedAt ?? new Date(), passwordHash },
      });
      if (
        !updated.count ||
        !(
          await db.clientPortalToken.deleteMany({
            where: { tokenHash, purpose, expiresAt: { gt: new Date() } },
          })
        ).count
      )
        throw denied();
      await db.clientPortalToken.deleteMany({ where: { memberId: proof.memberId } });
      await db.clientPortalSession.deleteMany({ where: { memberId: proof.memberId } });
      await clientAudit(
        db,
        proof.memberId,
        purpose === 'INVITE' ? 'member.accepted' : 'member.password_reset',
      );
      return this.issueSession(db, proof.memberId);
    });
  }

  async login(email: string, password: string) {
    const member = await this.prisma.clientPortalMember.findFirst({
      where: {
        email: email.toLowerCase(),
        ...liveMember,
        contact: { ...liveContact, normalizedEmail: email.toLowerCase() },
      },
    });
    const correct = await this.passwords.verifyPassword(member?.passwordHash, password);
    if (!correct || !member?.passwordHash) throw denied();
    return this.prisma.$transaction(async (db) => {
      await this.lockForAuth(db, member.clientId);
      if (
        !(await db.clientPortalMember.findFirst({
          where: {
            id: member.id,
            ...liveMember,
            passwordHash: member.passwordHash,
            contact: { ...liveContact, normalizedEmail: member.email },
          },
          select: { id: true },
        }))
      )
        throw denied();
      return this.issueSession(db, member.id);
    });
  }

  async requireSession(value: string | undefined, db: Prisma.TransactionClient = this.prisma) {
    if (!value || !tokenShape.test(value)) throw denied();
    const session = await db.clientPortalSession.findFirst({
      where: { tokenHash: hash(value), expiresAt: { gt: new Date() }, member: liveMember },
      select: {
        member: {
          select: {
            id: true,
            clientId: true,
            email: true,
            contact: { select: { normalizedEmail: true } },
          },
        },
      },
    });
    if (!session || session.member.email !== session.member.contact.normalizedEmail) throw denied();
    return { id: session.member.id, clientId: session.member.clientId };
  }

  async logout(value: string | undefined) {
    if (value && tokenShape.test(value))
      await this.prisma.clientPortalSession.deleteMany({ where: { tokenHash: hash(value) } });
  }

  private async lockForAuth(db: Prisma.TransactionClient, clientId: string) {
    try {
      await lockClient(db, clientId);
    } catch (error) {
      if (error instanceof NotFoundException) throw denied();
      throw error;
    }
  }

  private async issueSession(db: Prisma.TransactionClient, memberId: string) {
    const value = token();
    await db.clientPortalSession.create({
      data: { memberId, tokenHash: hash(value), expiresAt: new Date(Date.now() + clientSessionMs) },
    });
    return value;
  }

  private async newProof(
    db: Prisma.TransactionClient,
    memberId: string,
    email: string,
    purpose: Purpose,
  ) {
    const value = token();
    const tokenHash = hash(value);
    if (purpose === 'INVITE')
      await db.clientPortalToken.deleteMany({ where: { memberId, purpose } });
    await db.clientPortalToken.create({
      data: {
        memberId,
        purpose,
        tokenHash,
        expiresAt: new Date(Date.now() + (purpose === 'INVITE' ? 24 * 3600_000 : 30 * 60_000)),
      },
    });
    const url = new URL(
      purpose === 'INVITE' ? '/client/accept' : '/client/reset',
      loadEnvironment().API_CORS_ORIGIN,
    );
    url.hash = value;
    return { email, purpose, tokenHash, url: url.href };
  }

  private async deliver(proof: {
    email: string;
    purpose: Purpose;
    tokenHash: string;
    url: string;
  }) {
    try {
      await this.mail.send(proof.email, proof.purpose, proof.url);
      return true;
    } catch {
      this.logger.warn('Client portal email delivery failed');
      await this.prisma.clientPortalToken.deleteMany({ where: { tokenHash: proof.tokenHash } });
      return false;
    }
  }
}
