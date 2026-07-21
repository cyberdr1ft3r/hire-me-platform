import { Inject, Injectable } from '@nestjs/common';
import type {
  ClientContactCreateRequest,
  ClientContactDetailResponse,
  ClientContactListQuery,
  ClientContactListResponse,
  ClientContactStatusUpdateRequest,
  ClientContactUpdateRequest,
  ClientCreateRequest,
  ClientDetailResponse,
  ClientListQuery,
  ClientListResponse,
  ClientStatusUpdateRequest,
  ClientUpdateRequest,
} from '@hire-me/contracts';

import { ClientAuditService } from './client-audit.service.js';
import { CLIENT_PERMISSIONS } from './client-permissions.js';
import { conflict, forbidden, notFound } from './client.errors.js';
import type { RequestContext } from '../auth/auth.types.js';
import { normalizeEmail } from '../auth/normalize-email.js';
import { PermissionsService } from '../auth/permissions.service.js';
import {
  ClientContactStatus,
  ClientStatus,
  PortalAccessStatus,
  Prisma,
} from '../persistence/prisma/generated-client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';

type ClientRecord = Prisma.ClientGetPayload<Record<string, never>>;
type ContactRecord = Prisma.ClientContactGetPayload<Record<string, never>>;
type PrismaTransaction = Prisma.TransactionClient;

@Injectable()
export class ClientsService {
  private readonly audit: ClientAuditService;
  private readonly permissions: PermissionsService;
  private readonly prisma: PrismaService;

  constructor(
    @Inject(ClientAuditService) audit: ClientAuditService,
    @Inject(PermissionsService) permissions: PermissionsService,
    @Inject(PrismaService) prisma: PrismaService,
  ) {
    this.audit = audit;
    this.permissions = permissions;
    this.prisma = prisma;
  }

