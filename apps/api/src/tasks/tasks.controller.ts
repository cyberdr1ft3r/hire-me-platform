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
  NotificationDetailResponseSchema,
  NotificationListResponseSchema,
  NotificationListQuerySchema,
  NotificationReadAllRequestSchema,
  NotificationReadAllResponseSchema,
  TaskAssignmentCreateRequestSchema,
  TaskAssignmentRemoveRequestSchema,
  TaskCommentCreateRequestSchema,
  TaskCommentDetailResponseSchema,
  TaskCommentUpdateRequestSchema,
  TaskCreateRequestSchema,
  TaskDetailResponseSchema,
  TaskListResponseSchema,
  TaskListQuerySchema,
  TaskOwnerChangeRequestSchema,
  TaskReminderCreateRequestSchema,
  TaskReminderDetailResponseSchema,
  TaskReminderProcessRequestSchema,
  TaskReminderProcessResponseSchema,
  TaskReminderUpdateRequestSchema,
  TaskStatusChangeRequestSchema,
  TaskUpdateRequestSchema,
} from '@hire-me/contracts';
import { z } from 'zod';

import { TASK_PERMISSIONS } from './task-permissions.js';
import { badRequest } from './task.errors.js';
import { TasksService } from './tasks.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestContext, RequestWithUser } from '../auth/auth.types.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';

const UuidParamSchema = z.string().uuid();

