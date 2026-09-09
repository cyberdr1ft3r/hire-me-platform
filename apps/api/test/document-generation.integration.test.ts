import type { NestExpressApplication } from '@nestjs/platform-express';
import './setup-env.js';
import { randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthResponseSchema } from '@hire-me/contracts';
import { drawnLines, extractPdf } from '../src/document-generation/renderers/pdf-text.testing.js';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import { DocumentGenerationService } from '../src/document-generation/document-generation.service.js';
import { ProtectedStorageService } from '../src/storage/protected-storage.service.js';
import {
  CertificateStatus,
  CommercialContractBusinessType,
  CommercialContractStatus,
  DocumentType,
  DocumentVersionSource,
  InvoiceStatus,
  PermissionScopeType,
  PrismaClient,
  PurchaseOrderStatus,
  QuotationStatus,
  RoleName,
  TrainingEnrollmentStatus,
  UserStatus,
} from '../src/persistence/prisma/generated-client.js';

const prisma = new PrismaClient();
const passwords = new PasswordService();
const testPassword = 'Synthetic-passphrase-123!';

/**
 * Issue #49 template-driven business-output generation.
 *
 * Everything runs against real PostgreSQL and the real protected storage service, so
 * source correctness, taxonomy invariants, authorization, versioning, idempotency,
 * concurrency, failure compensation, and the produced file bytes are verified against
 * the actual system rather than mocks.
 */

/** Full generation operator: generation plus every source read capability. */
const generatorPermissions = [
  'documents:generate',
  'documents:view',
  'documents:download',
  'commercial_data:access',
  'quotations:view',
  'contracts:view',
  'purchase_orders:view',
  'invoices:view',
  'clients:view',
  'client_contacts:view',
  'candidates:view',
  'missions:view',
  'mission_candidates:transfer',
  'training_programs:view',
  'training_programs:view_all',
  'training_enrollments:view',
] as const;

/** Everything except the generation capability itself. */
const noGeneratePermissions = generatorPermissions.filter((code) => code !== 'documents:generate');

/** Generation capability without commercial data access. */
const noCommercialDataPermissions = generatorPermissions.filter(
  (code) => code !== 'commercial_data:access',
);

/** Generation capability and commercial data access, but no source view capability. */
const noSourceViewPermissions = generatorPermissions.filter(
  (code) =>
    code !== 'quotations:view' &&
    code !== 'contracts:view' &&
    code !== 'purchase_orders:view' &&
    code !== 'invoices:view',
);

/** Client scope without broad mission oversight and without any assignment. */
const limitedMissionScopePermissions = generatorPermissions.filter(
  (code) => code !== 'mission_candidates:transfer',
);

/** Enrollment capability without any training program visibility. */
const noTrainingScopePermissions = generatorPermissions.filter(
  (code) => code !== 'training_programs:view' && code !== 'training_programs:view_all',
);

/**
 * Full training program and enrollment visibility, but no participant source capability.
 * A certificate renders the participant's name, so this actor must not be able to reach
 * one through a document identifier either.
 */
const noParticipantSourcePermissions = generatorPermissions.filter(
  (code) => code !== 'candidates:view' && code !== 'client_contacts:view',
);

type RolePermissionSnapshot = {
  roleExisted: boolean;
  permissions: { permissionId: string; grantedAt: Date; archivedAt: Date | null }[];
};

async function cleanGenerationTestRecords(): Promise<void> {
  await prisma.auditLog.deleteMany({
    where: { action: { in: ['documents.generated', 'documents.regenerated'] } },
  });
  await prisma.document.updateMany({
    where: { generatedDocumentKey: { not: null } },
    data: { currentVersionId: null },
  });
  await prisma.documentVersion.deleteMany({
    where: { source: DocumentVersionSource.GENERATED },
  });
  await prisma.document.deleteMany({ where: { generatedDocumentKey: { not: null } } });
  await prisma.invoiceLine.deleteMany({
    where: { invoice: { reference: { startsWith: 'GEN49-' } } },
  });
  await prisma.invoiceEvent.deleteMany({
    where: { invoice: { reference: { startsWith: 'GEN49-' } } },
  });
  await prisma.invoice.deleteMany({ where: { reference: { startsWith: 'GEN49-' } } });
  await prisma.purchaseOrderEvent.deleteMany({
    where: { purchaseOrder: { reference: { startsWith: 'GEN49-' } } },
  });
  await prisma.purchaseOrder.deleteMany({ where: { reference: { startsWith: 'GEN49-' } } });
  await prisma.commercialContractEvent.deleteMany({
    where: { contract: { reference: { startsWith: 'GEN49-' } } },
  });
  await prisma.commercialContract.deleteMany({ where: { reference: { startsWith: 'GEN49-' } } });
  await prisma.commercialQuotationLine.deleteMany({
    where: { quotation: { reference: { startsWith: 'GEN49-' } } },
  });
  await prisma.commercialQuotationEvent.deleteMany({
    where: { quotation: { reference: { startsWith: 'GEN49-' } } },
  });
  await prisma.commercialQuotation.deleteMany({ where: { reference: { startsWith: 'GEN49-' } } });
  await prisma.trainingEnrollment.deleteMany({
    where: { program: { normalizedReference: { startsWith: 'gen49' } } },
  });
  await prisma.trainingSession.deleteMany({
    where: { program: { normalizedReference: { startsWith: 'gen49' } } },
  });
  await prisma.trainingProgram.deleteMany({
    where: { normalizedReference: { startsWith: 'gen49' } },
  });
  await prisma.externalTrainingParticipant.deleteMany({
    where: { displayName: { startsWith: 'Gen49' } },
  });
  await prisma.candidate.deleteMany({
    where: { normalizedEmail: { endsWith: '@generation.test' } },
  });
  await prisma.clientContact.deleteMany({
    where: { normalizedEmail: { endsWith: '@generation.test' } },
  });
  await prisma.missionRecruiter.deleteMany({
    where: { mission: { title: { startsWith: 'Gen49' } } },
  });
  await prisma.recruitmentMission.deleteMany({ where: { title: { startsWith: 'Gen49' } } });
  await prisma.client.deleteMany({ where: { normalizedName: { startsWith: 'gen49' } } });
  await prisma.refreshSession.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@generation.test' } } },
  });
  await prisma.passwordCredential.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@generation.test' } } },
  });
  await prisma.userRole.deleteMany({
    where: { user: { normalizedEmail: { endsWith: '@generation.test' } } },
  });
  await prisma.user.deleteMany({ where: { normalizedEmail: { endsWith: '@generation.test' } } });
}

async function setRolePermissions(roleName: RoleName, codes: readonly string[]): Promise<void> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      name: roleName,
      description: `Synthetic ${roleName} role for generation tests.`,
      status: 'ACTIVE',
    },
  });
  await prisma.rolePermission.updateMany({
    where: { roleId: role.id },
    data: { archivedAt: new Date() },
  });
  for (const code of codes) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { status: 'ACTIVE' },
      create: {
        code,
        description: `Synthetic ${code} permission for generation tests.`,
        scopeType: PermissionScopeType.EXPLICIT,
        status: 'ACTIVE',
      },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: { archivedAt: null },
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
}

async function snapshotRolePermissions(roleName: RoleName): Promise<RolePermissionSnapshot> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    include: { permissions: true },
  });
  if (!role) {
    return { roleExisted: false, permissions: [] };
  }
  return {
    roleExisted: true,
    permissions: role.permissions.map((rp) => ({
      permissionId: rp.permissionId,
      grantedAt: rp.grantedAt,
      archivedAt: rp.archivedAt,
    })),
  };
}

async function restoreRolePermissions(
  roleName: RoleName,
  snapshot: RolePermissionSnapshot,
): Promise<void> {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) {
    return;
  }
  if (!snapshot.roleExisted) {
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    return;
  }
  await prisma.rolePermission.deleteMany({
    where: {
      roleId: role.id,
      permissionId: { notIn: snapshot.permissions.map((rp) => rp.permissionId) },
    },
  });
  for (const rp of snapshot.permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: rp.permissionId } },
      update: { grantedAt: rp.grantedAt, archivedAt: rp.archivedAt },
      create: {
        roleId: role.id,
        permissionId: rp.permissionId,
        grantedAt: rp.grantedAt,
        archivedAt: rp.archivedAt,
      },
    });
  }
}