  async listClients(
    query: ClientListQuery,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ClientListResponse> {
    const includeCommercial = await this.canAccessCommercialData(actorUserId);
    const where: Prisma.ClientWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.industry ? { industry: { equals: query.industry, mode: 'insensitive' } } : {}),
      ...(query.country ? { country: { equals: query.country, mode: 'insensitive' } } : {}),
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { normalizedName: { contains: normalizeName(query.search) } },
              { industry: { contains: query.search, mode: 'insensitive' } },
              { country: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, clients] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    if (includeCommercial && clients.length > 0) {
      await this.recordCommercialAccess(actorUserId, context);
    }

    return {
      clients: clients.map((client) => this.toClientSummary(client, includeCommercial)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }

  async getClient(
    clientId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ClientDetailResponse> {
    const includeCommercial = await this.canAccessCommercialData(actorUserId);
    const client = await this.findClient(clientId);

    if (includeCommercial) {
      await this.recordCommercialAccess(actorUserId, context, client.id);
    }

    return { client: this.toClientSummary(client, includeCommercial) };
  }

  async createClient(
    input: ClientCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ClientDetailResponse> {
    const includeCommercial = await this.canAccessCommercialData(actorUserId);
    this.assertCommercialInputAllowed(input, includeCommercial);

    const client = await this.prisma.client.create({
      data: {
        name: input.name,
        normalizedName: normalizeName(input.name),
        status: input.status ?? ClientStatus.PROSPECT,
        industry: optional(input.industry),
        website: optional(input.website),
        mainPhone: optional(input.mainPhone),
        country: optional(input.country),
        city: optional(input.city),
        commercialOwnerUserId: input.commercialOwnerUserId,
        commercialSummary: optional(input.commercialSummary),
      },
    });

    await this.audit.record('clients.client.created', context, {
      actorUserId,
      entityType: 'Client',
      entityId: client.id,
      metadataSummary: 'Client organization created.',
    });

    return { client: this.toClientSummary(client, includeCommercial) };
  }

  async updateClient(
    clientId: string,
    input: ClientUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ClientDetailResponse> {
    const includeCommercial = await this.canAccessCommercialData(actorUserId);
    this.assertCommercialInputAllowed(input, includeCommercial);
    await this.ensureWritableClient(clientId);

    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: {
        ...(input.name !== undefined
          ? { name: input.name, normalizedName: normalizeName(input.name) }
          : {}),
        ...(input.industry !== undefined ? { industry: nullable(input.industry) } : {}),
        ...(input.website !== undefined ? { website: nullable(input.website) } : {}),
        ...(input.mainPhone !== undefined ? { mainPhone: nullable(input.mainPhone) } : {}),
        ...(input.country !== undefined ? { country: nullable(input.country) } : {}),
        ...(input.city !== undefined ? { city: nullable(input.city) } : {}),
        ...(input.commercialOwnerUserId !== undefined
          ? { commercialOwnerUserId: input.commercialOwnerUserId }
          : {}),
        ...(input.commercialSummary !== undefined
          ? { commercialSummary: nullable(input.commercialSummary) }
          : {}),
      },
    });

    await this.audit.record('clients.client.updated', context, {
      actorUserId,
      entityType: 'Client',
      entityId: client.id,
      metadataSummary: 'Approved client organization fields updated.',
    });

    return { client: this.toClientSummary(client, includeCommercial) };
  }

  async updateClientStatus(
    clientId: string,
    input: ClientStatusUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ClientDetailResponse> {
    const includeCommercial = await this.canAccessCommercialData(actorUserId);
    const existing = await this.ensureWritableClient(clientId);

    if (input.status === ClientStatus.ARCHIVED) {
      throw conflict('CLIENT_ARCHIVE_ENDPOINT_REQUIRED', 'Use the archive endpoint for archival.');
    }
    if (!isAllowedClientTransition(existing.status, input.status)) {
      throw conflict(
        'CLIENT_STATUS_TRANSITION_BLOCKED',
        'Client status transition is not allowed.',
      );
    }

    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: { status: input.status },
    });

    await this.audit.record('clients.client.status_updated', context, {
      actorUserId,
      entityType: 'Client',
      entityId: client.id,
      metadataSummary: `Client status changed to ${input.status}.`,
    });

    return { client: this.toClientSummary(client, includeCommercial) };
  }

  async archiveClient(
    clientId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ClientDetailResponse> {
    const includeCommercial = await this.canAccessCommercialData(actorUserId);
    const now = new Date();
    const client = await this.prisma.$transaction(async (transaction) => {
      await this.ensureWritableClient(clientId, transaction);
      const archived = await transaction.client.update({
        where: { id: clientId },
        data: { status: ClientStatus.ARCHIVED, archivedAt: now },
      });
      await transaction.clientContact.updateMany({
        where: { clientId, status: { not: ClientContactStatus.ARCHIVED } },
        data: {
          status: ClientContactStatus.ARCHIVED,
          portalStatus: PortalAccessStatus.ARCHIVED,
          archivedAt: now,
        },
      });

      return archived;
    });

    await this.audit.record('clients.client.archived', context, {
      actorUserId,
      entityType: 'Client',
      entityId: client.id,
      metadataSummary: 'Client organization archived with related active contacts archived.',
    });

    return { client: this.toClientSummary(client, includeCommercial) };
  }

  async listContacts(
    clientId: string,
    query: ClientContactListQuery,
  ): Promise<ClientContactListResponse> {
    await this.findClient(clientId);
    const where: Prisma.ClientContactWhereInput = {
      clientId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { normalizedEmail: { contains: normalizeEmail(query.search) } },
              { roleTitle: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, contacts] = await this.prisma.$transaction([
      this.prisma.clientContact.count({ where }),
      this.prisma.clientContact.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      contacts: contacts.map((contact) => this.toContactSummary(contact)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }

  async getContact(clientId: string, contactId: string): Promise<ClientContactDetailResponse> {
    const contact = await this.findContactForClient(clientId, contactId);
    return { contact: this.toContactSummary(contact) };
  }

  async createContact(
    clientId: string,
    input: ClientContactCreateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ClientContactDetailResponse> {
    await this.ensureWritableClient(clientId);

    try {
      const contact = await this.prisma.clientContact.create({
        data: {
          clientId,
          displayName: input.displayName,
          email: input.email.trim(),
          normalizedEmail: normalizeEmail(input.email),
          phone: optional(input.phone),
          roleTitle: optional(input.roleTitle),
          status: input.status ?? ClientContactStatus.ACTIVE,
          portalStatus: PortalAccessStatus.DISABLED,
        },
      });

      await this.audit.record('clients.contact.created', context, {
        actorUserId,
        entityType: 'ClientContact',
        entityId: contact.id,
        metadataSummary: 'Client contact created.',
      });

      return { contact: this.toContactSummary(contact) };
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw conflict(
          'CLIENT_CONTACT_EMAIL_ALREADY_EXISTS',
          'A contact with that email already exists for this client.',
        );
      }
      throw error;
    }
  }

  async updateContact(
    clientId: string,
    contactId: string,
    input: ClientContactUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ClientContactDetailResponse> {
    await this.ensureWritableClient(clientId);
    const existing = await this.findContactForClient(clientId, contactId);
    if (existing.status === ClientContactStatus.ARCHIVED) {
      throw conflict('CLIENT_CONTACT_ARCHIVED', 'Archived contacts cannot be updated.');
    }

    try {
      const contact = await this.prisma.clientContact.update({
        where: { id: contactId },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.email !== undefined
            ? { email: input.email.trim(), normalizedEmail: normalizeEmail(input.email) }
            : {}),
          ...(input.phone !== undefined ? { phone: nullable(input.phone) } : {}),
          ...(input.roleTitle !== undefined ? { roleTitle: nullable(input.roleTitle) } : {}),
        },
      });

      await this.audit.record('clients.contact.updated', context, {
        actorUserId,
        entityType: 'ClientContact',
        entityId: contact.id,
        metadataSummary: 'Approved client contact fields updated.',
      });

      return { contact: this.toContactSummary(contact) };
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw conflict(
          'CLIENT_CONTACT_EMAIL_ALREADY_EXISTS',
          'A contact with that email already exists for this client.',
        );
      }
      throw error;
    }
  }

  async updateContactStatus(
    clientId: string,
    contactId: string,
    input: ClientContactStatusUpdateRequest,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ClientContactDetailResponse> {
    await this.ensureWritableClient(clientId);
    const existing = await this.findContactForClient(clientId, contactId);

    if (input.status === ClientContactStatus.ARCHIVED) {
      throw conflict('CLIENT_CONTACT_ARCHIVE_ENDPOINT_REQUIRED', 'Use the archive endpoint.');
    }
    if (existing.status === ClientContactStatus.ARCHIVED) {
      throw conflict('CLIENT_CONTACT_ARCHIVED', 'Archived contacts cannot be reactivated.');
    }

    const contact = await this.prisma.clientContact.update({
      where: { id: contactId },
      data: { status: input.status },
    });

    await this.audit.record('clients.contact.status_updated', context, {
      actorUserId,
      entityType: 'ClientContact',
      entityId: contact.id,
      metadataSummary: `Client contact status changed to ${input.status}.`,
    });

    return { contact: this.toContactSummary(contact) };
  }

  async archiveContact(
    clientId: string,
    contactId: string,
    actorUserId: string,
    context: RequestContext,
  ): Promise<ClientContactDetailResponse> {
    await this.ensureWritableClient(clientId);
    const existing = await this.findContactForClient(clientId, contactId);
    if (existing.status === ClientContactStatus.ARCHIVED) {
      throw conflict('CLIENT_CONTACT_ARCHIVED', 'Client contact is already archived.');
    }

    const contact = await this.prisma.clientContact.update({
      where: { id: contactId },
      data: {
        status: ClientContactStatus.ARCHIVED,
        portalStatus: PortalAccessStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });

    await this.audit.record('clients.contact.archived', context, {
      actorUserId,
      entityType: 'ClientContact',
      entityId: contact.id,
      metadataSummary: 'Client contact archived.',
    });

    return { contact: this.toContactSummary(contact) };
  }

  private async findClient(
    clientId: string,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<ClientRecord> {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      throw notFound('CLIENT_NOT_FOUND', 'Client was not found.');
    }

    return client;
  }

  private async ensureWritableClient(
    clientId: string,
    prisma: PrismaService | PrismaTransaction = this.prisma,
  ): Promise<ClientRecord> {
    const client = await this.findClient(clientId, prisma);
    if (client.status === ClientStatus.ARCHIVED || client.archivedAt) {
      throw conflict('CLIENT_ARCHIVED', 'Archived clients cannot be changed.');
    }

    return client;
  }

  private async findContactForClient(clientId: string, contactId: string): Promise<ContactRecord> {
    const contact = await this.prisma.clientContact.findFirst({
      where: { id: contactId, clientId },
    });
    if (!contact) {
      throw notFound('CLIENT_CONTACT_NOT_FOUND', 'Client contact was not found.');
    }

    return contact;
  }

  private async canAccessCommercialData(actorUserId: string): Promise<boolean> {
    const permissions = await this.permissions.getEffectivePermissionCodes(actorUserId);
    return permissions.includes(CLIENT_PERMISSIONS.COMMERCIAL_DATA_ACCESS);
  }

  private assertCommercialInputAllowed(
    input: ClientCreateRequest | ClientUpdateRequest,
    includeCommercial: boolean,
  ): void {
    if (!includeCommercial && ('commercialOwnerUserId' in input || 'commercialSummary' in input)) {
      throw forbidden(
        'COMMERCIAL_PERMISSION_REQUIRED',
        'Commercial client fields require commercial_data:access.',
      );
    }
  }

  private async recordCommercialAccess(
    actorUserId: string,
    context: RequestContext,
    clientId?: string,
  ): Promise<void> {
    await this.audit.record('clients.commercial_fields.viewed', context, {
      actorUserId,
      entityType: 'Client',
      entityId: clientId,
      metadataSummary: 'Commercial client fields included in response.',
    });
  }

  private toClientSummary(client: ClientRecord, includeCommercial: boolean) {
    return {
      id: client.id,
      name: client.name,
      normalizedName: client.normalizedName,
      status: client.status,
      industry: client.industry,
      website: client.website,
      mainPhone: client.mainPhone,
      country: client.country,
      city: client.city,
      commercial: includeCommercial
        ? {
            commercialOwnerUserId: client.commercialOwnerUserId,
            commercialSummary: client.commercialSummary,
          }
        : null,
      archivedAt: isoOrNull(client.archivedAt),
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    };
  }

  private toContactSummary(contact: ContactRecord) {
    return {
      id: contact.id,
      clientId: contact.clientId,
      displayName: contact.displayName,
      email: contact.email,
      normalizedEmail: contact.normalizedEmail,
      phone: contact.phone,
      roleTitle: contact.roleTitle,
      status: contact.status,
      portalStatus: contact.portalStatus,
      archivedAt: isoOrNull(contact.archivedAt),
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function optional(value: string | undefined): string | undefined {
  return value?.trim();
}

function nullable(value: string | null): string | null {
  return value === null ? null : value.trim();
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isAllowedClientTransition(from: ClientStatus, to: ClientStatus): boolean {
  if (from === to) {
    return true;
  }

  return (
    (from === ClientStatus.PROSPECT && to === ClientStatus.ACTIVE) ||
    (from === ClientStatus.ACTIVE && to === ClientStatus.INACTIVE) ||
    (from === ClientStatus.INACTIVE && to === ClientStatus.ACTIVE)
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
