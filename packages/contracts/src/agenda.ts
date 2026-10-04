import { z } from 'zod';

import { TaskPrioritySchema } from './tasks.js';

export const AgendaSourceTypeSchema = z.enum([
  'task',
  'interview',
  'meeting',
  'training',
  'follow_up',
]);

export const AgendaViewSchema = z.enum(['today', 'week', 'month', 'upcoming', 'overdue', 'past']);

const QuerySourcesSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return value;
}, z.array(AgendaSourceTypeSchema).optional());

export const AgendaListQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  view: AgendaViewSchema.optional(),
  sources: QuerySourcesSchema,
});

export const AgendaItemSchema = z.object({
  id: z.string(),
  sourceType: AgendaSourceTypeSchema,
  sourceId: z.string().uuid(),
  title: z.string(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
  timezone: z.string().optional(),
  status: z.string(),
  priority: TaskPrioritySchema.optional(),
  allDay: z.boolean(),
  deepLink: z.string(),
  overdue: z.boolean().optional(),
});

export const AgendaListResponseSchema = z.object({
  items: z.array(AgendaItemSchema),
  window: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    view: AgendaViewSchema.optional(),
  }),
});

export type AgendaSourceType = z.infer<typeof AgendaSourceTypeSchema>;
export type AgendaView = z.infer<typeof AgendaViewSchema>;
export type AgendaListQuery = z.infer<typeof AgendaListQuerySchema>;
export type AgendaItem = z.infer<typeof AgendaItemSchema>;
export type AgendaListResponse = z.infer<typeof AgendaListResponseSchema>;