async function createUser(email: string, roleName: RoleName): Promise<string> {
  const user = await prisma.user.create({
    data: {
      displayName: `Synthetic ${email}`,
      email,
      normalizedEmail: email.toLowerCase(),
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.passwordCredential.create({
    data: { userId: user.id, passwordHash: await passwords.hashPassword(testPassword) },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user.id;
}

function reference(prefix: string): string {
  return `GEN49-${prefix}-${randomUUID().slice(0, 8)}`;
}

describe('document output generation', { timeout: 60_000 }, () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let storage: ProtectedStorageService;
  let generationService: DocumentGenerationService;
  let generatorUserId: string;
  let generatorToken: string;
  let noGenerateToken: string;
  let noParticipantSourceToken: string;
  let noCommercialDataToken: string;
  let noSourceViewToken: string;
  let limitedScopeToken: string;
  let limitedScopeUserId: string;
  let noTrainingScopeToken: string;
  let clientId: string;
  let missionId: string;
  let roleSnapshots: Map<RoleName, RolePermissionSnapshot>;

  async function login(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: testPassword }),
    });
    return AuthResponseSchema.parse(await response.json()).accessToken;
  }

  async function api(
    token: string,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as never) : {} };
  }

  function errorCode(body: Record<string, unknown>): string | undefined {
    return (body as { error?: { code?: string } }).error?.code;
  }

  function generated(body: Record<string, unknown>) {
    return (
      body as {
        generated: {
          documentId: string;
          versionId: string;
          versionNumber: number;
          sourceType: string;
          sourceId: string;
          documentType: string;
          outputFamily: string;
          language: string;
          templateId: string;
          templateVersion: number;
          filename: string;
          mimeType: string;
          sizeBytes: number;
          checksumSha256: string;
          replayed: boolean;
        };
      }
    ).generated;
  }

  function generationBody(overrides: Record<string, unknown> = {}) {
    return {
      outputFamily: 'PDF',
      language: 'fr',
      idempotencyKey: `IDEM-${randomUUID()}`,
      ...overrides,
    };
  }

  async function generate(
    path: string,
    overrides: Record<string, unknown> = {},
    token = generatorToken,
  ) {
    return api(token, path, { method: 'POST', body: generationBody(overrides) });
  }

  async function createQuotation(
    options: { status?: QuotationStatus; mission?: string | null } = {},
  ) {
    return prisma.commercialQuotation.create({
      data: {
        reference: reference('QT'),
        clientId,
        recruitmentMissionId: options.mission === undefined ? null : options.mission,
        currency: 'MAD',
        status: options.status ?? QuotationStatus.ISSUED,
        issueDate: new Date(),
        subtotalCents: 20_000,
        taxCents: 4_000,
        totalCents: 24_000,
        lines: {
          create: [
            {
              sortOrder: 1,
              description: 'Recruitment success fee',
              quantity: 2,
              unitPriceCents: 10_000,
              taxRateBps: 2_000,
              lineSubtotalCents: 20_000,
              lineTaxCents: 4_000,
              lineTotalCents: 24_000,
            },
          ],
        },
      },
    });
  }

  async function createPurchaseOrder(options: { status?: PurchaseOrderStatus } = {}) {
    return prisma.purchaseOrder.create({
      data: {
        reference: reference('PO'),
        clientId,
        currency: 'MAD',
        amountCents: 15_000,
        taxCents: 3_000,
        totalCents: 18_000,
        status: options.status ?? PurchaseOrderStatus.RECEIVED,
        issueDate: new Date(),
      },
    });
  }

  async function createContract(
    businessType: CommercialContractBusinessType,
    options: { status?: CommercialContractStatus } = {},
  ) {
    return prisma.commercialContract.create({
      data: {
        reference: reference('CT'),
        businessType,
        clientId,
        currency: 'MAD',
        contractValueCents: 50_000,
        taxCents: 10_000,
        totalCents: 60_000,
        termsSummary: 'Synthetic terms.',
        status: options.status ?? CommercialContractStatus.ACTIVE,
      },
    });
  }

  async function createInvoice(
    options: {
      status?: InvoiceStatus;
      mission?: string | null;
      referenceValue?: string;
      client?: string;
    } = {},
  ) {
    return prisma.invoice.create({
      data: {
        reference: options.referenceValue ?? reference('INV'),
        clientId: options.client ?? clientId,
        recruitmentMissionId: options.mission === undefined ? null : options.mission,
        currency: 'MAD',
        status: options.status ?? InvoiceStatus.ISSUED,
        issueDate: new Date(),
        issuedAt: new Date(),
        dueDate: new Date(Date.now() + 30 * 86_400_000),
        subtotalCents: 30_000,
        taxCents: 6_000,
        totalCents: 36_000,
        lines: {
          create: [
            {
              sortOrder: 1,
              description: 'Placement fee',
              quantity: 1,
              unitPriceCents: 30_000,
              taxRateBps: 2_000,
              lineSubtotalCents: 30_000,
              lineTaxCents: 6_000,
              lineTotalCents: 36_000,
            },
          ],
        },
      },
    });
  }

  async function createCandidateEnrollment(options: { clientContact?: boolean } = {}) {
    const key = randomUUID().slice(0, 8);
    const program = await prisma.trainingProgram.create({
      data: {
        reference: `GEN49-TP-${key}`,
        normalizedReference: `gen49-tp-${key}`,
        name: 'Gen49 Participant Program',
      },
    });

    if (options.clientContact) {
      const contactClient = await prisma.client.create({
        data: { name: `Gen49 Contact Client ${key}`, normalizedName: `gen49 contact ${key}` },
      });
      const contact = await prisma.clientContact.create({
        data: {
          clientId: contactClient.id,
          displayName: `Gen49 Contact ${key}`,
          email: `gen49-contact-${key}@generation.test`,
          normalizedEmail: `gen49-contact-${key}@generation.test`,
        },
      });
      const enrollment = await prisma.trainingEnrollment.create({
        data: {
          trainingProgramId: program.id,
          participantType: 'CLIENT_CONTACT',
          clientContactId: contact.id,
          activeParticipantKey: `CLIENT_CONTACT:${contact.id}`,
          status: TrainingEnrollmentStatus.EVALUATED,
          enrolledAt: new Date(),
          completedAt: new Date(),
          certificateStatus: CertificateStatus.PENDING,
        },
      });
      return { program, enrollment };
    }

    const candidate = await prisma.candidate.create({
      data: {
        displayName: `Gen49 Candidate ${key}`,
        email: `gen49-candidate-${key}@generation.test`,
        normalizedEmail: `gen49-candidate-${key}@generation.test`,
      },
    });
    const enrollment = await prisma.trainingEnrollment.create({
      data: {
        trainingProgramId: program.id,
        participantType: 'CANDIDATE',
        candidateId: candidate.id,
        activeParticipantKey: `CANDIDATE:${candidate.id}`,
        status: TrainingEnrollmentStatus.EVALUATED,
        enrolledAt: new Date(),
        completedAt: new Date(),
        certificateStatus: CertificateStatus.PENDING,
      },
    });
    return { program, enrollment };
  }

  async function createCertificateReadyEnrollment(options: { ready?: boolean } = {}) {
    const key = randomUUID().slice(0, 8);
    const program = await prisma.trainingProgram.create({
      data: {
        reference: `GEN49-TP-${key}`,
        normalizedReference: `gen49-tp-${key}`,
        name: 'Gen49 Program',
      },
    });
    const participant = await prisma.externalTrainingParticipant.create({
      data: { displayName: `Gen49 Participant ${key}` },
    });
    const ready = options.ready ?? true;
    const enrollment = await prisma.trainingEnrollment.create({
      data: {
        trainingProgramId: program.id,
        participantType: 'EXTERNAL',
        externalTrainingParticipantId: participant.id,
        // Mirrors the merged active-enrollment uniqueness key.
        activeParticipantKey: `EXTERNAL:${participant.id}`,
        status: ready ? TrainingEnrollmentStatus.EVALUATED : TrainingEnrollmentStatus.REGISTERED,
        enrolledAt: new Date(),
        completedAt: ready ? new Date() : null,
        certificateStatus: ready ? CertificateStatus.PENDING : CertificateStatus.NOT_APPLICABLE,
      },
    });
    return { program, enrollment };
  }

  /**
   * Reads the drawn text back out of a generated PDF.
   *
   * Generated PDFs embed subsetted TrueType faces, so the content stream holds glyph
   * indices rather than characters. Parsing the file and reading its `ToUnicode` map is
   * what makes an assertion about rendered content real. Nothing is filtered out of the
   * result: every drawn glyph maps back to the source characters it came from, so an
   * assertion here is an assertion about what a reader would copy.
   */
  async function pdfText(bytes: Buffer): Promise<string> {
    return (await extractPdf(bytes)).text;
  }

  /** Inflates every deflated entry of an OOXML package so its XML can be inspected. */
  function docxXml(bytes: Buffer): string {
    let xml = '';
    let offset = 0;
    while (offset >= 0 && offset < bytes.length - 30) {
      if (bytes.readUInt32LE(offset) !== 0x04034b50) {
        break;
      }
      const method = bytes.readUInt16LE(offset + 8);
      const compressedSize = bytes.readUInt32LE(offset + 18);
      const nameLength = bytes.readUInt16LE(offset + 26);
      const extraLength = bytes.readUInt16LE(offset + 28);
      const dataStart = offset + 30 + nameLength + extraLength;
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      try {
        xml += method === 8 ? inflateRawSync(data).toString('utf8') : data.toString('utf8');
      } catch {
        // A non-inflatable entry contributes nothing to the inspected XML.
      }
      offset = dataStart + compressedSize;
    }
    return xml;
  }

  function certificatePath(programId: string, enrollmentId: string): string {
    return `/v1/training/programs/${programId}/enrollments/${enrollmentId}/generate-certificate`;
  }

  beforeAll(async () => {
    await cleanGenerationTestRecords();
    roleSnapshots = new Map(
      await Promise.all(
        [
          RoleName.HR_MANAGER,
          RoleName.ADMIN,
          RoleName.MANAGER,
          RoleName.TEAM_LEADER,
          RoleName.EMPLOYEE,
          RoleName.GUEST,
          RoleName.CLIENT_USER,
        ].map(async (role) => [role, await snapshotRolePermissions(role)] as const),
      ),
    );
    await setRolePermissions(RoleName.HR_MANAGER, generatorPermissions);
    await setRolePermissions(RoleName.MANAGER, noParticipantSourcePermissions);
    await setRolePermissions(RoleName.TEAM_LEADER, noCommercialDataPermissions);
    await setRolePermissions(RoleName.EMPLOYEE, noSourceViewPermissions);
    await setRolePermissions(RoleName.GUEST, limitedMissionScopePermissions);
    await setRolePermissions(RoleName.CLIENT_USER, noTrainingScopePermissions);

    generatorUserId = await createUser('generator@generation.test', RoleName.HR_MANAGER);
    await createUser('no-participant-source@generation.test', RoleName.MANAGER);
    await setRolePermissions(RoleName.ADMIN, noGeneratePermissions);
    await createUser('no-generate@generation.test', RoleName.ADMIN);
    await createUser('no-commercial@generation.test', RoleName.TEAM_LEADER);
    await createUser('no-source-view@generation.test', RoleName.EMPLOYEE);
    limitedScopeUserId = await createUser('limited-scope@generation.test', RoleName.GUEST);
    await createUser('no-training@generation.test', RoleName.CLIENT_USER);

    const client = await prisma.client.create({
      data: { name: 'Gen49 Client', normalizedName: 'gen49 client' },
    });
    clientId = client.id;
    const mission = await prisma.recruitmentMission.create({
      data: { clientId, title: 'Gen49 Mission', numberOfPositions: 1 },
    });
    missionId = mission.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    storage = app.get(ProtectedStorageService);
    generationService = app.get(DocumentGenerationService);

    generatorToken = await login('generator@generation.test');
    noGenerateToken = await login('no-generate@generation.test');
    noParticipantSourceToken = await login('no-participant-source@generation.test');
    noCommercialDataToken = await login('no-commercial@generation.test');
    noSourceViewToken = await login('no-source-view@generation.test');
    limitedScopeToken = await login('limited-scope@generation.test');
    noTrainingScopeToken = await login('no-training@generation.test');
  }, 180_000);

  afterAll(async () => {
    generationService.afterSourceStabilized = null;
    vi.restoreAllMocks();
    await app?.close();
    await cleanGenerationTestRecords();
    for (const [role, snapshot] of roleSnapshots) {
      await restoreRolePermissions(role, snapshot);
    }
    await prisma.$disconnect();
  }, 180_000);

  // -------------------------------------------------------------------------
  // Source correctness and taxonomy
  // -------------------------------------------------------------------------

  it('generates a quotation PDF from the authoritative quotation record', async () => {
    const quotation = await createQuotation();
    const response = await generate(`/v1/commercial/quotations/${quotation.id}/generate`);
    expect(response.status).toBe(201);

    const result = generated(response.body);
    expect(result.sourceType).toBe('COMMERCIAL_QUOTATION');
    expect(result.sourceId).toBe(quotation.id);
    expect(result.documentType).toBe(DocumentType.QUOTATION);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.templateId).toBe('commercial.quotation');
    expect(result.versionNumber).toBe(1);
    expect(result.replayed).toBe(false);

    const document = await prisma.document.findUniqueOrThrow({
      where: { id: result.documentId },
    });
    expect(document.generated).toBe(true);
    expect(document.commercialQuotationId).toBe(quotation.id);
    expect(document.currentVersionId).toBe(result.versionId);

    const stored = await storage.get(
      (await prisma.documentVersion.findUniqueOrThrow({ where: { id: result.versionId } }))
        .storageKey,
    );
    expect(stored.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('generates a quotation DOCX with a valid OpenXML package', async () => {
    const quotation = await createQuotation();
    const response = await generate(`/v1/commercial/quotations/${quotation.id}/generate`, {
      outputFamily: 'WORD',
      language: 'en',
    });
    expect(response.status).toBe(201);

    const result = generated(response.body);
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(result.filename.endsWith('.docx')).toBe(true);

    const version = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: result.versionId },
    });
    const bytes = await storage.get(version.storageKey);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.toString('latin1')).toContain('word/document.xml');
    expect(Number(version.sizeBytes)).toBe(bytes.length);
  });

  it('generates a purchase order output from the authoritative record', async () => {
    const order = await createPurchaseOrder();
    const response = await generate(`/v1/commercial/purchase-orders/${order.id}/generate`);
    expect(response.status).toBe(201);
    const result = generated(response.body);
    expect(result.documentType).toBe(DocumentType.PURCHASE_ORDER);
    expect(result.sourceId).toBe(order.id);
  });

  it('keeps the recruitment and training contract taxonomies distinct', async () => {
    const recruitment = await createContract(CommercialContractBusinessType.RECRUITMENT);
    const training = await createContract(CommercialContractBusinessType.TRAINING);

    const recruitmentResult = generated(
      (await generate(`/v1/commercial/contracts/${recruitment.id}/generate`)).body,
    );
    const trainingResult = generated(
      (await generate(`/v1/commercial/contracts/${training.id}/generate`)).body,
    );

    expect(recruitmentResult.documentType).toBe(DocumentType.CONTRAT_RECRUTEMENT);
    expect(trainingResult.documentType).toBe(DocumentType.CONTRAT_FORMATION);
  });

  it('renders an issued invoice from its immutable stored totals and lines', async () => {
    const invoice = await createInvoice();
    const response = await generate(`/v1/commercial/invoices/${invoice.id}/generate`);
    expect(response.status).toBe(201);
    const result = generated(response.body);
    expect(result.documentType).toBe(DocumentType.INVOICE);

    const version = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: result.versionId },
    });
    const text = await pdfText(await storage.get(version.storageKey));
    // The rendered figures are the exact persisted issued values; nothing is recomputed.
    expect(text).toContain('300.00 MAD');
    expect(text).toContain('60.00 MAD');
    expect(text).toContain('360.00 MAD');
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.subtotalCents).toBe(30_000);
    expect(stored.taxCents).toBe(6_000);
    expect(stored.totalCents).toBe(36_000);
  });

  it('generates a certificate for a certificate-ready enrollment', async () => {
    const { program, enrollment } = await createCertificateReadyEnrollment();
    const response = await generate(certificatePath(program.id, enrollment.id));
    expect(response.status).toBe(201);

    const result = generated(response.body);
    expect(result.documentType).toBe(DocumentType.TRAINING_CERTIFICATE);
    expect(result.sourceType).toBe('TRAINING_ENROLLMENT');
    expect(result.templateId).toBe('training.certificate');

    // Generating the file never transitions the enrollment: issuance stays an explicit
    // audited training action.
    const stored = await prisma.trainingEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(stored.certificateStatus).toBe(CertificateStatus.PENDING);
    expect(stored.completedAt).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Lifecycle eligibility
  // -------------------------------------------------------------------------

  it('refuses to generate from ineligible commercial lifecycle states', async () => {
    const draftQuotation = await createQuotation({ status: QuotationStatus.DRAFT });
    const canceledOrder = await createPurchaseOrder({ status: PurchaseOrderStatus.CANCELED });
    const canceledContract = await createContract(CommercialContractBusinessType.RECRUITMENT, {
      status: CommercialContractStatus.CANCELED,
    });
    const draftInvoice = await createInvoice({ status: InvoiceStatus.DRAFT });
    const canceledInvoice = await createInvoice({ status: InvoiceStatus.CANCELED });

    const cases: [string, string][] = [
      ['quotations', draftQuotation.id],
      ['purchase-orders', canceledOrder.id],
      ['contracts', canceledContract.id],
      ['invoices', draftInvoice.id],
      ['invoices', canceledInvoice.id],
    ];

    for (const [segment, id] of cases) {
      const rejected = await generate(`/v1/commercial/${segment}/${id}/generate`);
      expect(rejected.status).toBe(409);
      expect(errorCode(rejected.body)).toBe('GENERATION_SOURCE_NOT_ELIGIBLE');
    }
    expect(await prisma.document.count({ where: { generatedDocumentKey: { not: null } } })).toBe(
      await prisma.document.count({ where: { generated: true } }),
    );
  });

  it('refuses to generate a certificate that is not certificate-ready', async () => {
    const notReady = await createCertificateReadyEnrollment({ ready: false });
    const rejected = await generate(certificatePath(notReady.program.id, notReady.enrollment.id));
    expect(rejected.status).toBe(409);
    expect(errorCode(rejected.body)).toBe('GENERATION_SOURCE_NOT_ELIGIBLE');

    // An already issued certificate status is not implicitly regenerated either.
    const issued = await createCertificateReadyEnrollment();
    await prisma.trainingEnrollment.update({
      where: { id: issued.enrollment.id },
      data: { certificateStatus: CertificateStatus.ISSUED },
    });
    const blocked = await generate(certificatePath(issued.program.id, issued.enrollment.id));
    expect(blocked.status).toBe(409);
    expect(errorCode(blocked.body)).toBe('GENERATION_SOURCE_NOT_ELIGIBLE');
  });

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  it('denies generation without the generation capability', async () => {
    const quotation = await createQuotation();
    const denied = await generate(
      `/v1/commercial/quotations/${quotation.id}/generate`,
      {},
      noGenerateToken,
    );
    expect(denied.status).toBe(403);
    expect(await prisma.document.count({ where: { commercialQuotationId: quotation.id } })).toBe(0);
  });

  it('hides a commercial source without its view capability or commercial data access', async () => {
    const quotation = await createQuotation();
    for (const token of [noSourceViewToken, noCommercialDataToken]) {
      const denied = await generate(
        `/v1/commercial/quotations/${quotation.id}/generate`,
        {},
        token,
      );
      expect(denied.status).toBe(404);
      expect(errorCode(denied.body)).toBe('GENERATION_SOURCE_NOT_FOUND');
    }
  });

  it('keeps hidden and nonexistent commercial sources indistinguishable', async () => {
    const missionInvoice = await createInvoice({ mission: missionId });
    const hidden = await generate(
      `/v1/commercial/invoices/${missionInvoice.id}/generate`,
      {},
      limitedScopeToken,
    );
    const missing = await generate(
      `/v1/commercial/invoices/${randomUUID()}/generate`,
      {},
      limitedScopeToken,
    );
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(hidden.status);
    expect(errorCode(hidden.body)).toBe('GENERATION_SOURCE_NOT_FOUND');
    expect(errorCode(missing.body)).toBe(errorCode(hidden.body));

    // An active mission assignment alone makes the same source generatable.
    await prisma.missionRecruiter.create({
      data: { missionId, userId: limitedScopeUserId, status: 'ACTIVE' },
    });
    const allowed = await generate(
      `/v1/commercial/invoices/${missionInvoice.id}/generate`,
      {},
      limitedScopeToken,
    );
    expect(allowed.status).toBe(201);
    await prisma.missionRecruiter.deleteMany({ where: { userId: limitedScopeUserId } });
  });

  it('hides a training enrollment without training program visibility', async () => {
    const { program, enrollment } = await createCertificateReadyEnrollment();
    const hidden = await generate(
      certificatePath(program.id, enrollment.id),
      {},
      noTrainingScopeToken,
    );
    const missing = await generate(
      certificatePath(program.id, randomUUID()),
      {},
      noTrainingScopeToken,
    );
    expect(hidden.status).toBe(404);
    expect(errorCode(hidden.body)).toBe('GENERATION_SOURCE_NOT_FOUND');
    expect(missing.status).toBe(hidden.status);
    expect(errorCode(missing.body)).toBe(errorCode(hidden.body));
  });

  it('re-authorizes the underlying source on every generated-document read and download', async () => {
    const missionInvoice = await createInvoice({ mission: missionId });
    const result = generated(
      (await generate(`/v1/commercial/invoices/${missionInvoice.id}/generate`)).body,
    );
    const second = generated(
      (await generate(`/v1/commercial/invoices/${missionInvoice.id}/generate`)).body,
    );
    expect(second.versionNumber).toBe(2);

    // The generator keeps full access to detail, history, and both downloads.
    expect((await api(generatorToken, `/v1/documents/${result.documentId}`)).status).toBe(200);
    expect((await api(generatorToken, `/v1/documents/${result.documentId}/versions`)).status).toBe(
      200,
    );
    for (const versionId of [result.versionId, second.versionId]) {
      const download = await fetch(
        `${baseUrl}/v1/documents/${result.documentId}/versions/${versionId}/download`,
        { headers: { Authorization: `Bearer ${generatorToken}` } },
      );
      expect(download.status).toBe(200);
    }

    // A leaked document UUID does not bypass the mission scope of its source.
    const detail = await api(limitedScopeToken, `/v1/documents/${result.documentId}`);
    expect(detail.status).toBe(404);
    expect(errorCode(detail.body)).toBe('DOCUMENT_NOT_FOUND');
    expect(
      (await api(limitedScopeToken, `/v1/documents/${result.documentId}/versions`)).status,
    ).toBe(404);
    const historical = await fetch(
      `${baseUrl}/v1/documents/${result.documentId}/versions/${result.versionId}/download`,
      { headers: { Authorization: `Bearer ${limitedScopeToken}` } },
    );
    expect(historical.status).toBe(404);

    // The same document never appears in the hidden actor's list results.
    const list = await api(limitedScopeToken, '/v1/documents?pageSize=100');
    expect(
      (list.body as { documents: { id: string }[] }).documents.map((item) => item.id),
    ).not.toContain(result.documentId);
  });

  it('hides a generated certificate from an actor without training program visibility', async () => {
    const { program, enrollment } = await createCertificateReadyEnrollment();
    const result = generated((await generate(certificatePath(program.id, enrollment.id))).body);

    const detail = await api(noTrainingScopeToken, `/v1/documents/${result.documentId}`);
    expect(detail.status).toBe(404);
    const list = await api(noTrainingScopeToken, '/v1/documents?pageSize=100');
    expect(
      (list.body as { documents: { id: string }[] }).documents.map((item) => item.id),
    ).not.toContain(result.documentId);
  });

  // -------------------------------------------------------------------------
  // Template safety and filenames
  // -------------------------------------------------------------------------

  it('produces a traversal-safe deterministic filename from a hostile reference', async () => {
    const invoice = await prisma.invoice.create({
      data: {
        reference: 'GEN49-../../etc/passwd<script>',
        clientId,
        currency: 'MAD',
        status: InvoiceStatus.ISSUED,
        issueDate: new Date(),
        issuedAt: new Date(),
        subtotalCents: 1_000,
        taxCents: 0,
        totalCents: 1_000,
      },
    });
    const result = generated(
      (await generate(`/v1/commercial/invoices/${invoice.id}/generate`)).body,
    );

    expect(result.filename).toMatch(/^[a-z0-9-]+-v1\.pdf$/);
    expect(result.filename).not.toContain('..');
    expect(result.filename).not.toContain('/');

    const version = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: result.versionId },
    });
    // Storage keys never contain caller-controlled text at all.
    expect(version.storageKey).toMatch(/^documents\/generated\/[0-9a-f]{32}\/[0-9a-f-]{36}\.pdf$/);
    // The hostile value survives only as inert drawn text. What must never appear is an
    // active-content construct, because that is the only way a PDF can execute anything.
    const bytes = await storage.get(version.storageKey);
    const raw = bytes.toString('latin1');
    for (const construct of ['/JavaScript', '/JS', '/OpenAction', '/Launch', '/EmbeddedFile']) {
      expect(raw).not.toContain(construct);
    }
    expect(await pdfText(bytes)).toContain('script');
  });

  it('records the template identity and version on the generated version', async () => {
    const quotation = await createQuotation();
    const result = generated(
      (await generate(`/v1/commercial/quotations/${quotation.id}/generate`, { language: 'en' }))
        .body,
    );
    const version = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: result.versionId },
    });
    expect(version.templateId).toBe('commercial.quotation');
    expect(version.templateVersion).toBe(1);
    expect(version.generationLanguage).toBe('en');
    expect(version.source).toBe(DocumentVersionSource.GENERATED);
    expect(version.checksumSha256).toHaveLength(64);

    const listed = await api(generatorToken, `/v1/documents/${result.documentId}/versions`);
    const versions = (
      listed.body as {
        versions: { templateId: string | null; generationLanguage: string | null }[];
      }
    ).versions;
    expect(versions[0]?.templateId).toBe('commercial.quotation');
    expect(versions[0]?.generationLanguage).toBe('en');
  });

  // -------------------------------------------------------------------------
  // Versioning and idempotency
  // -------------------------------------------------------------------------

  it('adds an immutable version on regeneration without touching the previous one', async () => {
    const quotation = await createQuotation();
    const first = generated(
      (await generate(`/v1/commercial/quotations/${quotation.id}/generate`)).body,
    );
    const firstVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: first.versionId },
    });

    const second = generated(
      (await generate(`/v1/commercial/quotations/${quotation.id}/generate`)).body,
    );
    expect(second.documentId).toBe(first.documentId);
    expect(second.versionNumber).toBe(2);

    const preserved = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: first.versionId },
    });
    expect(preserved.storageKey).toBe(firstVersion.storageKey);
    expect(preserved.checksumSha256).toBe(firstVersion.checksumSha256);
    expect((await storage.get(preserved.storageKey)).subarray(0, 4).toString()).toBe('%PDF');

    const document = await prisma.document.findUniqueOrThrow({ where: { id: first.documentId } });
    expect(document.currentVersionId).toBe(second.versionId);
  });

  it('keeps each output family and language in its own logical document', async () => {
    const quotation = await createQuotation();
    const pdfFr = generated(
      (await generate(`/v1/commercial/quotations/${quotation.id}/generate`)).body,
    );
    const wordFr = generated(
      (
        await generate(`/v1/commercial/quotations/${quotation.id}/generate`, {
          outputFamily: 'WORD',
        })
      ).body,
    );
    const pdfEn = generated(
      (await generate(`/v1/commercial/quotations/${quotation.id}/generate`, { language: 'en' }))
        .body,
    );

    expect(new Set([pdfFr.documentId, wordFr.documentId, pdfEn.documentId]).size).toBe(3);
    for (const result of [pdfFr, wordFr, pdfEn]) {
      expect(result.versionNumber).toBe(1);
    }
  });

  it('replays an identical idempotent request and conflicts on a mismatched one', async () => {
    const quotation = await createQuotation();
    const other = await createQuotation();
    const key = `IDEM-${randomUUID()}`;

    const first = generated(
      (
        await generate(`/v1/commercial/quotations/${quotation.id}/generate`, {
          idempotencyKey: key,
        })
      ).body,
    );
    const replay = generated(
      (
        await generate(`/v1/commercial/quotations/${quotation.id}/generate`, {
          idempotencyKey: key,
        })
      ).body,
    );
    expect(replay.versionId).toBe(first.versionId);
    expect(replay.versionNumber).toBe(1);
    expect(replay.replayed).toBe(true);
    expect(await prisma.documentVersion.count({ where: { documentId: first.documentId } })).toBe(1);

    for (const overrides of [
      { idempotencyKey: key, outputFamily: 'WORD' },
      { idempotencyKey: key, language: 'en' },
    ]) {
      const conflict = await generate(
        `/v1/commercial/quotations/${quotation.id}/generate`,
        overrides,
      );
      expect(conflict.status).toBe(409);
      expect(errorCode(conflict.body)).toBe('GENERATION_IDEMPOTENCY_KEY_CONFLICT');
    }

    const otherSource = await generate(`/v1/commercial/quotations/${other.id}/generate`, {
      idempotencyKey: key,
    });
    expect(otherSource.status).toBe(409);
    expect(errorCode(otherSource.body)).toBe('GENERATION_IDEMPOTENCY_KEY_CONFLICT');
  });

  // -------------------------------------------------------------------------
  // Concurrency
  // -------------------------------------------------------------------------

  it('creates one logical document when first generations race', async () => {
    const quotation = await createQuotation();
    const path = `/v1/commercial/quotations/${quotation.id}/generate`;
    const responses = await Promise.all([generate(path), generate(path), generate(path)]);

    expect(responses.every((response) => response.status === 201)).toBe(true);
    const documentIds = new Set(responses.map((response) => generated(response.body).documentId));
    expect(documentIds.size).toBe(1);

    const documentId = [...documentIds][0]!;
    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: 'asc' },
    });
    expect(versions.map((version) => version.versionNumber)).toEqual([1, 2, 3]);
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(versions.some((version) => version.id === document.currentVersionId)).toBe(true);
  });

  it('resolves concurrent identical idempotency keys to exactly one version', async () => {
    const quotation = await createQuotation();
    const path = `/v1/commercial/quotations/${quotation.id}/generate`;
    const key = `IDEM-${randomUUID()}`;
    const responses = await Promise.all([
      generate(path, { idempotencyKey: key }),
      generate(path, { idempotencyKey: key }),
    ]);

    expect(responses.every((response) => response.status === 201)).toBe(true);
    const versionIds = new Set(responses.map((response) => generated(response.body).versionId));
    expect(versionIds.size).toBe(1);
    expect(await prisma.documentVersion.count({ where: { generationIdempotencyKey: key } })).toBe(
      1,
    );
  });

  // -------------------------------------------------------------------------
  // Failure invariants and compensation
  // -------------------------------------------------------------------------

  it('leaves no version and no broken reference when publication fails', async () => {
    const quotation = await createQuotation();
    const failure = vi
      .spyOn(storage, 'put')
      .mockRejectedValueOnce(new Error('synthetic storage failure'));

    const response = await generate(`/v1/commercial/quotations/${quotation.id}/generate`);
    expect(response.status).toBeGreaterThanOrEqual(500);
    failure.mockRestore();

    expect(await prisma.document.count({ where: { commercialQuotationId: quotation.id } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ['documents.generated', 'documents.regenerated'] } },
      }),
    ).toBeGreaterThanOrEqual(0);

    // Retrying after the failure succeeds and starts at version 1.
    const retry = await generate(`/v1/commercial/quotations/${quotation.id}/generate`);
    expect(retry.status).toBe(201);
    expect(generated(retry.body).versionNumber).toBe(1);
  });

  it('compensates the published object when the database rejects the version', async () => {
    const invoice = await createInvoice();
    let publishedKey: string | null = null;
    const realPut = storage.put.bind(storage);
    const spy = vi.spyOn(storage, 'put').mockImplementation(async (key, content) => {
      await realPut(key, content);
      publishedKey = key;
      // The source becomes ineligible after the bytes are published, so the publishing
      // transaction rejects and the compensation path must run.
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CANCELED, canceledAt: new Date() },
      });
    });

    const response = await generate(`/v1/commercial/invoices/${invoice.id}/generate`);
    spy.mockRestore();

    expect(response.status).toBe(409);
    expect(errorCode(response.body)).toBe('GENERATION_SOURCE_NOT_ELIGIBLE');
    expect(publishedKey).not.toBeNull();

    // No committed version, no logical document, and the orphan object was removed.
    expect(await prisma.documentVersion.count({ where: { storageKey: publishedKey! } })).toBe(0);
    expect(await prisma.document.count({ where: { invoiceId: invoice.id } })).toBe(0);
    await expect(storage.get(publishedKey!)).rejects.toThrow();
  });

  it('keeps historical generated objects intact while compensating a later failure', async () => {
    const quotation = await createQuotation();
    const first = generated(
      (await generate(`/v1/commercial/quotations/${quotation.id}/generate`)).body,
    );
    const firstVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: first.versionId },
    });

    let publishedKey: string | null = null;
    const realPut = storage.put.bind(storage);
    const spy = vi.spyOn(storage, 'put').mockImplementation(async (key, content) => {
      await realPut(key, content);
      publishedKey = key;
      await prisma.commercialQuotation.update({
        where: { id: quotation.id },
        data: { status: QuotationStatus.CANCELED },
      });
    });

    const response = await generate(`/v1/commercial/quotations/${quotation.id}/generate`);
    spy.mockRestore();
    expect(response.status).toBe(409);

    // The historical version, its bytes, and the current pointer are untouched.
    const preserved = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: first.versionId },
    });
    expect(preserved.storageKey).toBe(firstVersion.storageKey);
    expect((await storage.get(preserved.storageKey)).subarray(0, 4).toString()).toBe('%PDF');
    const document = await prisma.document.findUniqueOrThrow({ where: { id: first.documentId } });
    expect(document.currentVersionId).toBe(first.versionId);
    await expect(storage.get(publishedKey!)).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Certificate participant source re-authorization
  // -------------------------------------------------------------------------

  it('hides a candidate certificate from an actor without candidates:view', async () => {
    const { program, enrollment } = await createCandidateEnrollment();
    const result = generated((await generate(certificatePath(program.id, enrollment.id))).body);

    // The narrow actor sees the program and the enrollment, but not the candidate.
    const detail = await api(noParticipantSourceToken, `/v1/documents/${result.documentId}`);
    expect(detail.status).toBe(404);
    expect(errorCode(detail.body)).toBe('DOCUMENT_NOT_FOUND');
    expect(
      (await api(noParticipantSourceToken, `/v1/documents/${result.documentId}/versions`)).status,
    ).toBe(404);
    const download = await fetch(
      `${baseUrl}/v1/documents/${result.documentId}/versions/${result.versionId}/download`,
      { headers: { Authorization: `Bearer ${noParticipantSourceToken}` } },
    );
    expect(download.status).toBe(404);
    expect(
      (
        (await api(noParticipantSourceToken, '/v1/documents?pageSize=100')).body as {
          documents: { id: string }[];
        }
      ).documents.map((item) => item.id),
    ).not.toContain(result.documentId);

    // A nonexistent document identifier is indistinguishable from the hidden one.
    const missing = await api(noParticipantSourceToken, `/v1/documents/${randomUUID()}`);
    expect(missing.status).toBe(detail.status);
    expect(errorCode(missing.body)).toBe(errorCode(detail.body));

    // Granting only candidates:view makes exactly this document readable again.
    await setRolePermissions(RoleName.MANAGER, [
      ...noParticipantSourcePermissions,
      'candidates:view',
    ]);
    try {
      expect(
        (await api(noParticipantSourceToken, `/v1/documents/${result.documentId}`)).status,
      ).toBe(200);
      expect(
        (await api(noParticipantSourceToken, `/v1/documents/${result.documentId}/versions`)).status,
      ).toBe(200);
      const allowed = await fetch(
        `${baseUrl}/v1/documents/${result.documentId}/versions/${result.versionId}/download`,
        { headers: { Authorization: `Bearer ${noParticipantSourceToken}` } },
      );
      expect(allowed.status).toBe(200);
      expect(
        (
          (await api(noParticipantSourceToken, '/v1/documents?pageSize=100')).body as {
            documents: { id: string }[];
          }
        ).documents.map((item) => item.id),
      ).toContain(result.documentId);
    } finally {
      await setRolePermissions(RoleName.MANAGER, noParticipantSourcePermissions);
    }
  });

  it('hides a client-contact certificate without clients:view and client_contacts:view', async () => {
    const { program, enrollment } = await createCandidateEnrollment({ clientContact: true });
    const result = generated((await generate(certificatePath(program.id, enrollment.id))).body);

    expect((await api(noParticipantSourceToken, `/v1/documents/${result.documentId}`)).status).toBe(
      404,
    );

    // Both capabilities are required; the client capability alone is not enough.
    await setRolePermissions(RoleName.MANAGER, [
      ...noParticipantSourcePermissions,
      'client_contacts:view',
    ]);
    try {
      expect(
        (await api(noParticipantSourceToken, `/v1/documents/${result.documentId}`)).status,
      ).toBe(200);
    } finally {
      await setRolePermissions(RoleName.MANAGER, noParticipantSourcePermissions);
    }
  });

  // -------------------------------------------------------------------------
  // Source snapshot identity
  // -------------------------------------------------------------------------

  it('records the source snapshot fingerprint on every generated version', async () => {
    const quotation = await createQuotation();
    const result = generated(
      (await generate(`/v1/commercial/quotations/${quotation.id}/generate`)).body,
    );
    const version = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: result.versionId },
    });
    expect(version.sourceSnapshotSha256).toHaveLength(64);
  });

  it('refuses to commit bytes rendered from a stale mutable purchase order', async () => {
    const order = await createPurchaseOrder({ status: PurchaseOrderStatus.DRAFT });
    let publishedKey: string | null = null;
    const realPut = storage.put.bind(storage);
    const spy = vi.spyOn(storage, 'put').mockImplementation(async (key, content) => {
      await realPut(key, content);
      publishedKey = key;
      // The record stays DRAFT, so lifecycle alone would not notice: only the snapshot
      // fingerprint reveals that the rendered amount is now stale.
      await prisma.purchaseOrder.update({
        where: { id: order.id },
        data: { amountCents: 20_000, totalCents: 24_000, taxCents: 4_000 },
      });
    });

    const response = await generate(`/v1/commercial/purchase-orders/${order.id}/generate`);
    spy.mockRestore();

    expect(response.status).toBe(409);
    expect(errorCode(response.body)).toBe('GENERATION_SOURCE_CHANGED');
    expect(await prisma.documentVersion.count({ where: { storageKey: publishedKey! } })).toBe(0);
    expect(await prisma.document.count({ where: { purchaseOrderId: order.id } })).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ['documents.generated', 'documents.regenerated'] } },
      }),
    ).toBeGreaterThanOrEqual(0);
    await expect(storage.get(publishedKey!)).rejects.toThrow();

    // Retrying against the current state succeeds and renders the new amount.
    const retry = await generate(`/v1/commercial/purchase-orders/${order.id}/generate`);
    expect(retry.status).toBe(201);
    const retryVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: generated(retry.body).versionId },
    });
    expect(await pdfText(await storage.get(retryVersion.storageKey))).toContain('200.00 MAD');
  });

  it('refuses to commit bytes rendered from a stale mutable contract', async () => {
    const contract = await createContract(CommercialContractBusinessType.RECRUITMENT, {
      status: CommercialContractStatus.DRAFT,
    });
    const first = generated(
      (await generate(`/v1/commercial/contracts/${contract.id}/generate`)).body,
    );

    let publishedKey: string | null = null;
    const realPut = storage.put.bind(storage);
    const spy = vi.spyOn(storage, 'put').mockImplementation(async (key, content) => {
      await realPut(key, content);
      publishedKey = key;
      await prisma.commercialContract.update({
        where: { id: contract.id },
        data: { termsSummary: 'Renegotiated terms.', contractValueCents: 90_000 },
      });
    });

    const response = await generate(`/v1/commercial/contracts/${contract.id}/generate`);
    spy.mockRestore();

    expect(response.status).toBe(409);
    expect(errorCode(response.body)).toBe('GENERATION_SOURCE_CHANGED');

    // The historical version, its bytes, and the current pointer are untouched.
    const preserved = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: first.versionId },
    });
    expect((await storage.get(preserved.storageKey)).subarray(0, 4).toString()).toBe('%PDF');
    const document = await prisma.document.findUniqueOrThrow({ where: { id: first.documentId } });
    expect(document.currentVersionId).toBe(first.versionId);
    expect(await prisma.documentVersion.count({ where: { documentId: first.documentId } })).toBe(1);
    await expect(storage.get(publishedKey!)).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Commit-time source stabilization
  //
  // These exercise the window the fingerprint alone cannot close: the moment after the
  // final comparison and before the generated version commits. The service exposes a
  // deterministic hook that pauses exactly there so a real competing mutation can be
  // started and observed.
  // -------------------------------------------------------------------------

  /** Pauses generation inside the publishing transaction, after the fingerprint passes. */
  function pauseAfterStabilization(): {
    reached: Promise<void>;
    release: () => void;
    restore: () => void;
  } {
    let signalReached: () => void = () => {};
    let releaseGeneration: () => void = () => {};
    const reached = new Promise<void>((resolve) => {
      signalReached = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    generationService.afterSourceStabilized = async () => {
      // Only the first generation of a test pauses; later ones run straight through.
      generationService.afterSourceStabilized = null;
      signalReached();
      await paused;
    };
    return {
      reached,
      release: () => releaseGeneration(),
      restore: () => {
        generationService.afterSourceStabilized = null;
        releaseGeneration();
      },
    };
  }

  function settleTracker<T>(promise: Promise<T>): { promise: Promise<T>; settled: () => boolean } {
    let done = false;
    const tracked = promise.then(
      (value) => {
        done = true;
        return value;
      },
      (error: unknown) => {
        done = true;
        throw error;
      },
    );
    return { promise: tracked, settled: () => done };
  }

  async function wait(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  it('blocks a purchase order update from committing while generation holds the source', async () => {
    const order = await createPurchaseOrder({ status: PurchaseOrderStatus.DRAFT });
    const barrier = pauseAfterStabilization();

    try {
      const generation = generate(`/v1/commercial/purchase-orders/${order.id}/generate`);
      await barrier.reached;

      // A real mutation through Prisma, started only once generation owns its locks.
      const update = settleTracker(
        prisma.purchaseOrder.update({
          where: { id: order.id },
          data: { amountCents: 20_000, taxCents: 4_000, totalCents: 24_000 },
        }),
      );
      await wait(750);
      // The share lock generation holds is what keeps this update waiting.
      expect(update.settled()).toBe(false);

      barrier.release();
      const response = await generation;
      expect(response.status).toBe(201);
      await update.promise;

      const result = generated(response.body);
      const version = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: result.versionId },
      });
      // The committed version describes the state that was fingerprinted, not the update.
      expect(await pdfText(await storage.get(version.storageKey))).toContain('150.00 MAD');
      expect(version.sourceSnapshotSha256).toHaveLength(64);
      expect(
        (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).amountCents,
      ).toBe(20_000);
      expect(await prisma.documentVersion.count({ where: { documentId: result.documentId } })).toBe(
        1,
      );
    } finally {
      barrier.restore();
    }
  });

  it('blocks a contract terms update from committing while generation holds the source', async () => {
    const contract = await createContract(CommercialContractBusinessType.RECRUITMENT, {
      status: CommercialContractStatus.DRAFT,
    });
    const barrier = pauseAfterStabilization();

    try {
      const generation = generate(`/v1/commercial/contracts/${contract.id}/generate`);
      await barrier.reached;

      const update = settleTracker(
        prisma.commercialContract.update({
          where: { id: contract.id },
          data: { termsSummary: 'Renegotiated terms.', contractValueCents: 90_000 },
        }),
      );
      await wait(750);
      expect(update.settled()).toBe(false);

      barrier.release();
      const response = await generation;
      expect(response.status).toBe(201);
      await update.promise;

      const version = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: generated(response.body).versionId },
      });
      const drawn = await pdfText(await storage.get(version.storageKey));
      expect(drawn).toContain('Synthetic terms.');
      expect(drawn).not.toContain('Renegotiated terms.');
    } finally {
      barrier.restore();
    }
  });

  it('blocks a rendered related record from changing while generation holds the source', async () => {
    const quotation = await createQuotation();
    const barrier = pauseAfterStabilization();

    try {
      const generation = generate(`/v1/commercial/quotations/${quotation.id}/generate`);
      await barrier.reached;

      // The client name is rendered onto the output, so its row is stabilized too.
      const update = settleTracker(
        prisma.client.update({ where: { id: clientId }, data: { name: 'Gen49 Renamed Client' } }),
      );
      await wait(750);
      expect(update.settled()).toBe(false);

      barrier.release();
      const response = await generation;
      expect(response.status).toBe(201);
      await update.promise;

      const version = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: generated(response.body).versionId },
      });
      const drawn = await pdfText(await storage.get(version.storageKey));
      expect(drawn).toContain('Gen49 Client');
      expect(drawn).not.toContain('Gen49 Renamed Client');
    } finally {
      barrier.restore();
      await prisma.client.update({ where: { id: clientId }, data: { name: 'Gen49 Client' } });
    }
  });

  it('blocks a certificate participant rename while generation holds the source', async () => {
    const { program, enrollment } = await createCandidateEnrollment();
    const candidateId = (
      await prisma.trainingEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })
    ).candidateId;
    const barrier = pauseAfterStabilization();

    try {
      const generation = generate(certificatePath(program.id, enrollment.id));
      await barrier.reached;

      const update = settleTracker(
        prisma.candidate.update({
          where: { id: candidateId! },
          data: { displayName: 'Gen49 Renamed Candidate' },
        }),
      );
      await wait(750);
      expect(update.settled()).toBe(false);

      barrier.release();
      const response = await generation;
      expect(response.status).toBe(201);
      await update.promise;

      const version = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: generated(response.body).versionId },
      });
      const drawn = await pdfText(await storage.get(version.storageKey));
      expect(drawn).toContain('Gen49 Candidate');
      expect(drawn).not.toContain('Gen49 Renamed Candidate');
    } finally {
      barrier.restore();
    }
  });

  // -------------------------------------------------------------------------
  // Content fidelity
  // -------------------------------------------------------------------------

  it('keeps a long invoice line description intact in the PDF', async () => {
    const description = Array.from({ length: 90 }, (_, index) => `segment${index}`).join(' ');
    const invoice = await prisma.invoice.create({
      data: {
        reference: reference('INV'),
        clientId,
        currency: 'MAD',
        status: InvoiceStatus.ISSUED,
        issueDate: new Date(),
        issuedAt: new Date(),
        subtotalCents: 1_000,
        taxCents: 0,
        totalCents: 1_000,
        lines: {
          create: [
            {
              sortOrder: 1,
              description,
              quantity: 1,
              unitPriceCents: 1_000,
              taxRateBps: 0,
              lineSubtotalCents: 1_000,
              lineTaxCents: 0,
              lineTotalCents: 1_000,
            },
          ],
        },
      },
    });

    const result = generated(
      (await generate(`/v1/commercial/invoices/${invoice.id}/generate`)).body,
    );
    const version = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: result.versionId },
    });
    const drawn = await pdfText(await storage.get(version.storageKey));
    expect(description.length).toBeGreaterThan(500);
    expect(drawn).toContain('segment0');
    expect(drawn).toContain('segment89');
  });

  it('keeps long quotation and contract text intact in the Word output', async () => {
    const description = 'q'.repeat(900);
    const quotation = await prisma.commercialQuotation.create({
      data: {
        reference: reference('QT'),
        clientId,
        currency: 'MAD',
        status: QuotationStatus.ISSUED,
        issueDate: new Date(),
        subtotalCents: 1_000,
        taxCents: 0,
        totalCents: 1_000,
        lines: {
          create: [
            {
              sortOrder: 1,
              description,
              quantity: 1,
              unitPriceCents: 1_000,
              taxRateBps: 0,
              lineSubtotalCents: 1_000,
              lineTaxCents: 0,
              lineTotalCents: 1_000,
            },
          ],
        },
      },
    });
    const quotationResult = generated(
      (
        await generate(`/v1/commercial/quotations/${quotation.id}/generate`, {
          outputFamily: 'WORD',
        })
      ).body,
    );
    const quotationVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: quotationResult.versionId },
    });
    expect(docxXml(await storage.get(quotationVersion.storageKey))).toContain(description);

    const terms = 't'.repeat(1_200);
    const contract = await prisma.commercialContract.create({
      data: {
        reference: reference('CT'),
        businessType: CommercialContractBusinessType.TRAINING,
        clientId,
        currency: 'MAD',
        contractValueCents: 1_000,
        taxCents: 0,
        totalCents: 1_000,
        termsSummary: terms,
        status: CommercialContractStatus.ACTIVE,
      },
    });
    const contractResult = generated(
      (
        await generate(`/v1/commercial/contracts/${contract.id}/generate`, {
          outputFamily: 'WORD',
        })
      ).body,
    );
    const contractVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: contractResult.versionId },
    });
    expect(docxXml(await storage.get(contractVersion.storageKey))).toContain(terms);
  });

  it('renders French and Arabic client names in the PDF end to end', async () => {
    const ligatureClient = await prisma.client.create({
      data: { name: 'Gen49 Cœur & Œuvre', normalizedName: 'gen49 coeur oeuvre' },
    });
    const ligatureInvoice = await createInvoice({ client: ligatureClient.id });
    const ligature = await generate(`/v1/commercial/invoices/${ligatureInvoice.id}/generate`);
    expect(ligature.status).toBe(201);
    const ligatureVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: generated(ligature.body).versionId },
    });
    const ligatureText = await pdfText(await storage.get(ligatureVersion.storageKey));
    // Real Unicode, not a WinAnsi approximation and not a substitution.
    expect(ligatureText).toContain('Cœur & Œuvre');
    expect(ligatureText).not.toContain('?');

    const arabicClient = await prisma.client.create({
      data: { name: 'شركة الأطلس للتقنية', normalizedName: 'gen49 arabic client' },
    });
    const arabicInvoice = await createInvoice({ client: arabicClient.id });
    const arabic = await generate(`/v1/commercial/invoices/${arabicInvoice.id}/generate`);
    expect(arabic.status).toBe(201);
    const arabicVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: generated(arabic.body).versionId },
    });
    const arabicBytes = await storage.get(arabicVersion.storageKey);
    const arabicText = await pdfText(arabicBytes);
    expect(arabicText).not.toContain('?');
    // The Arabic face is embedded, so the name is drawn rather than boxed.
    expect(arabicBytes.toString('latin1')).toContain('NotoSansArabic');
    // The whole client name comes back as the exact source string: reading the PDF gives
    // the characters the record holds, in the order the record holds them.
    expect(arabicText).toContain('شركة الأطلس للتقنية');
    // On the page it is drawn right to left, which extraction deliberately undoes.
    const arabicVisual = [...'شركة الأطلس للتقنية'].reverse().join('');
    expect(drawnLines(arabicBytes).some((line) => line.includes(arabicVisual))).toBe(true);

    // The same name is carried faithfully by the Word output too.
    const word = await generate(`/v1/commercial/invoices/${arabicInvoice.id}/generate`, {
      outputFamily: 'WORD',
    });
    expect(word.status).toBe(201);
    const wordVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: generated(word.body).versionId },
    });
    expect(docxXml(await storage.get(wordVersion.storageKey))).toContain('شركة الأطلس للتقنية');
  });

  it('renders an Arabic participant name on a certificate end to end', async () => {
    const key = randomUUID().slice(0, 8);
    const program = await prisma.trainingProgram.create({
      data: {
        reference: `GEN49-TP-${key}`,
        normalizedReference: `gen49-tp-${key}`,
        name: 'Gen49 Program',
      },
    });
    const participantName = 'يوسف العلوي';
    const participant = await prisma.externalTrainingParticipant.create({
      data: { displayName: participantName },
    });
    const enrollment = await prisma.trainingEnrollment.create({
      data: {
        trainingProgramId: program.id,
        participantType: 'EXTERNAL',
        externalTrainingParticipantId: participant.id,
        activeParticipantKey: `EXTERNAL:${participant.id}`,
        status: TrainingEnrollmentStatus.EVALUATED,
        enrolledAt: new Date(),
        completedAt: new Date(),
        certificateStatus: CertificateStatus.PENDING,
      },
    });

    const response = await generate(certificatePath(program.id, enrollment.id));
    expect(response.status).toBe(201);
    const version = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: generated(response.body).versionId },
    });
    const bytes = await storage.get(version.storageKey);

    // Copying the certificate gives back the participant's name as the record holds it.
    expect(await pdfText(bytes)).toContain(participantName);
    // And the page draws it right to left, with the first logical word furthest right.
    const visual = [...participantName].reverse().join('');
    expect(drawnLines(bytes).some((line) => line.includes(visual))).toBe(true);
    // Generating a certificate never advances the enrollment's own certificate state.
    const after = await prisma.trainingEnrollment.findUniqueOrThrow({
      where: { id: enrollment.id },
    });
    expect(after.certificateStatus).toBe(CertificateStatus.PENDING);
  });

  it('refuses a PDF whose script no bundled font covers, and still produces the Word output', async () => {
    const scriptClient = await prisma.client.create({
      data: { name: 'Gen49 中文 客戶', normalizedName: 'gen49 uncovered script client' },
    });
    const scriptInvoice = await createInvoice({ client: scriptClient.id });

    const refused = await generate(`/v1/commercial/invoices/${scriptInvoice.id}/generate`);
    expect(refused.status).toBe(409);
    expect(errorCode(refused.body)).toBe('GENERATION_PDF_SCRIPT_UNSUPPORTED');
    expect(await prisma.document.count({ where: { invoiceId: scriptInvoice.id } })).toBe(0);

    const word = await generate(`/v1/commercial/invoices/${scriptInvoice.id}/generate`, {
      outputFamily: 'WORD',
    });
    expect(word.status).toBe(201);
    const wordVersion = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: generated(word.body).versionId },
    });
    expect(docxXml(await storage.get(wordVersion.storageKey))).toContain('Gen49 中文 客戶');
  });

  // -------------------------------------------------------------------------
  // Database invariants and audit
  // -------------------------------------------------------------------------

  it('enforces generated provenance invariants in the database', async () => {
    // A generated source may never be paired with a mismatched taxonomy.
    await expect(
      prisma.document.create({
        data: {
          title: 'Gen49 invalid taxonomy',
          documentType: DocumentType.INVOICE,
          generated: true,
          outputFamily: 'PDF',
          generatedSourceType: 'COMMERCIAL_QUOTATION',
          generatedDocumentKey: `invalid-${randomUUID()}`,
          generatedLanguage: 'fr',
          commercialQuotationId: (await createQuotation()).id,
        },
      }),
    ).rejects.toThrow(/Document_generated_taxonomy_consistent/);

    // A generated document may never name two authoritative sources.
    const quotation = await createQuotation();
    const invoice = await createInvoice();
    await expect(
      prisma.document.create({
        data: {
          title: 'Gen49 ambiguous source',
          documentType: DocumentType.QUOTATION,
          generated: true,
          outputFamily: 'PDF',
          generatedSourceType: 'COMMERCIAL_QUOTATION',
          generatedDocumentKey: `ambiguous-${randomUUID()}`,
          generatedLanguage: 'fr',
          commercialQuotationId: quotation.id,
          invoiceId: invoice.id,
        },
      }),
    ).rejects.toThrow(/Document_generated_source_consistent/);
  });

  it('audits generation with safe metadata only', async () => {
    const quotation = await createQuotation();
    const first = generated(
      (await generate(`/v1/commercial/quotations/${quotation.id}/generate`)).body,
    );
    const second = generated(
      (await generate(`/v1/commercial/quotations/${quotation.id}/generate`)).body,
    );

    const created = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'documents.generated', entityId: first.versionId },
    });
    const regenerated = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'documents.regenerated', entityId: second.versionId },
    });
    expect(created.actorUserId).toBe(generatorUserId);
    expect(regenerated.entityType).toBe('DocumentVersion');

    const version = await prisma.documentVersion.findUniqueOrThrow({
      where: { id: first.versionId },
    });
    const serialized = JSON.stringify([created, regenerated]);
    expect(serialized).toContain('commercial.quotation');
    // Never the storage key, the bytes, or any commercial amount.
    expect(serialized).not.toContain(version.storageKey);
    expect(serialized).not.toContain('24000');
    expect(serialized).not.toContain('%PDF');
  });

  it('writes no audit row for a rejected generation', async () => {
    const draft = await createQuotation({ status: QuotationStatus.DRAFT });
    const before = await prisma.auditLog.count({
      where: { action: { in: ['documents.generated', 'documents.regenerated'] } },
    });
    const rejected = await generate(`/v1/commercial/quotations/${draft.id}/generate`);
    expect(rejected.status).toBe(409);
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ['documents.generated', 'documents.regenerated'] } },
      }),
    ).toBe(before);
  });

  it('rejects a malformed generation request deterministically', async () => {
    const quotation = await createQuotation();
    for (const body of [
      { outputFamily: 'EXCEL', language: 'fr', idempotencyKey: `IDEM-${randomUUID()}` },
      { outputFamily: 'PDF', language: 'ar', idempotencyKey: `IDEM-${randomUUID()}` },
      { outputFamily: 'PDF', language: 'fr', idempotencyKey: 'short' },
      { outputFamily: 'PDF', language: 'fr' },
    ]) {
      const rejected = await api(
        generatorToken,
        `/v1/commercial/quotations/${quotation.id}/generate`,
        { method: 'POST', body },
      );
      expect(rejected.status).toBe(400);
      expect(errorCode(rejected.body)).toBe('INVALID_DOCUMENT_GENERATION_REQUEST');
    }
  });
});
