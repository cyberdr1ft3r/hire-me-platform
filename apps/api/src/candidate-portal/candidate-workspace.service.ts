import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CandidateProfileFieldsSchema,
  type CandidateProfileFields,
  type PublicApplicationFileInput,
} from '@hire-me/contracts';

import { CandidateClamav } from './candidate-clamav.js';
import type { Prisma } from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { validatePublicApplicationFile } from '../public-applications/public-application-upload-validation.js';
import type { UploadMalwareScanProvider } from '../storage/upload-malware-scan.provider.js';
import { ProtectedStorageService } from '../storage/protected-storage.service.js';

const cvSelect = {
  id: true,
  preferred: true,
  versions: {
    select: { id: true, version: true, filename: true, sizeBytes: true, scannedAt: true },
    orderBy: { version: 'desc' },
  },
} as const satisfies Prisma.CandidatePortalCvSelect;
type Cv = Prisma.CandidatePortalCvGetPayload<{ select: typeof cvSelect }>;
export const unavailableCv = () =>
  new NotFoundException({
    error: { code: 'CANDIDATE_CV_UNAVAILABLE', message: 'The selected CV is unavailable.' },
  });
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const view = (cv: Cv) => ({
  ...cv,
  versions: cv.versions.map((version) => ({
    ...version,
    scannedAt: version.scannedAt.toISOString(),
  })),
});
export type CandidatePdfUpload = { buffer: Buffer; mimetype: string; originalname: string };

