import { and, desc, eq, gte, ilike, lt, lte, or, type SQL, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { auditLogs } from '@/db/schema';
import type { AuditLogQueryInput, LogEntity, LogType } from '@/schemas/auditSchema';

/** The account that sent the request (`req.user`). */
export interface Actor {
  id: number;
  username: string;
  role: string;
}

/** The transaction handle that `db.transaction` gives to its callback. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface LogEntry {
  type: LogType;
  entity: LogEntity;
  entityId: string | number;
  entityLabel: string;
  parentEntity?: LogEntity;
  parentId?: string | number;
  parentLabel?: string;
  changes: Record<string, unknown>;
}

export type FieldChange = { before: unknown; after: unknown };

/** Columns that a diff never contains. */
const IGNORED_FIELDS = new Set(['updatedAt', 'password']);
/** Columns that a log never contains. */
const SECRET_FIELDS = new Set(['password']);

/** Label of a volunteer row that is not linked to a member. */
export const VOLUNTEER_WITHOUT_MEMBER_LABEL = 'Volunteer without member';

function normalize(value: unknown): unknown {
  return value === undefined ? null : value;
}

function sameValue(a: unknown, b: unknown): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (typeof left === 'object' && left !== null && typeof right === 'object' && right !== null) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return left === right;
}

/**
 * Compares two versions of a row and returns the changed fields as
 * `{ field: { before, after } }`. `updatedAt` and `password` are ignored.
 */
export function diffRows(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const field of fields) {
    if (IGNORED_FIELDS.has(field)) continue;
    if (!sameValue(before[field], after[field])) {
      changes[field] = { before: normalize(before[field]), after: normalize(after[field]) };
    }
  }
  return changes;
}

/** The full row of an insert or a delete, without its secret columns. */
export function snapshot(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([field]) => !SECRET_FIELDS.has(field))
      .map(([field, value]) => [field, normalize(value)])
  );
}

/** "LASTNAME Firstname", as the members list shows a member. */
export function memberLabel(member: { firstName: string; lastName: string | null }): string {
  return [member.lastName?.trim().toUpperCase(), member.firstName.trim()].filter(Boolean).join(' ');
}

/** Adds one log row inside the transaction of the change. */
export async function writeLog(tx: Transaction, actor: Actor, entry: LogEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    actorId: actor.id,
    actorUsername: actor.username,
    actorRole: actor.role,
    type: entry.type,
    entity: entry.entity,
    entityId: String(entry.entityId),
    entityLabel: entry.entityLabel,
    parentEntity: entry.parentEntity ?? null,
    parentId: entry.parentId === undefined ? null : String(entry.parentId),
    parentLabel: entry.parentLabel ?? null,
    changes: snapshot(entry.changes),
  });
}

function startOf(value: string): Date {
  return new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
}

export function auditLogConditions(query: AuditLogQueryInput): SQL | undefined {
  const conditions: SQL[] = [];
  if (query.type) conditions.push(eq(auditLogs.type, query.type));
  if (query.entity) conditions.push(eq(auditLogs.entity, query.entity));
  if (query.actorId) conditions.push(eq(auditLogs.actorId, query.actorId));
  if (query.from) conditions.push(gte(auditLogs.createdAt, startOf(query.from)));
  if (query.to) {
    if (query.to.length === 10) {
      // A day includes all of its hours: stop before the next day.
      const next = startOf(query.to);
      next.setUTCDate(next.getUTCDate() + 1);
      conditions.push(lt(auditLogs.createdAt, next));
    } else {
      conditions.push(lte(auditLogs.createdAt, startOf(query.to)));
    }
  }
  if (query.search) {
    const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
    const search = or(
      ilike(auditLogs.entityLabel, pattern),
      ilike(auditLogs.actorUsername, pattern)
    );
    if (search) conditions.push(search);
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** Log rows, newest first. */
export async function getLogs(query: AuditLogQueryInput) {
  const { offset, limit } = query;
  const where = auditLogConditions(query);

  let countQuery = db.select({ count: sql<number>`count(*)` }).from(auditLogs);
  if (where) countQuery = countQuery.where(where) as typeof countQuery;
  const [{ count }] = await countQuery;

  let dataQuery = db.select().from(auditLogs);
  if (where) dataQuery = dataQuery.where(where) as typeof dataQuery;
  const data = await dataQuery
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit)
    .offset(offset);
  const total = Number(count ?? 0);

  return { data, pagination: { offset, limit, total, hasMore: offset + limit < total } };
}
