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
  ConversationDetailResponseSchema,
  ConversationListQuerySchema,
  ConversationListResponseSchema,
  DirectConversationRequestSchema,
  DirectConversationResponseSchema,
  GroupAddMembersRequestSchema,
  GroupCreateRequestSchema,
  GroupLeaveResponseSchema,
  GroupRenameRequestSchema,
  MESSAGES_CREATE_PERMISSION,
  MESSAGES_VIEW_PERMISSION,
  MessageDetailResponseSchema,
  MessageEditRequestSchema,
  MessageListQuerySchema,
  MessageListResponseSchema,
  MessageSendRequestSchema,
  MessageSendResponseSchema,
  MessagingUserOptionsQuerySchema,
  MessagingUserOptionsResponseSchema,
  ReadCursorRequestSchema,
  ReadCursorResponseSchema,
  UnreadSummaryResponseSchema,
} from '@hire-me/contracts';
import { z, type ZodTypeAny } from 'zod';

import { invalidMessagingRequest } from './messaging.errors.js';
import { MessagingService } from './messaging.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();
const VIEW = MESSAGES_VIEW_PERMISSION;
const CREATE = MESSAGES_CREATE_PERMISSION;

/**
 * Internal messaging routes (Issue #179, D-087). Reads need `messages:view`;
 * every write also needs `messages:create`, so losing `messages:view` closes all
 * of them. The guard is only the first gate: the service re-checks the internal
 * actor and active membership on every call.
 */
@Controller('v1/messages')
@UseGuards(AuthGuard, PermissionGuard)
export class MessagingController {
  constructor(@Inject(MessagingService) private readonly messaging: MessagingService) {}

  @Get('user-options')
  @RequirePermissions(VIEW, CREATE)
  async userOptions(@Query() query: unknown, @Req() request: RequestWithUser) {
    return MessagingUserOptionsResponseSchema.parse(
      await this.messaging.listUserOptions(
        this.actor(request),
        parse(MessagingUserOptionsQuerySchema, query ?? {}),
      ),
    );
  }

  @Get('unread-summary')
  @RequirePermissions(VIEW)
  async unreadSummary(@Req() request: RequestWithUser) {
    return UnreadSummaryResponseSchema.parse(
      await this.messaging.unreadSummary(this.actor(request)),
    );
  }

  @Get('conversations')
  @RequirePermissions(VIEW)
  async listConversations(@Query() query: unknown, @Req() request: RequestWithUser) {
    return ConversationListResponseSchema.parse(
      await this.messaging.listConversations(
        this.actor(request),
        parse(ConversationListQuerySchema, query ?? {}),
      ),
    );
  }

  // Literal segments are declared before `:conversationId`.
  @Post('conversations/direct')
  @RequirePermissions(VIEW, CREATE)
  async openDirect(@Body() body: unknown, @Req() request: RequestWithUser) {
    return DirectConversationResponseSchema.parse(
      await this.messaging.openDirectConversation(
        this.actor(request),
        parse(DirectConversationRequestSchema, body),
        context(request),
      ),
    );
  }

  @Post('conversations/groups')
  @RequirePermissions(VIEW, CREATE)
  async createGroup(@Body() body: unknown, @Req() request: RequestWithUser) {
    return ConversationDetailResponseSchema.parse(
      await this.messaging.createGroup(
        this.actor(request),
        parse(GroupCreateRequestSchema, body),
        context(request),
      ),
    );
  }

  @Get('conversations/:conversationId')
  @RequirePermissions(VIEW)
  async getConversation(@Param('conversationId') id: string, @Req() request: RequestWithUser) {
    return ConversationDetailResponseSchema.parse(
      await this.messaging.getConversation(this.actor(request), uuid(id)),
    );
  }

  @Get('conversations/:conversationId/messages')
  @RequirePermissions(VIEW)
  async listMessages(
    @Param('conversationId') id: string,
    @Query() query: unknown,
    @Req() request: RequestWithUser,
  ) {
    return MessageListResponseSchema.parse(
      await this.messaging.listMessages(
        this.actor(request),
        uuid(id),
        parse(MessageListQuerySchema, query ?? {}),
      ),
    );
  }

  @Post('conversations/:conversationId/messages')
  @RequirePermissions(VIEW, CREATE)
  async sendMessage(
    @Param('conversationId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    return MessageSendResponseSchema.parse(
      await this.messaging.sendMessage(
        this.actor(request),
        uuid(id),
        parse(MessageSendRequestSchema, body),
        context(request),
      ),
    );
  }

