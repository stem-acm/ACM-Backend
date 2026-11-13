import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditLogQuerySchema, LOG_ENTITIES, LOG_TYPES } from '../src/schemas/auditSchema';

/** Entity of each log type: the part before the dot, as a table name. */
const TYPE_ENTITY: Record<string, string> = {
  user: 'users',
  role_policy: 'role_policies',
  member: 'members',
  activity: 'activities',
  checkin: 'checkins',
  volunteer: 'volunteers',
  book_loan: 'book_loans',
};

function fields(query: Record<string, unknown>): string[] {
  const parsed = auditLogQuerySchema.safeParse(query);
  assert.equal(parsed.success, false, `expected ${JSON.stringify(query)} to be refused`);
  return parsed.error.issues.map((issue) => issue.path.join('.'));
}

test('there are 23 log types, each one written once', () => {
  assert.equal(LOG_TYPES.length, 23);
  assert.equal(new Set(LOG_TYPES).size, 23);
});

test('each log type belongs to one of the 7 entities, and each entity has a log type', () => {
  assert.equal(LOG_ENTITIES.length, 7);
  const used = new Set<string>();
  for (const type of LOG_TYPES) {
    const entity = TYPE_ENTITY[type.split('.')[0]];
    assert.ok(entity, `no entity for ${type}`);
    assert.ok((LOG_ENTITIES as readonly string[]).includes(entity), `${entity} is not an entity`);
    used.add(entity);
  }
  assert.deepEqual([...used].sort(), [...LOG_ENTITIES].sort());
});

test('a new check-in has no log type: check-ins only have delete types', () => {
  const checkinTypes = LOG_TYPES.filter((type) => type.startsWith('checkin.'));
  assert.deepEqual(checkinTypes, ['checkin.deleted', 'checkin.cascade_deleted']);
});

test('no entity has a log type for a write that the API cannot do', () => {
  const types = LOG_TYPES as readonly string[];
  assert.equal(types.includes('user.deleted'), false);
  assert.equal(types.includes('role_policy.deleted'), false);
  assert.equal(types.includes('book_loan.deleted'), false);
  assert.equal(types.includes('checkin.created'), false);
  assert.equal(types.includes('checkin.updated'), false);
});

test('an empty query reads the first 25 rows without a filter', () => {
  assert.deepEqual(auditLogQuerySchema.parse({}), { offset: 0, limit: 25 });
});

test('offset, limit and actorId come as text and become numbers', () => {
  const query = auditLogQuerySchema.parse({ offset: '50', limit: '10', actorId: '7' });
  assert.equal(query.offset, 50);
  assert.equal(query.limit, 10);
  assert.equal(query.actorId, 7);
});

test('an empty parameter means no filter', () => {
  const query = auditLogQuerySchema.parse({
    type: '',
    entity: '',
    actorId: '',
    from: '',
    to: '',
    search: '',
  });
  assert.equal(query.offset, 0);
  assert.equal(query.limit, 25);
  for (const filter of ['type', 'entity', 'actorId', 'from', 'to', 'search'] as const) {
    assert.equal(query[filter], undefined, `${filter} is not a filter`);
  }
});

test('each log type and each entity is a valid filter', () => {
  for (const type of LOG_TYPES) {
    assert.equal(auditLogQuerySchema.parse({ type }).type, type);
  }
  for (const entity of LOG_ENTITIES) {
    assert.equal(auditLogQuerySchema.parse({ entity }).entity, entity);
  }
});

test('an unknown log type or entity is refused', () => {
  assert.deepEqual(fields({ type: 'member.archived' }), ['type']);
  assert.deepEqual(fields({ type: 'role_policy.updated' }), ['type']);
  assert.deepEqual(fields({ entity: 'audit_logs' }), ['entity']);
  assert.deepEqual(fields({ entity: 'member' }), ['entity']);
});

test('the limit is between 1 and 100, and the offset is not negative', () => {
  assert.equal(auditLogQuerySchema.parse({ limit: '1' }).limit, 1);
  assert.equal(auditLogQuerySchema.parse({ limit: '100' }).limit, 100);
  assert.deepEqual(fields({ limit: '0' }), ['limit']);
  assert.deepEqual(fields({ limit: '101' }), ['limit']);
  assert.deepEqual(fields({ limit: '2.5' }), ['limit']);
  assert.deepEqual(fields({ limit: 'many' }), ['limit']);
  assert.deepEqual(fields({ offset: '-1' }), ['offset']);
});

test('actorId is a positive whole number', () => {
  assert.deepEqual(fields({ actorId: '0' }), ['actorId']);
  assert.deepEqual(fields({ actorId: '-3' }), ['actorId']);
  assert.deepEqual(fields({ actorId: '1.5' }), ['actorId']);
  assert.deepEqual(fields({ actorId: 'admin' }), ['actorId']);
});

test('a period bound is a day or a date-time with an offset', () => {
  const query = auditLogQuerySchema.parse({
    from: '2026-11-01',
    to: '2026-11-13T20:59:59.999Z',
  });
  assert.equal(query.from, '2026-11-01');
  assert.equal(query.to, '2026-11-13T20:59:59.999Z');
  assert.equal(
    auditLogQuerySchema.parse({ from: '2026-11-13T00:00:00+03:00' }).from,
    '2026-11-13T00:00:00+03:00'
  );
});

test('a period bound in any other format is refused', () => {
  assert.deepEqual(fields({ from: 'yesterday' }), ['from']);
  assert.deepEqual(fields({ from: '13/11/2026' }), ['from']);
  assert.deepEqual(fields({ to: '2026-02-30' }), ['to']);
  // Without an offset, the server cannot know the time zone of the admin.
  assert.deepEqual(fields({ to: '2026-11-13T12:00:00' }), ['to']);
});

test('the search text loses its outer spaces and is at most 255 characters', () => {
  assert.equal(auditLogQuerySchema.parse({ search: '  Rakoto  ' }).search, 'Rakoto');
  assert.equal(auditLogQuerySchema.parse({ search: 'a'.repeat(255) }).search?.length, 255);
  assert.deepEqual(fields({ search: 'a'.repeat(256) }), ['search']);
});

test('several wrong parameters are all reported', () => {
  assert.deepEqual(fields({ type: 'nope', limit: '500', from: 'soon' }).sort(), [
    'from',
    'limit',
    'type',
  ]);
});