@Controller('v1/tasks')
@UseGuards(AuthGuard, PermissionGuard)
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}

  @Get()
  @RequirePermissions(TASK_PERMISSIONS.TASKS_VIEW)
  async listTasks(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = TaskListQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_LIST_QUERY', 'Invalid task list query.');
    }
    return TaskListResponseSchema.parse(await this.tasks.listTasks(request.user!.id, parsed.data));
  }

  @Post()
  @RequirePermissions(TASK_PERMISSIONS.TASKS_CREATE)
  async createTask(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = TaskCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_CREATE_REQUEST', 'Invalid task create request.');
    }
    return TaskDetailResponseSchema.parse(
      await this.tasks.createTask(parsed.data, request.user!.id, this.getContext(request)),
    );
  }

  @Get(':taskId')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_VIEW)
  async getTask(@Param('taskId') taskId: string, @Req() request: RequestWithUser) {
    return TaskDetailResponseSchema.parse(
      await this.tasks.getTask(this.uuid(taskId), request.user!.id),
    );
  }

  @Patch(':taskId')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_UPDATE)
  async updateTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_UPDATE_REQUEST', 'Invalid task update request.');
    }
    return TaskDetailResponseSchema.parse(
      await this.tasks.updateTask(
        this.uuid(taskId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/owner')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_ASSIGN)
  async changeOwner(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskOwnerChangeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_OWNER_CHANGE_REQUEST', 'Invalid owner change request.');
    }
    return TaskDetailResponseSchema.parse(
      await this.tasks.changeOwner(
        this.uuid(taskId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/assignments')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_ASSIGN)
  async addAssignment(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskAssignmentCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_ASSIGNMENT_REQUEST', 'Invalid task assignment request.');
    }
    return TaskDetailResponseSchema.parse(
      await this.tasks.addAssignment(
        this.uuid(taskId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/assignments/:assignmentId/remove')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_ASSIGN)
  async removeAssignment(
    @Param('taskId') taskId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskAssignmentRemoveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TASK_ASSIGNMENT_REMOVE_REQUEST',
        'Invalid assignment removal request.',
      );
    }
    return TaskDetailResponseSchema.parse(
      await this.tasks.removeAssignment(
        this.uuid(taskId),
        this.uuid(assignmentId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/status')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_TRANSITION)
  async transitionTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskStatusChangeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_STATUS_REQUEST', 'Invalid task status request.');
    }
    return TaskDetailResponseSchema.parse(
      await this.tasks.transitionTask(
        this.uuid(taskId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/complete')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_TRANSITION)
  async completeTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskStatusChangeRequestSchema.partial({ status: true }).safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_COMPLETE_REQUEST', 'Invalid task completion request.');
    }
    return TaskDetailResponseSchema.parse(
      await this.tasks.completeTask(
        this.uuid(taskId),
        { status: 'COMPLETED', reason: parsed.data.reason },
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/cancel')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_TRANSITION)
  async cancelTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskStatusChangeRequestSchema.partial({ status: true }).safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_CANCEL_REQUEST', 'Invalid task cancel request.');
    }
    return TaskDetailResponseSchema.parse(
      await this.tasks.cancelTask(
        this.uuid(taskId),
        { status: 'CANCELED', reason: parsed.data.reason },
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/archive')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_ARCHIVE)
  async archiveTask(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskStatusChangeRequestSchema.partial({ status: true }).safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_ARCHIVE_REQUEST', 'Invalid task archive request.');
    }
    return TaskDetailResponseSchema.parse(
      await this.tasks.archiveTask(
        this.uuid(taskId),
        { status: 'ARCHIVED', reason: parsed.data.reason },
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/comments')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_COMMENT)
  async createComment(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskCommentCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_COMMENT_REQUEST', 'Invalid task comment request.');
    }
    return TaskCommentDetailResponseSchema.parse(
      await this.tasks.createComment(
        this.uuid(taskId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch(':taskId/comments/:commentId')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_COMMENT)
  async updateComment(
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskCommentUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TASK_COMMENT_UPDATE_REQUEST',
        'Invalid task comment update request.',
      );
    }
    return TaskCommentDetailResponseSchema.parse(
      await this.tasks.updateComment(
        this.uuid(taskId),
        this.uuid(commentId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/comments/:commentId/archive')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_COMMENT)
  async archiveComment(
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Req() request: RequestWithUser,
  ) {
    return TaskCommentDetailResponseSchema.parse(
      await this.tasks.archiveComment(
        this.uuid(taskId),
        this.uuid(commentId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/reminders')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_REMINDERS_MANAGE)
  async createReminder(
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskReminderCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_REMINDER_REQUEST', 'Invalid task reminder request.');
    }
    return TaskReminderDetailResponseSchema.parse(
      await this.tasks.createReminder(
        this.uuid(taskId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Patch(':taskId/reminders/:reminderId')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_REMINDERS_MANAGE)
  async updateReminder(
    @Param('taskId') taskId: string,
    @Param('reminderId') reminderId: string,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const parsed = TaskReminderUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('INVALID_TASK_REMINDER_UPDATE_REQUEST', 'Invalid reminder update request.');
    }
    return TaskReminderDetailResponseSchema.parse(
      await this.tasks.updateReminder(
        this.uuid(taskId),
        this.uuid(reminderId),
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':taskId/reminders/:reminderId/cancel')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_REMINDERS_MANAGE)
  async cancelReminder(
    @Param('taskId') taskId: string,
    @Param('reminderId') reminderId: string,
    @Req() request: RequestWithUser,
  ) {
    return TaskReminderDetailResponseSchema.parse(
      await this.tasks.cancelReminder(
        this.uuid(taskId),
        this.uuid(reminderId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post('reminders/process-due')
  @RequirePermissions(TASK_PERMISSIONS.TASKS_REMINDERS_MANAGE)
  async processDueReminders(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = TaskReminderProcessRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw badRequest(
        'INVALID_TASK_REMINDER_PROCESS_REQUEST',
        'Invalid reminder process request.',
      );
    }
    return TaskReminderProcessResponseSchema.parse(
      await this.tasks.processDueReminders(parsed.data, request.user!.id),
    );
  }

  private uuid(value: string): string {
    const parsed = UuidParamSchema.safeParse(value);
    if (!parsed.success) {
      throw badRequest('INVALID_UUID', 'Invalid UUID parameter.');
    }
    return parsed.data;
  }

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress,
      userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
    };
  }
}

@Controller('v1/notifications')
@UseGuards(AuthGuard, PermissionGuard)
export class NotificationsController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}

  @Get()
  @RequirePermissions(TASK_PERMISSIONS.NOTIFICATIONS_VIEW_OWN)
  async listNotifications(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = NotificationListQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw badRequest('INVALID_NOTIFICATION_LIST_QUERY', 'Invalid notification list query.');
    }
    return NotificationListResponseSchema.parse(
      await this.tasks.listNotifications(request.user!.id, parsed.data),
    );
  }

  @Post('read-all')
  @RequirePermissions(TASK_PERMISSIONS.NOTIFICATIONS_UPDATE_OWN)
  async markAllRead(@Body() body: unknown, @Req() request: RequestWithUser) {
    const parsed = NotificationReadAllRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw badRequest(
        'INVALID_NOTIFICATION_READ_ALL_REQUEST',
        'Invalid notification read-all request.',
      );
    }
    return NotificationReadAllResponseSchema.parse(
      await this.tasks.markVisibleNotificationsRead(
        parsed.data,
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':notificationId/read')
  @RequirePermissions(TASK_PERMISSIONS.NOTIFICATIONS_UPDATE_OWN)
  async markRead(@Param('notificationId') notificationId: string, @Req() request: RequestWithUser) {
    return NotificationDetailResponseSchema.parse(
      await this.tasks.markNotificationRead(
        this.uuid(notificationId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  @Post(':notificationId/archive')
  @RequirePermissions(TASK_PERMISSIONS.NOTIFICATIONS_UPDATE_OWN)
  async archive(@Param('notificationId') notificationId: string, @Req() request: RequestWithUser) {
    return NotificationDetailResponseSchema.parse(
      await this.tasks.archiveNotification(
        this.uuid(notificationId),
        request.user!.id,
        this.getContext(request),
      ),
    );
  }

  private uuid(value: string): string {
    const parsed = UuidParamSchema.safeParse(value);
    if (!parsed.success) {
      throw badRequest('INVALID_UUID', 'Invalid UUID parameter.');
    }
    return parsed.data;
  }

  private getContext(request: RequestWithUser): RequestContext {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip ?? request.socket?.remoteAddress,
      userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
    };
  }
}
