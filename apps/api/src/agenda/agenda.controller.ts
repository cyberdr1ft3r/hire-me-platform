import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { AgendaListQuerySchema, AgendaListResponseSchema } from '@hire-me/contracts';

import { AgendaService } from './agenda.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { RequestWithUser } from '../auth/auth.types.js';
import { badRequest } from '../meetings/meeting.errors.js';

@Controller('v1/agenda')
@UseGuards(AuthGuard)
export class AgendaController {
  constructor(@Inject(AgendaService) private readonly agenda: AgendaService) {}

  @Get()
  async listAgenda(@Query() query: unknown, @Req() request: RequestWithUser) {
    const parsed = AgendaListQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throw badRequest('INVALID_AGENDA_LIST_QUERY', 'Invalid agenda list query.');
    }
    return AgendaListResponseSchema.parse(
      await this.agenda.listAgenda(request.user!.id, parsed.data),
    );
  }
}
