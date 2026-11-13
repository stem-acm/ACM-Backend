import { z } from 'zod';

export const LOG_TYPES = [
  'user.created',
  'user.profile_updated',
  'user.password_changed',
  'user.role_changed',
  'user.activation_changed',
  'role_policy.created',
  'role_policy.permissions_changed',
  'role_policy.activation_changed',
  'member.created',
  'member.updated',
  'member.deleted',
  'activity.created',
  'activity.updated',
  'activity.deleted',
  'checkin.deleted',
  'checkin.cascade_deleted',
  'volunteer.created',
  'volunteer.updated',
  'volunteer.deleted',
  'volunteer.cascade_deleted',
  'book_loan.created',
  'book_loan.updated',
  'book_loan.returned',
] as const;
export type LogType = (typeof LOG_TYPES)[number];

export const LOG_ENTITIES = [
  'users',
  'role_policies',
  'members',
  'activities',
  'checkins',
  'volunteers',
  'book_loans',
] as const;
export type LogEntity = (typeof LOG_ENTITIES)[number];

/** An empty query parameter (`?type=`) means "no filter". */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/** A day (`2026-11-13`) or an ISO 8601 date-time with an offset (`2026-11-13T21:00:00.000Z`). */
const dateOrDateTime = z.union([z.string().date(), z.string().datetime({ offset: true })]);

export const auditLogQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).optional().default(0),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  type: optional(z.enum(LOG_TYPES)),
  entity: optional(z.enum(LOG_ENTITIES)),
  actorId: optional(z.coerce.number().int().positive()),
  from: optional(dateOrDateTime),
  to: optional(dateOrDateTime),
  search: optional(z.string().trim().max(255)),
});

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;