@Injectable()
export class CandidateWorkspace {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProtectedStorageService) private readonly storage: ProtectedStorageService,
    @Inject(CandidateClamav) private readonly scanner: UploadMalwareScanProvider,
  ) {}

  async profile(identity: { id: string; email: string }) {
    const row = await this.prisma.candidatePortalProfile.findUnique({
      where: { identityId: identity.id },
    });
    return {
      email: identity.email,
      profile: row ? CandidateProfileFieldsSchema.parse(row.data) : null,
      revision: row?.revision ?? 0,
    };
  }

  async saveProfile(
    identity: { id: string; email: string },
    profile: CandidateProfileFields,
    revision: number,
  ) {
    const row = await this.prisma.$transaction(async (db) => {
      await this.lockIdentity(db, identity.id);
      const existing = await db.candidatePortalProfile.findUnique({
        where: { identityId: identity.id },
        select: { revision: true },
      });
      if ((existing?.revision ?? 0) !== revision)
        throw new ConflictException('The profile has changed.');
      return existing
        ? db.candidatePortalProfile.update({
            where: { identityId: identity.id },
            data: { data: profile, revision: { increment: 1 } },
          })
        : db.candidatePortalProfile.create({ data: { identityId: identity.id, data: profile } });
    });
    return {
      email: identity.email,
      profile: CandidateProfileFieldsSchema.parse(row.data),
      revision: row.revision,
    };
  }

  async cvs(identityId: string) {
    const rows = await this.prisma.candidatePortalCv.findMany({
      where: { identityId, removedAt: null },
      select: cvSelect,
      orderBy: [{ preferred: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    return { cvs: rows.map(view) };
  }

  async upload(identityId: string, file: CandidatePdfUpload | undefined, cvId?: string) {
    if (cvId) await this.ownedCv(this.prisma, identityId, cvId);
    if (!file || file.mimetype !== 'application/pdf')
      throw new BadRequestException('A PDF CV is required.');
    const validated = validatePublicApplicationFile({
      category: 'CV',
      filename: file.originalname,
      contentType: file.mimetype,
      base64Content: file.buffer.toString('base64'),
    });
    const storageKey = 'candidate-portal/cvs/' + randomUUID() + '.pdf';
    await this.scanner.scan(validated.buffer, {
      source: 'candidate_cv',
      mimeType: validated.contentType,
      filename: validated.sanitizedFilename,
      storageKey,
    });
    await this.storage.put(storageKey, validated.buffer);
    try {
      const row = await this.prisma.$transaction(async (db) => {
        await this.lockIdentity(db, identityId);
        const usage = await db.candidatePortalCvVersion.aggregate({
          where: { cv: { identityId } },
          _sum: { sizeBytes: true },
          _count: true,
        });
        if (
          (usage._sum.sizeBytes ?? 0) + validated.sizeBytes > 100 * 1024 * 1024 ||
          usage._count >= 100
        ) {
          throw new ConflictException({
            error: {
              code: 'CANDIDATE_CV_CAPACITY',
              message: 'The CV library has reached its capacity.',
            },
          });
        }
        const previous = cvId ? await this.ownedCv(db, identityId, cvId) : null;
        if (
          !previous &&
          (await db.candidatePortalCv.count({ where: { identityId, removedAt: null } })) >= 20
        ) {
          throw new ConflictException({
            error: {
              code: 'CANDIDATE_CV_CAPACITY',
              message: 'The CV library has reached its capacity.',
            },
          });
        }
        if ((previous?.versions.length ?? 0) >= 20)
          throw new ConflictException({
            error: {
              code: 'CANDIDATE_CV_CAPACITY',
              message: 'This CV has reached its version limit.',
            },
          });
        const version = {
          version: (previous?.versions[0]?.version ?? 0) + 1,
          sizeBytes: validated.sizeBytes,
          filename: validated.sanitizedFilename,
          storageKey,
          sha256: sha256(validated.buffer),
          scannedAt: new Date(),
        };
        if (previous)
          return db.candidatePortalCv.update({
            where: { id: previous.id },
            data: { versions: { create: version } },
            select: cvSelect,
          });
        const preferred = !(await db.candidatePortalCv.findFirst({
          where: { identityId, preferred: true, removedAt: null },
          select: { id: true },
        }));
        return db.candidatePortalCv.create({
          data: { identityId, preferred, versions: { create: version } },
          select: cvSelect,
        });
      });
      return view(row);
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
  }

  async choose(identityId: string, cvId: string) {
    await this.prisma.$transaction(async (db) => {
      await this.lockIdentity(db, identityId);
      await this.ownedCv(db, identityId, cvId);
      await db.candidatePortalCv.updateMany({
        where: { identityId, preferred: true },
        data: { preferred: false },
      });
      await db.candidatePortalCv.update({ where: { id: cvId }, data: { preferred: true } });
    });
  }

  async remove(identityId: string, cvId: string) {
    await this.prisma.$transaction(async (db) => {
      await this.lockIdentity(db, identityId);
      if (
        !(
          await db.candidatePortalCv.updateMany({
            where: { id: cvId, identityId, removedAt: null },
            data: { removedAt: new Date(), preferred: false },
          })
        ).count
      )
        throw new NotFoundException();
    });
  }

  async file(identityId: string, versionId: string) {
    const row = await this.prisma.candidatePortalCvVersion.findFirst({
      where: { id: versionId, cv: { identityId, removedAt: null } },
      select: { filename: true, storageKey: true, sha256: true },
    });
    if (!row) throw unavailableCv();
    const bytes = await this.storage.get(row.storageKey).catch(() => {
      throw unavailableCv();
    });
    if (sha256(bytes) !== row.sha256) throw unavailableCv();
    return { filename: row.filename, bytes };
  }

  async fileForApplication(
    identityId: string,
    versionId: string,
  ): Promise<PublicApplicationFileInput> {
    const { bytes, filename } = await this.file(identityId, versionId);
    return {
      filename,
      category: 'CV',
      contentType: 'application/pdf',
      base64Content: bytes.toString('base64'),
    };
  }

  async submission(identityId: string, id: string) {
    const row = await this.prisma.publicCandidateApplication.findFirst({
      where: { id, ownerIdentityId: identityId },
      select: {
        submittedFullName: true,
        submittedEmail: true,
        submittedPhone: true,
        submittedCity: true,
        submittedCountry: true,
        submittedCurrentPosition: true,
        submittedSkills: true,
        submittedLanguages: true,
        submittedAvailability: true,
        submittedProfessionalLinks: true,
        submittedMotivation: true,
        selectedPortalCvVersion: { select: { version: true } },
        files: {
          where: { category: 'CV' },
          select: { candidateDocumentVersion: { select: { filename: true } } },
          take: 1,
        },
      },
    });
    if (!row) throw new NotFoundException();
    return {
      fullName: row.submittedFullName,
      email: row.submittedEmail,
      phone: row.submittedPhone,
      city: row.submittedCity,
      country: row.submittedCountry,
      currentPosition: row.submittedCurrentPosition,
      skills: row.submittedSkills,
      languages: row.submittedLanguages,
      availability: row.submittedAvailability,
      professionalLinks: row.submittedProfessionalLinks,
      motivation: row.submittedMotivation,
      cvFilename: row.files[0]?.candidateDocumentVersion.filename ?? null,
      libraryVersion: row.selectedPortalCvVersion?.version ?? null,
    };
  }

  private async ownedCv(db: Prisma.TransactionClient, identityId: string, id: string) {
    const row = await db.candidatePortalCv.findFirst({
      where: { id, identityId, removedAt: null },
      select: cvSelect,
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async lockIdentity(db: Prisma.TransactionClient, identityId: string) {
    await db.$queryRaw`SELECT id FROM "CandidateIdentity" WHERE id = ${identityId}::uuid FOR UPDATE`;
  }
}
