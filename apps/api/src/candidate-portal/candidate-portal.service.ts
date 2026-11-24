import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { candidateReturnPath, type CandidateApplication } from '@hire-me/contracts';

import { PasswordService } from '../auth/password.service.js';
import { loadEnvironment } from '../config/environment.js';
import { Prisma } from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { CandidateGoogle } from './candidate-google.js';
import { CandidateMail } from './candidate-mail.js';

const hour = 3_600_000;
export const candidateSessionMs = 8 * hour;
const randomToken = () => randomBytes(32).toString('base64url');
export const candidateTokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const validCandidateToken = (token: string | undefined): token is string =>
  typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
const reject = () => new UnauthorizedException('Candidate sign-in failed.');

function uniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const applicationSelect = {
  id: true,
  submittedAt: true,
  status: true,
  publicOpportunity: { select: { publicTitle: true } },
  missionCandidate: { select: { state: true, archivedAt: true } },
} satisfies Prisma.PublicCandidateApplicationSelect;

function projectApplication(
  row: Prisma.PublicCandidateApplicationGetPayload<{ select: typeof applicationSelect }>,
): CandidateApplication {
  const state = row.missionCandidate.state;
  const closed =
    row.status === 'ARCHIVED' ||
    row.missionCandidate.archivedAt ||
    [
      'PROCESS_COMPLETED',
      'CANDIDATE_REJECTED',
      'CLIENT_REJECTED',
      'WITHDRAWN',
      'TALENT_POOL',
    ].includes(state);
  return {
    id: row.id,
    title: row.publicOpportunity.publicTitle,
    submittedAt: row.submittedAt.toISOString(),
    status: closed ? 'CLOSED' : state === 'NEW' ? 'RECEIVED' : 'IN_REVIEW',
  };
}

@Injectable()
export class CandidatePortalService {
  private readonly logger = new Logger(CandidatePortalService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(CandidateMail) private readonly mail: CandidateMail,
    @Inject(CandidateGoogle) private readonly google: CandidateGoogle,
  ) {}

  enabled(): boolean {
    return loadEnvironment().CANDIDATE_PORTAL_ENABLED === 'true';
  }

  assertEnabled(): void {
    if (!this.enabled()) throw new NotFoundException();
  }

  async requestEmail(email: string, purpose: 'VERIFY' | 'RESET', target?: string): Promise<void> {
    const normalized = email.toLowerCase();
    const identity =
      purpose === 'VERIFY'
        ? await this.prisma.candidateIdentity.upsert({
            where: { email: normalized },
            create: { email: normalized },
            update: {},
          })
        : await this.prisma.candidateIdentity.findUnique({ where: { email: normalized } });
    if (!identity) return;
    if (purpose === 'VERIFY' && !identity.verifiedAt && !identity.googleSubject) {
      await this.sendToken(identity, purpose, target);
    }
    if (purpose === 'RESET' && identity.verifiedAt && identity.passwordHash) {
      await this.sendToken(identity, purpose, target);
    }
  }

  private async sendToken(
    identity: { id: string; email: string; googleSubject: string | null },
    purpose: 'VERIFY' | 'RESET',
    target?: string,
  ) {
    const token = randomToken();
    const tokenHash = candidateTokenHash(token);
    await this.prisma.candidatePortalEmailToken.create({
      data: {
        tokenHash,
        purpose,
        identityId: identity.id,
        expiresAt: new Date(Date.now() + (purpose === 'RESET' ? hour / 2 : hour)),
      },
    });
    const link = new URL(
      purpose === 'VERIFY' ? '/candidate/verify' : '/candidate/reset',
      loadEnvironment().API_CORS_ORIGIN,
    );
    link.searchParams.set('returnTo', candidateReturnPath(target));
    if (identity.googleSubject) link.searchParams.set('provider', 'google');
    link.hash = token;
    try {
      await this.mail.send(identity.email, purpose, link.href);
    } catch {
      this.logger.warn('Candidate email delivery failed');
      await this.prisma.candidatePortalEmailToken.deleteMany({ where: { tokenHash } });
    }
  }

  async completeEmail(
    token: string,
    purpose: 'VERIFY' | 'RESET',
    password?: string,
  ): Promise<string> {
    const tokenHash = candidateTokenHash(token);
    const proof = await this.prisma.candidatePortalEmailToken.findFirst({
      where: { tokenHash, purpose, expiresAt: { gt: new Date() } },
      include: { identity: true },
    });
    if (!proof) throw reject();
    let passwordHash: string | undefined;
    if (!proof.identity.googleSubject || purpose === 'RESET') {
      if (!password || !this.passwords.validatePasswordPolicy(password)) {
        throw new BadRequestException(
          'Use at least 12 characters with upper and lower case, a number, and a symbol.',
        );
      }
      passwordHash = await this.passwords.hashPassword(password);
    }
    return this.prisma.$transaction(async (db) => {
      // Lock the identity first so competing links and password sign-in serialize.
      const identity = await db.candidateIdentity.updateMany({
        where: {
          id: proof.identityId,
          ...(purpose === 'VERIFY' ? { verifiedAt: null } : { passwordHash: { not: null } }),
        },
        data: { verifiedAt: new Date(), passwordHash },
      });
      if (!identity.count) throw reject();
      const consumed = await db.candidatePortalEmailToken.deleteMany({
        where: { tokenHash, purpose, expiresAt: { gt: new Date() } },
      });
      if (!consumed.count) throw reject();
      await db.candidatePortalEmailToken.deleteMany({
        where: { identityId: proof.identityId, purpose },
      });
      await db.candidatePortalSession.deleteMany({ where: { identityId: proof.identityId } });
      return this.issueSession(db, proof.identityId);
    });
  }