  @Get('conversations/:conversationId/messages/:messageId')
  @RequirePermissions(VIEW)
  async getMessage(
    @Param('conversationId') id: string,
    @Param('messageId') messageId: string,
    @Req() request: RequestWithUser,
  ) {
    return MessageDetailResponseSchema.parse(
      await this.messaging.getMessage(this.actor(request), uuid(id), uuid(messageId)),
    );
  }

  @Patch('conversations/:conversationId/messages/:messageId')
  @RequirePermissions(VIEW, CREATE)
  async editMessage(
    @Param('conversationId') id: string,
    @Param('messageId') messageId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    return MessageDetailResponseSchema.parse(
      await this.messaging.editMessage(
        this.actor(request),
        uuid(id),
        uuid(messageId),
        parse(MessageEditRequestSchema, body),
        context(request),
      ),
    );
  }

  @Post('conversations/:conversationId/messages/:messageId/withdraw')
  @RequirePermissions(VIEW, CREATE)
  async withdrawMessage(
    @Param('conversationId') id: string,
    @Param('messageId') messageId: string,
    @Req() request: RequestWithUser,
  ) {
    return MessageDetailResponseSchema.parse(
      await this.messaging.withdrawMessage(
        this.actor(request),
        uuid(id),
        uuid(messageId),
        context(request),
      ),
    );
  }

  @Post('conversations/:conversationId/read')
  @RequirePermissions(VIEW)
  async markRead(
    @Param('conversationId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    return ReadCursorResponseSchema.parse(
      await this.messaging.markRead(
        this.actor(request),
        uuid(id),
        parse(ReadCursorRequestSchema, body),
      ),
    );
  }

  @Patch('groups/:conversationId')
  @RequirePermissions(VIEW, CREATE)
  async renameGroup(
    @Param('conversationId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    return ConversationDetailResponseSchema.parse(
      await this.messaging.renameGroup(
        this.actor(request),
        uuid(id),
        parse(GroupRenameRequestSchema, body),
        context(request),
      ),
    );
  }

  @Post('groups/:conversationId/members')
  @RequirePermissions(VIEW, CREATE)
  async addMembers(
    @Param('conversationId') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    return ConversationDetailResponseSchema.parse(
      await this.messaging.addGroupMembers(
        this.actor(request),
        uuid(id),
        parse(GroupAddMembersRequestSchema, body),
        context(request),
      ),
    );
  }

  @Post('groups/:conversationId/members/:userId/remove')
  @RequirePermissions(VIEW, CREATE)
  async removeMember(
    @Param('conversationId') id: string,
    @Param('userId') userId: string,
    @Req() request: RequestWithUser,
  ) {
    return ConversationDetailResponseSchema.parse(
      await this.messaging.removeGroupMember(
        this.actor(request),
        uuid(id),
        uuid(userId),
        context(request),
      ),
    );
  }

  @Post('groups/:conversationId/members/:userId/promote')
  @RequirePermissions(VIEW, CREATE)
  async promoteMember(
    @Param('conversationId') id: string,
    @Param('userId') userId: string,
    @Req() request: RequestWithUser,
  ) {
    return ConversationDetailResponseSchema.parse(
      await this.messaging.promoteGroupMember(
        this.actor(request),
        uuid(id),
        uuid(userId),
        context(request),
      ),
    );
  }

  @Post('groups/:conversationId/leave')
  @RequirePermissions(VIEW, CREATE)
  async leaveGroup(@Param('conversationId') id: string, @Req() request: RequestWithUser) {
    return GroupLeaveResponseSchema.parse(
      await this.messaging.leaveGroup(this.actor(request), uuid(id), context(request)),
    );
  }

  @Post('groups/:conversationId/archive')
  @RequirePermissions(VIEW, CREATE)
  async archiveGroup(@Param('conversationId') id: string, @Req() request: RequestWithUser) {
    return ConversationDetailResponseSchema.parse(
      await this.messaging.archiveGroup(this.actor(request), uuid(id), context(request)),
    );
  }

  private actor(request: RequestWithUser): string {
    return request.user!.id;
  }
}

function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw invalidMessagingRequest();
  }
  return parsed.data;
}

/** Rejected on format alone, before any lookup, so it says nothing about records. */
function uuid(value: string): string {
  const parsed = UuidParamSchema.safeParse(value);
  if (!parsed.success) {
    throw invalidMessagingRequest();
  }
  return parsed.data.toLowerCase();
}

function context(request: RequestWithUser): RequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip ?? request.socket?.remoteAddress,
    userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
  };
}
