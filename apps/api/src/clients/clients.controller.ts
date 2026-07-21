import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ClientContactCreateRequestSchema,
  ClientContactDetailResponseSchema,
  ClientContactListQuerySchema,
  ClientContactListResponseSchema,
  ClientContactStatusUpdateRequestSchema,
  ClientContactUpdateRequestSchema,
  ClientCreateRequestSchema,
  ClientDetailResponseSchema,
  ClientListQuerySchema,
  ClientListResponseSchema,
  ClientStatusUpdateRequestSchema,
  ClientUpdateRequestSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { CLIENT_PERMISSIONS } from './client-permissions.js';
import { badRequest } from './client.errors.js';
import { ClientsService } from './clients.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

@Controller('v1/clients')
@UseGuards(AuthGuard, PermissionGuard)
export class ClientsController {
  private readonly clients: ClientsService;

  constructor(@Inject(ClientsService) clients: ClientsService) {
    this.clients = clients;
  }

  @Get()
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENTS_VIEW)
  async listClients(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = ClientListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_CLIENT_LIST_QUERY', 'Invalid client list query.');
    }

    return ClientListResponseSchema.parse(
      await this.clients.listClients(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Post()
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENTS_CREATE)
  async createClient(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = ClientCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_CLIENT_REQUEST', 'Invalid create client request.');
    }

    return ClientDetailResponseSchema.parse(
      await this.clients.createClient(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Get(':clientId')
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENTS_VIEW)
  async getClient(@Param('clientId') clientId: string, @Req() request: RequestWithUser) {
    return ClientDetailResponseSchema.parse(
      await this.clients.getClient(this.uuid(clientId), request.user!.id, this.getContext(request)),
    );
  }

  @Patch(':clientId')
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENTS_UPDATE)
  async updateClient(
    @Param('clientId') clientId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = ClientUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_UPDATE_CLIENT_REQUEST', 'Invalid update client request.');
    }

    return ClientDetailResponseSchema.parse(
      await this.clients.updateClient(
        this.uuid(clientId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch(':clientId/status')
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENTS_STATUS_MANAGE)
  async updateClientStatus(
    @Param('clientId') clientId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = ClientStatusUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CLIENT_STATUS_REQUEST', 'Invalid client status request.');
    }

    return ClientDetailResponseSchema.parse(
      await this.clients.updateClientStatus(
        this.uuid(clientId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':clientId/archive')
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENTS_ARCHIVE)
  async archiveClient(@Param('clientId') clientId: string, @Req() request: RequestWithUser) {
    return ClientDetailResponseSchema.parse(
      await this.clients.archiveClient(
        this.uuid(clientId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':clientId/contacts')
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENT_CONTACTS_VIEW)
  async listContacts(@Param('clientId') clientId: string, @Query() query: unknown) {
    const parsed = ClientContactListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw badRequest('INVALID_CLIENT_CONTACT_LIST_QUERY', 'Invalid client contact list query.');
    }

    return ClientContactListResponseSchema.parse(
      await this.clients.listContacts(this.uuid(clientId), parsed.data),
    );
  }

  @Post(':clientId/contacts')
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENT_CONTACTS_CREATE)
  async createContact(
    @Param('clientId') clientId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = ClientContactCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CREATE_CLIENT_CONTACT_REQUEST', 'Invalid create contact request.');
    }

    return ClientContactDetailResponseSchema.parse(
      await this.clients.createContact(
        this.uuid(clientId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Get(':clientId/contacts/:contactId')
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENT_CONTACTS_VIEW)
  async getContact(@Param('clientId') clientId: string, @Param('contactId') contactId: string) {
    return ClientContactDetailResponseSchema.parse(
      await this.clients.getContact(this.uuid(clientId), this.uuid(contactId)),
    );
  }

  @Patch(':clientId/contacts/:contactId')
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENT_CONTACTS_UPDATE)
  async updateContact(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = ClientContactUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_UPDATE_CLIENT_CONTACT_REQUEST', 'Invalid update contact request.');
    }

    return ClientContactDetailResponseSchema.parse(
      await this.clients.updateContact(
        this.uuid(clientId),
        this.uuid(contactId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch(':clientId/contacts/:contactId/status')
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENT_CONTACTS_STATUS_MANAGE)
  async updateContactStatus(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = ClientContactStatusUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_CLIENT_CONTACT_STATUS_REQUEST', 'Invalid contact status request.');
    }

    return ClientContactDetailResponseSchema.parse(
      await this.clients.updateContactStatus(
        this.uuid(clientId),
        this.uuid(contactId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':clientId/contacts/:contactId/archive')
  @RequirePermissions(CLIENT_PERMISSIONS.CLIENT_CONTACTS_ARCHIVE)
  async archiveContact(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @Req() request: RequestWithUser,
  ) {
    return ClientContactDetailResponseSchema.parse(
      await this.clients.archiveContact(
        this.uuid(clientId),
        this.uuid(contactId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  private uuid(value: string): string {
    const parsed = UuidParamSchema.safeParse(value);
    if (!parsed.success) {
      throw badRequest('INVALID_UUID', 'Invalid identifier.');
    }

    return parsed.data;
  }

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? 'unknown',
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