  async login(email: string, password: string): Promise<string> {
    const identity = await this.prisma.candidateIdentity.findUnique({
      where: { email: email.toLowerCase() },
    });
    const correct = await this.passwords.verifyPassword(identity?.passwordHash, password);
    if (!identity?.verifiedAt || !identity.passwordHash || !correct) throw reject();
    return this.prisma.$transaction(async (db) => {
      const unchanged = await db.candidateIdentity.updateMany({
        where: { id: identity.id, passwordHash: identity.passwordHash },
        data: { verifiedAt: identity.verifiedAt },
      });
      if (!unchanged.count) throw reject();
      return this.issueSession(db, identity.id);
    });
  }

  async googleChallenge() {
    if (!loadEnvironment().CANDIDATE_GOOGLE_CLIENT_ID) throw new NotFoundException();
    const binding = randomToken();
    const nonce = randomToken();
    await this.prisma.candidatePortalGoogleChallenge.create({
      data: {
        bindingHash: candidateTokenHash(binding),
        nonce,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    return { binding, nonce };
  }

  async loginWithGoogle(
    credential: string,
    binding: string | undefined,
    target?: string,
  ): Promise<string | null> {
    const audience = loadEnvironment().CANDIDATE_GOOGLE_CLIENT_ID;
    if (!audience) throw new NotFoundException();
    if (!validCandidateToken(binding)) throw reject();
    const bindingHash = candidateTokenHash(binding);
    const challenge = await this.prisma.candidatePortalGoogleChallenge.findUnique({
      where: { bindingHash },
    });
    if (!challenge || challenge.expiresAt <= new Date()) throw reject();
    const profile = await this.google.verify(credential, audience, challenge.nonce);
    const consumed = await this.prisma.candidatePortalGoogleChallenge.deleteMany({
      where: { bindingHash, expiresAt: { gt: new Date() } },
    });
    if (!consumed.count) throw reject();

    let identity = await this.prisma.candidateIdentity.findUnique({
      where: { googleSubject: profile.sub },
    });
    if (identity && identity.email !== profile.email.toLowerCase()) throw reject();
    if (!identity) {
      const email = profile.email.toLowerCase();
      try {
        identity = await this.prisma.candidateIdentity.create({
          data: {
            email,
            googleSubject: profile.sub,
            // A third-party mailbox still needs a HireMe verification link.
            verifiedAt: email.endsWith('@gmail.com') || profile.hd ? new Date() : null,
          },
        });
      } catch (error) {
        if (uniqueConflict(error)) throw reject();
        throw error;
      }
    }
    if (!identity.verifiedAt) {
      await this.sendToken(identity, 'VERIFY', target);
      return null;
    }
    return this.issueSession(this.prisma, identity.id);
  }

  private async issueSession(db: Prisma.TransactionClient, identityId: string): Promise<string> {
    const token = randomToken();
    await db.candidatePortalSession.create({
      data: {
        tokenHash: candidateTokenHash(token),
        identityId,
        expiresAt: new Date(Date.now() + candidateSessionMs),
      },
    });
    return token;
  }

  async session(token: string | undefined) {
    if (!validCandidateToken(token)) return null;
    const session = await this.prisma.candidatePortalSession.findFirst({
      where: {
        tokenHash: candidateTokenHash(token),
        expiresAt: { gt: new Date() },
        identity: { verifiedAt: { not: null } },
      },
      select: { identity: { select: { id: true, email: true } } },
    });
    return session?.identity ?? null;
  }

  async requireSession(token: string | undefined) {
    const identity = await this.session(token);
    if (!identity) throw reject();
    return identity;
  }

  async logout(token: string | undefined): Promise<void> {
    if (validCandidateToken(token)) {
      await this.prisma.candidatePortalSession.deleteMany({
        where: { tokenHash: candidateTokenHash(token) },
      });
    }
  }

  async applications(identityId: string, cursor?: string) {
    if (
      cursor &&
      !(await this.prisma.publicCandidateApplication.findFirst({
        where: { id: cursor, ownerIdentityId: identityId },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    const rows = await this.prisma.publicCandidateApplication.findMany({
      where: { ownerIdentityId: identityId },
      select: applicationSelect,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, 20);
    return {
      applications: items.map(projectApplication),
      nextCursor: rows.length > 20 ? items.at(-1)!.id : null,
    };
  }

  async application(identityId: string, id: string) {
    const row = await this.prisma.publicCandidateApplication.findFirst({
      where: { id, ownerIdentityId: identityId },
      select: applicationSelect,
    });
    if (!row) throw new NotFoundException();
    return projectApplication(row);
  }
}
