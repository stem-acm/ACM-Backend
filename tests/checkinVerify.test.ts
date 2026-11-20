import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import express from 'express';

// Same setup as checkinSchedule.test.ts: the services use the shared `db`, whose queries go
// to an in-memory PostgreSQL (PGlite) that runs the real migrations.
const migrationsFolder = fileURLToPath(new URL('../src/db/migrations', import.meta.url));
const originalDirectory = process.cwd();
process.chdir(tmpdir());
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret';
process.env.QR_SECRET = 'test-secret';
delete process.env.MAX_REQUEST_LIMIT;
const { db } = await import('../src/db/drizzle');
const schema = await import('../src/db/schema');
const { DEFAULT_CHECKIN_SCHEDULE } = await import('../src/schemas/checkinScheduleSchema');
const { DEFAULT_TIMEZONE } = await import('../src/schemas/timezoneSchema');
const { APP_SETTINGS_ID } = await import('../src/services/appSettingsService');
const { defaultPermissions, getRolePolicy } = await import('../src/services/accessService');
const { saveCheckinSchedule } = await import('../src/services/checkinScheduleService');
const { createCheckin, getInRoomCheckins, verifyBadge } = await import(
  '../src/services/checkinService'
);
const { verifyUserToken } = await import('../src/services/userService');
const { requireAnyPermission } = await import('../src/middlewares/permissionMiddleware');
const { signQRCode } = await import('../src/utils/qrUtils');
const { generateToken } = await import('../src/utils/jwtUtils');
const { default: eventEmitter } = await import('../src/utils/eventEmitter');
const { default: settingsRoutes } = await import('../src/routes/settingsRoutes');
const { default: checkinRoutes } = await import('../src/routes/checkinRoutes');
const { default: sseRoutes } = await import('../src/routes/sseRoutes');
process.chdir(originalDirectory);

type CheckinSchedule = typeof DEFAULT_CHECKIN_SCHEDULE;
type RoleName = 'admin' | 'intern' | 'volunteer';
const { activities, appSettings, auditLogs, checkins, members, rolePolicies, users } = schema;

const testDb = drizzle(new PGlite(), { schema });
await migrate(testDb, { migrationsFolder });
for (const method of ['select', 'selectDistinct', 'insert', 'update', 'delete', 'transaction']) {
  const target = testDb as unknown as Record<string, (...args: unknown[]) => unknown>;
  mock.method(db, method as 'select', (...args: unknown[]) => target[method](...args));
}

async function newUser(username: string, role: RoleName) {
  const [row] = await testDb
    .insert(users)
    .values({ username, email: `${username}@test.local`, password: 'x', role })
    .returning();
  return {
    id: row.id,
    actor: { id: row.id, username: row.username, role },
    token: generateToken({ id: row.id, username: row.username, email: row.email }),
  };
}

const admin = await newUser('boss', 'admin');
const intern = await newUser('fanja', 'intern');
const volunteer = await newUser('soa', 'volunteer');

const [member] = await testDb
  .insert(members)
  .values({
    firstName: 'Miora',
    lastName: 'Rakoto',
    address: 'Lot II A 12',
    phoneNumber: '+261 34 00 000 00',
    profileImage: 'members/3f1c2a.jpg',
  })
  .returning();
const [other] = await testDb.insert(members).values({ firstName: 'Hery' }).returning();
const [activity] = await testDb
  .insert(activities)
  .values({ name: 'English Club', startTime: '14:00', endTime: '16:00', createdBy: admin.id })
  .returning();

const badge = (registrationNumber: number) => signQRCode(registrationNumber);

function copy(): CheckinSchedule {
  return structuredClone(DEFAULT_CHECKIN_SCHEDULE);
}

async function resetSettings() {
  await testDb
    .update(appSettings)
    .set({ checkinSchedule: DEFAULT_CHECKIN_SCHEDULE, timezone: DEFAULT_TIMEZONE })
    .where(eq(appSettings.id, APP_SETTINGS_ID));
}

async function clearCheckins() {
  await testDb.delete(checkins);
}

async function allCheckins() {
  return testDb.select().from(checkins).orderBy(asc(checkins.id));
}

/** A check-in made by the kiosk at the instant `iso`. */
function scan(registrationNumber: number, iso: string) {
  return createCheckin(
    { registrationNumber, signature: badge(registrationNumber).signature, activityId: activity.id },
    new Date(iso)
  );
}

/** Inserts a check-in row without the schedule rules. */
async function insertCheckin(checkInTime: Date, checkOutTime: Date | null = null) {
  const [row] = await testDb
    .insert(checkins)
    .values({
      registrationNumber: member.registrationNumber,
      activityId: activity.id,
      checkInTime,
      checkOutTime,
    })
    .returning();
  return row;
}

async function lastLogId(): Promise<number> {
  const [row] = await testDb
    .select({ max: sql<number>`coalesce(max(${auditLogs.id}), 0)` })
    .from(auditLogs);
  return Number(row.max);
}

async function verifyLogs(fromId: number) {
  return testDb
    .select()
    .from(auditLogs)
    .where(and(gt(auditLogs.id, fromId), eq(auditLogs.type, 'member.badge_verified')))
    .orderBy(asc(auditLogs.id));
}

/**
 * `verifyBadge` at the instant `iso`. It checks that the call changes no check-in row and
 * writes one audit row with the actor, without the signature.
 */
async function verifyAt(registrationNumber: number, signature: string, iso: string) {
  const before = await allCheckins();
  const from = await lastLogId();
  const result = await verifyBadge(
    { registrationNumber, signature },
    volunteer.actor,
    new Date(iso)
  );
  assert.deepEqual(await allCheckins(), before);
  const logs = await verifyLogs(from);
  assert.equal(logs.length, 1);
  const [log] = logs;
  assert.equal(log.actorId, volunteer.id);
  assert.equal(log.actorUsername, 'soa');
  assert.equal(log.actorRole, 'volunteer');
  assert.equal(log.entity, 'members');
  assert.equal(log.entityId, String(registrationNumber));
  assert.deepEqual(log.changes, {
    status: result.status,
    slot: result.slot ? `${result.slot.day}-${result.slot.start}` : null,
    checkinId: result.checkIn?.id ?? null,
  });
  assert.equal(JSON.stringify(log).includes(signature), false);
  return { result, log };
}

async function setPolicy(role: RoleName, change: { active?: boolean } & Record<string, unknown>) {
  const [stored] = await testDb.select().from(rolePolicies).where(eq(rolePolicies.role, role));
  const { active, ...permissions } = change;
  await testDb
    .update(rolePolicies)
    .set({
      active: active ?? stored.active,
      permissions: { ...stored.permissions, ...(permissions as Record<string, boolean>) },
    })
    .where(eq(rolePolicies.role, role));
  return async () => {
    await testDb
      .update(rolePolicies)
      .set({ active: stored.active, permissions: stored.permissions })
      .where(eq(rolePolicies.role, role));
  };
}

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRoutes);
  app.use('/api/checkins', checkinRoutes);
  app.use('/api/sse', sseRoutes);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function call(url: string, token: string | null, method = 'GET', body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = response.headers.get('content-type')?.includes('application/json');
  return { status: response.status, body: json ? await response.json() : null };
}

// --- B1: feature checkins.verify ----------------------------------------------------------

test('checkins.verify is on by default for admin and volunteer, off for intern', () => {
  assert.equal(defaultPermissions('admin')['checkins.verify'], true);
  assert.equal(defaultPermissions('volunteer')['checkins.verify'], true);
  assert.equal(defaultPermissions('intern')['checkins.verify'], false);
});

test('a stored policy without the key gets the default; a stored false stays false', async () => {
  // The rows of the migration have no checkins.verify key.
  const [stored] = await testDb
    .select()
    .from(rolePolicies)
    .where(eq(rolePolicies.role, 'volunteer'));
  assert.equal('checkins.verify' in stored.permissions, false);
  assert.equal((await getRolePolicy('volunteer')).permissions['checkins.verify'], true);
  assert.equal((await getRolePolicy('intern')).permissions['checkins.verify'], false);
  assert.equal((await getRolePolicy('admin')).permissions['checkins.verify'], true);

  const restore = await setPolicy('volunteer', { 'checkins.verify': false });
  try {
    assert.equal((await getRolePolicy('volunteer')).permissions['checkins.verify'], false);
  } finally {
    await restore();
  }
});

test('the token check of a volunteer returns checkins.verify true', async () => {
  const user = await verifyUserToken(volunteer.id);
  assert.equal(user.permissions['checkins.verify'], true);
  assert.equal((await verifyUserToken(intern.id)).permissions['checkins.verify'], false);
});

test('the Settings API lists checkins.verify and saves it for intern with a log', async () => {
  const [stored] = await testDb.select().from(rolePolicies).where(eq(rolePolicies.role, 'intern'));
  const from = await lastLogId();
  try {
    await withServer(async (api) => {
      const roles = await call(`${api}/settings/roles`, admin.token);
      assert.equal(roles.status, 200);
      const verify = Object.fromEntries(
        roles.body.data.map((policy: { role: string; permissions: Record<string, boolean> }) => [
          policy.role,
          policy.permissions['checkins.verify'],
        ])
      );
      assert.deepEqual(verify, { admin: true, intern: false, volunteer: true });

      const saved = await call(`${api}/settings/roles/intern`, admin.token, 'PUT', {
        active: true,
        permissions: { 'checkins.verify': true },
      });
      assert.equal(saved.status, 200);
      assert.equal(saved.body.data.permissions['checkins.verify'], true);
    });
    const logs = await testDb
      .select()
      .from(auditLogs)
      .where(and(gt(auditLogs.id, from), eq(auditLogs.type, 'role_policy.permissions_changed')));
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0].changes, { 'checkins.verify': { before: false, after: true } });
  } finally {
    await testDb
      .update(rolePolicies)
      .set({ active: stored.active, permissions: stored.permissions })
      .where(eq(rolePolicies.role, 'intern'));
  }
});

// --- B2: requireAnyPermission -------------------------------------------------------------

async function runMiddleware(
  middleware: ReturnType<typeof requireAnyPermission>,
  role: RoleName | null
) {
  let status = 0;
  let passed = false;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  const req = role
    ? { user: { id: 1, username: 'x', email: 'x@test.local', role } }
    : ({} as Record<string, unknown>);
  await middleware(req as never, res as never, () => {
    passed = true;
  });
  return passed ? 'next' : status;
}

test('requireAnyPermission: one feature of the list is enough', async () => {
  const either = requireAnyPermission('checkins.view', 'checkins.verify');
  assert.equal(await runMiddleware(either, 'volunteer'), 'next'); // verify only
  assert.equal(await runMiddleware(either, 'intern'), 'next'); // view only
  assert.equal(await runMiddleware(either, 'admin'), 'next');
});

test('requireAnyPermission: none of the features gives 403, no user gives 401', async () => {
  assert.equal(await runMiddleware(requireAnyPermission('checkins.verify'), 'intern'), 403);
  assert.equal(
    await runMiddleware(requireAnyPermission('checkins.view', 'settings.manage'), 'volunteer'),
    403
  );
  assert.equal(await runMiddleware(requireAnyPermission('checkins.verify'), null), 401);
});

test('requireAnyPermission: an inactive role gives 403', async () => {
  const restore = await setPolicy('volunteer', { active: false });
  try {
    assert.equal(
      await runMiddleware(requireAnyPermission('checkins.create', 'checkins.verify'), 'volunteer'),
      403
    );
  } finally {
    await restore();
  }
});

// --- B4, B5: verifyBadge ------------------------------------------------------------------

// 2026-11-10 is a Tuesday. Mahajanga (Indian/Antananarivo) is UTC+3. The default schedule
// has 08:00–12:00 and 15:00–18:00 on Tuesday.

test('a member scanned in the current slot is CHECKED_IN with the activity name', async () => {
  await clearCheckins();
  const created = await scan(member.registrationNumber, '2026-11-10T05:30:00.000Z'); // 08:30
  const { result, log } = await verifyAt(
    member.registrationNumber,
    badge(member.registrationNumber).signature,
    '2026-11-10T06:00:00.000Z' // 09:00
  );
  assert.deepEqual(result, {
    status: 'CHECKED_IN',
    member: {
      registrationNumber: member.registrationNumber,
      firstName: 'Miora',
      lastName: 'Rakoto',
      photoUrl: '/uploads/members/3f1c2a.jpg',
    },
    slot: { day: 'tuesday', start: '08:00', end: '12:00' },
    checkIn: { id: created.id, time: created.checkInTime, activity: 'English Club' },
    nextSlot: { day: 'tuesday', start: '15:00', end: '18:00' },
    todaySlots: [
      { start: '08:00', end: '12:00', state: 'current' },
      { start: '15:00', end: '18:00', state: 'next' },
    ],
    closedToday: false,
    now: { day: 'tuesday', time: '09:00' },
    timezone: 'Indian/Antananarivo',
    serverTime: '2026-11-10T06:00:00.000Z',
  });
  assert.equal(log.entityLabel, 'RAKOTO Miora');
  assert.deepEqual(log.changes, {
    status: 'CHECKED_IN',
    slot: 'tuesday-08:00',
    checkinId: created.id,
  });
  await clearCheckins();
});

test('a member without a scan in the slot is NOT_CHECKED_IN', async () => {
  await clearCheckins();
  await scan(member.registrationNumber, '2026-11-10T05:30:00.000Z');
  const { result } = await verifyAt(
    other.registrationNumber,
    badge(other.registrationNumber).signature,
    '2026-11-10T06:00:00.000Z'
  );
  assert.equal(result.status, 'NOT_CHECKED_IN');
  assert.equal(result.checkIn, null);
  assert.deepEqual(result.member, {
    registrationNumber: other.registrationNumber,
    firstName: 'Hery',
    lastName: null,
    photoUrl: null,
  });
  assert.deepEqual(result.slot, { day: 'tuesday', start: '08:00', end: '12:00' });
  await clearCheckins();
});

test('a scan in the morning slot does not count in the afternoon slot', async () => {
  await clearCheckins();
  await scan(member.registrationNumber, '2026-11-10T05:30:00.000Z'); // 08:30
  const { result } = await verifyAt(
    member.registrationNumber,
    badge(member.registrationNumber).signature,
    '2026-11-10T12:30:00.000Z' // 15:30
  );
  assert.equal(result.status, 'NOT_CHECKED_IN');
  assert.deepEqual(result.slot, { day: 'tuesday', start: '15:00', end: '18:00' });
  await clearCheckins();
});

test('between two slots the answer is NO_SLOT with the slots of today', async () => {
  await clearCheckins();
  await scan(member.registrationNumber, '2026-11-10T05:30:00.000Z');
  const { result } = await verifyAt(
    member.registrationNumber,
    badge(member.registrationNumber).signature,
    '2026-11-10T10:05:00.000Z' // 13:05
  );
  assert.equal(result.status, 'NO_SLOT');
  assert.equal(result.slot, null);
  assert.equal(result.checkIn, null);
  assert.equal(result.member?.firstName, 'Miora');
  assert.equal(result.closedToday, false);
  assert.deepEqual(result.now, { day: 'tuesday', time: '13:05' });
  assert.deepEqual(result.todaySlots, [
    { start: '08:00', end: '12:00', state: 'ended' },
    { start: '15:00', end: '18:00', state: 'next' },
  ]);
  assert.deepEqual(result.nextSlot, { day: 'tuesday', start: '15:00', end: '18:00' });
  await clearCheckins();
});

test('on a closed day the answer is NO_SLOT with closedToday', async () => {
  const closed = copy();
  closed.sunday = { open: false, slots: [] };
  await saveCheckinSchedule(closed, admin.actor);
  try {
    const { result } = await verifyAt(
      member.registrationNumber,
      badge(member.registrationNumber).signature,
      '2026-11-15T07:00:00.000Z' // Sunday 10:00
    );
    assert.equal(result.status, 'NO_SLOT');
    assert.equal(result.closedToday, true);
    assert.deepEqual(result.todaySlots, []);
    assert.deepEqual(result.nextSlot, { day: 'monday', start: '08:00', end: '12:00' });
  } finally {
    await resetSettings();
  }
});

test('a wrong signature, the signature of another number and an unknown member are INVALID_BADGE', async () => {
  const unknown = 999_999;
  const cases: [number, string][] = [
    [member.registrationNumber, '0'.repeat(64)],
    [member.registrationNumber, badge(other.registrationNumber).signature],
    [unknown, badge(unknown).signature],
  ];
  for (const [registrationNumber, signature] of cases) {
    const { result, log } = await verifyAt(
      registrationNumber,
      signature,
      '2026-11-10T06:00:00.000Z'
    );
    assert.equal(result.status, 'INVALID_BADGE');
    assert.equal(result.member, null);
    assert.equal(result.slot, null);
    assert.equal(result.checkIn, null);
    assert.equal(log.entityLabel, `Unknown badge #${registrationNumber}`);
  }
});

test('a check-in that is now outside all slots does not count', async () => {
  await clearCheckins();
  await scan(member.registrationNumber, '2026-11-11T05:45:00.000Z'); // Wednesday 08:45
  const later = copy();
  later.wednesday.slots = [{ start: '09:00', end: '12:00' }];
  await saveCheckinSchedule(later, admin.actor);
  try {
    const { result } = await verifyAt(
      member.registrationNumber,
      badge(member.registrationNumber).signature,
      '2026-11-11T07:00:00.000Z' // Wednesday 10:00
    );
    assert.equal(result.status, 'NOT_CHECKED_IN');
    assert.deepEqual(result.slot, { day: 'wednesday', start: '09:00', end: '12:00' });
  } finally {
    await resetSettings();
    await clearCheckins();
  }
});

test('another time zone gives another slot for the same instant', async () => {
  const signature = badge(member.registrationNumber).signature;
  // Tuesday 13:00 UTC is 16:00 in Mahajanga, inside 15:00–18:00.
  const mahajanga = await verifyAt(member.registrationNumber, signature, '2026-11-10T13:00:00Z');
  assert.deepEqual(mahajanga.result.slot, { day: 'tuesday', start: '15:00', end: '18:00' });
  await testDb
    .update(appSettings)
    .set({ timezone: 'UTC' })
    .where(eq(appSettings.id, APP_SETTINGS_ID));
  try {
    const utc = await verifyAt(member.registrationNumber, signature, '2026-11-10T13:00:00Z');
    assert.equal(utc.result.status, 'NO_SLOT');
    assert.equal(utc.result.timezone, 'UTC');
    assert.deepEqual(utc.result.now, { day: 'tuesday', time: '13:00' });
  } finally {
    await resetSettings();
  }
});

test('when the audit log cannot be written, the verification fails', async () => {
  await testDb.execute(sql`alter table audit_logs rename to audit_logs_unavailable`);
  try {
    await assert.rejects(
      verifyBadge(
        {
          registrationNumber: member.registrationNumber,
          signature: badge(member.registrationNumber).signature,
        },
        volunteer.actor,
        new Date('2026-11-10T06:00:00.000Z')
      )
    );
    await withServer(async (api) => {
      const response = await call(`${api}/checkins/verify`, admin.token, 'POST', {
        registrationNumber: member.registrationNumber,
        signature: badge(member.registrationNumber).signature,
      });
      assert.equal(response.status, 500);
      assert.deepEqual(response.body, {
        success: false,
        message: 'Failed to verify the badge',
        data: null,
      });
    });
  } finally {
    await testDb.execute(sql`alter table audit_logs_unavailable rename to audit_logs`);
  }
});

// --- B4: HTTP -----------------------------------------------------------------------------

test('POST /api/checkins/verify: permissions, validation and the response envelope', async () => {
  const body = {
    registrationNumber: member.registrationNumber,
    signature: badge(member.registrationNumber).signature,
  };
  const before = await allCheckins();
  const from = await lastLogId();
  await withServer(async (api) => {
    const url = `${api}/checkins/verify`;
    assert.equal((await call(url, null, 'POST', body)).status, 401);
    assert.equal((await call(url, intern.token, 'POST', body)).status, 403);
    for (const user of [volunteer, admin]) {
      const response = await call(url, user.token, 'POST', body);
      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.message, 'Badge verified');
      // The real clock decides the status: any status but INVALID_BADGE.
      assert.ok(['CHECKED_IN', 'NOT_CHECKED_IN', 'NO_SLOT'].includes(response.body.data.status));
      assert.equal(response.body.data.member.registrationNumber, member.registrationNumber);
      assert.equal(response.body.data.timezone, 'Indian/Antananarivo');
    }
    const invalid = await call(url, volunteer.token, 'POST', { ...body, signature: 'abc' });
    assert.equal(invalid.status, 200);
    assert.equal(invalid.body.data.status, 'INVALID_BADGE');

    for (const wrong of [
      {},
      { registrationNumber: '12', signature: 'abc' },
      { registrationNumber: 0, signature: 'abc' },
      { registrationNumber: 1.5, signature: 'abc' },
      { registrationNumber: 1, signature: '' },
      { registrationNumber: 1, signature: 'a'.repeat(129) },
    ]) {
      assert.equal((await call(url, volunteer.token, 'POST', wrong)).status, 422);
    }

    // An inactive role is refused.
    const restore = await setPolicy('volunteer', { active: false });
    try {
      assert.equal((await call(url, volunteer.token, 'POST', body)).status, 403);
    } finally {
      await restore();
    }
  });
  assert.deepEqual(await allCheckins(), before);
  // One log for each 200 answer: volunteer, admin, invalid badge.
  const logs = await verifyLogs(from);
  assert.deepEqual(
    logs.map((log) => log.actorUsername),
    ['soa', 'boss', 'soa']
  );
});

test('POST /api/checkins/verify: the 61st call of a user in a minute answers 429', async () => {
  const busy = await newUser('busy', 'volunteer');
  await withServer(async (api) => {
    const url = `${api}/checkins/verify`;
    // An invalid body is counted too: 60 fast calls without database writes.
    for (let index = 0; index < 60; index++) {
      assert.equal((await call(url, busy.token, 'POST', {})).status, 422);
    }
    const limited = await call(url, busy.token, 'POST', {});
    assert.equal(limited.status, 429);
    assert.deepEqual(limited.body, {
      success: false,
      message: 'Too many badge checks, please try again later',
      data: null,
    });
    // The key is the user, not the IP address: another user of the same IP is not limited.
    assert.equal((await call(url, volunteer.token, 'POST', {})).status, 422);
  });
});

// --- B6: in-room --------------------------------------------------------------------------

// Tuesday 11:00 in Mahajanga, inside the slot 08:00–12:00.
const NOW = new Date('2026-11-10T08:00:00.000Z');

test('in-room pages: newest first, total, cursor, no duplicate when a check-in is added', async () => {
  await clearCheckins();
  const ids: number[] = [];
  for (let index = 0; index < 45; index++) {
    ids.push((await insertCheckin(new Date(Date.UTC(2026, 10, 10, 5, index)))).id);
  }
  const page1 = await getInRoomCheckins({ limit: 20 }, false, NOW);
  assert.equal(page1.data.checkins.length, 20);
  assert.deepEqual(
    page1.data.checkins.map((row) => row.id),
    [...ids].reverse().slice(0, 20)
  );
  assert.deepEqual(page1.pagination, {
    limit: 20,
    total: 45,
    hasMore: true,
    nextBefore: page1.data.checkins[19].id,
  });
  assert.deepEqual(page1.data.slot, { day: 'tuesday', start: '08:00', end: '12:00' });
  assert.equal(page1.data.timezone, 'Indian/Antananarivo');
  assert.equal(page1.data.serverTime, NOW.toISOString());

  // A live check-in between page 1 and page 2.
  const added = await insertCheckin(new Date('2026-11-10T07:59:00.000Z'));
  const page2 = await getInRoomCheckins(
    { limit: 20, before: page1.pagination.nextBefore ?? undefined },
    false,
    NOW
  );
  assert.equal(page2.data.checkins.length, 20);
  assert.equal(page2.pagination.total, 46);
  assert.equal(page2.pagination.hasMore, true);
  const page3 = await getInRoomCheckins(
    { limit: 20, before: page2.pagination.nextBefore ?? undefined },
    false,
    NOW
  );
  assert.equal(page3.data.checkins.length, 5);
  assert.equal(page3.pagination.hasMore, false);
  assert.equal(page3.pagination.nextBefore, null);

  const seen = [page1, page2, page3].flatMap((page) => page.data.checkins.map((row) => row.id));
  assert.equal(new Set(seen).size, 45);
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    ids
  );
  assert.equal(seen.includes(added.id), false);
  await clearCheckins();
});

test('in-room: only today in the app time zone, and only rows still in the room', async () => {
  await clearCheckins();
  // Monday 23:59:59 in Mahajanga: yesterday.
  await insertCheckin(new Date('2026-11-09T20:59:59.000Z'));
  // Tuesday 00:00 in Mahajanga: today.
  const midnight = await insertCheckin(new Date('2026-11-09T21:00:00.000Z'));
  // Left the room before now, and exactly now.
  await insertCheckin(new Date('2026-11-10T05:00:00Z'), new Date('2026-11-10T07:00:00Z'));
  await insertCheckin(new Date('2026-11-10T05:00:00Z'), NOW);
  // Leaves the room later.
  const later = await insertCheckin(
    new Date('2026-11-10T05:30:00Z'),
    new Date('2026-11-10T10:00:00Z')
  );
  const page = await getInRoomCheckins({ limit: 20 }, false, NOW);
  assert.deepEqual(
    page.data.checkins.map((row) => row.id),
    [later.id, midnight.id]
  );
  assert.equal(page.pagination.total, 2);
  await clearCheckins();
});

test('in-room: outside all slots the slot is null', async () => {
  const page = await getInRoomCheckins({ limit: 20 }, false, new Date('2026-11-10T10:05:00Z'));
  assert.equal(page.data.slot, null);
});

test('in-room: the reduced row has the member and activity fields the app shows', async () => {
  await clearCheckins();
  await insertCheckin(new Date('2026-11-10T05:00:00Z'));
  const [reduced] = (await getInRoomCheckins({ limit: 20 }, false, NOW)).data.checkins;
  assert.deepEqual(Object.keys(reduced).sort(), [
    'Activity',
    'Member',
    'activityId',
    'checkInTime',
    'checkOutTime',
    'id',
    'registrationNumber',
    'visitReason',
  ]);
  assert.deepEqual(reduced.Member, {
    registrationNumber: member.registrationNumber,
    firstName: 'Miora',
    lastName: 'Rakoto',
    profileImage: 'members/3f1c2a.jpg',
  });
  assert.deepEqual(reduced.Activity, { id: activity.id, name: 'English Club' });

  const [full] = (await getInRoomCheckins({ limit: 20 }, true, NOW)).data.checkins;
  assert.equal((full.Member as { address: string }).address, 'Lot II A 12');
  assert.equal((full.Member as { phoneNumber: string }).phoneNumber, '+261 34 00 000 00');
  await clearCheckins();
});

test('GET /api/checkins/in-room: permissions, limits, member shape and cursor', async () => {
  await clearCheckins();
  // Rows of today for the real clock: from one minute after the start of the day.
  const { getZoneDayBounds } = await import('../src/utils/checkinUtils');
  const { start } = getZoneDayBounds(new Date(), DEFAULT_TIMEZONE);
  for (let index = 0; index < 3; index++) {
    await insertCheckin(new Date(start.getTime() + 60_000 + index * 1000));
  }
  await withServer(async (api) => {
    const url = `${api}/checkins/in-room`;
    assert.equal((await call(url, null)).status, 401);
    assert.equal((await call(url, intern.token)).status, 403);

    const page = await call(`${url}?limit=2`, volunteer.token);
    assert.equal(page.status, 200);
    assert.equal(page.body.message, 'Members in room');
    assert.equal(page.body.data.checkins.length, 2);
    assert.deepEqual(Object.keys(page.body.data.checkins[0].Member).sort(), [
      'firstName',
      'lastName',
      'profileImage',
      'registrationNumber',
    ]);
    assert.equal(page.body.pagination.total, 3);
    assert.equal(page.body.pagination.hasMore, true);

    // A new check-in between two pages does not change the next page.
    await insertCheckin(new Date(start.getTime() + 120_000));
    const next = await call(
      `${url}?limit=2&before=${page.body.pagination.nextBefore}`,
      volunteer.token
    );
    assert.equal(next.status, 200);
    assert.equal(next.body.data.checkins.length, 1);
    assert.equal(next.body.pagination.hasMore, false);
    assert.equal(next.body.pagination.total, 4);
    const ids = [...page.body.data.checkins, ...next.body.data.checkins].map(
      (row: { id: number }) => row.id
    );
    assert.equal(new Set(ids).size, 3);

    // Admins have checkins.view: the full member row, as the dashboard.
    const full = await call(url, admin.token);
    assert.equal(full.status, 200);
    assert.equal(full.body.data.checkins[0].Member.address, 'Lot II A 12');
    assert.equal(full.body.pagination.limit, 20);

    assert.equal((await call(`${url}?limit=500`, volunteer.token)).body.pagination.limit, 100);
    assert.equal((await call(`${url}?limit=0`, volunteer.token)).status, 422);
    assert.equal((await call(`${url}?before=abc`, volunteer.token)).status, 422);
    assert.equal((await call(`${url}?before=0`, volunteer.token)).status, 422);
  });
  await clearCheckins();
});

// --- B6: schedule route -------------------------------------------------------------------

test('GET /api/checkins/schedule accepts checkins.verify without checkins.create', async () => {
  const restore = await setPolicy('volunteer', { 'checkins.create': false });
  try {
    await withServer(async (api) => {
      const response = await call(`${api}/checkins/schedule`, volunteer.token);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.schedule, DEFAULT_CHECKIN_SCHEDULE);
    });
  } finally {
    await restore();
  }
  // Without both features, the route is refused.
  const restoreBoth = await setPolicy('volunteer', {
    'checkins.create': false,
    'checkins.verify': false,
  });
  try {
    await withServer(async (api) => {
      assert.equal((await call(`${api}/checkins/schedule`, volunteer.token)).status, 403);
    });
  } finally {
    await restoreBoth();
  }
});

// --- B6: SSE ------------------------------------------------------------------------------

/** Opens the check-in stream; `next` gives the next data event, or `null` at the end. */
async function openStream(api: string, token: string | null, viaQuery = false) {
  const controller = new AbortController();
  const url = `${api}/sse/checkins${viaQuery && token ? `?auth=${token}` : ''}`;
  const headers: Record<string, string> = {};
  if (token && !viaQuery) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, signal: controller.signal });
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    return { status: response.status, next: async () => null, close: () => undefined };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  async function next(): Promise<Record<string, unknown> | null> {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const line = block.split('\n').find((item) => item.startsWith('data: '));
        if (line) return JSON.parse(line.slice(6));
        continue;
      }
      const { value, done } = await reader.read();
      if (done) return null;
      buffer += decoder.decode(value, { stream: true });
    }
  }
  return { status: response.status, next, close: () => controller.abort() };
}

const liveCheckin = {
  id: 991,
  registrationNumber: member.registrationNumber,
  activityId: activity.id,
  checkInTime: '2026-11-10T05:30:00.000Z',
  checkOutTime: null,
  visitReason: null,
  createdAt: '2026-11-10T05:30:00.000Z',
  updatedAt: '2026-11-10T05:30:00.000Z',
  Member: member,
  Activity: activity,
};

test('SSE: a volunteer receives the reduced check-in, with the header or ?auth=', async () => {
  await withServer(async (api) => {
    for (const viaQuery of [false, true]) {
      const stream = await openStream(api, volunteer.token, viaQuery);
      assert.equal(stream.status, 200);
      try {
        assert.deepEqual(await stream.next(), { type: 'connected' });
        eventEmitter.checkinEmitter.emitCheckin(liveCheckin);
        const event = (await stream.next()) as { type: string; data: Record<string, unknown> };
        assert.equal(event.type, 'new-checkin');
        assert.deepEqual(event.data, {
          id: 991,
          registrationNumber: member.registrationNumber,
          activityId: activity.id,
          checkInTime: '2026-11-10T05:30:00.000Z',
          checkOutTime: null,
          visitReason: null,
          Member: {
            registrationNumber: member.registrationNumber,
            firstName: 'Miora',
            lastName: 'Rakoto',
            profileImage: 'members/3f1c2a.jpg',
          },
          Activity: { id: activity.id, name: 'English Club' },
        });
      } finally {
        stream.close();
      }
    }
  });
});

test('SSE: an admin receives the full check-in, as before', async () => {
  await withServer(async (api) => {
    const stream = await openStream(api, admin.token);
    try {
      assert.deepEqual(await stream.next(), { type: 'connected' });
      eventEmitter.checkinEmitter.emitCheckin(liveCheckin);
      const event = (await stream.next()) as { data: Record<string, unknown> };
      assert.deepEqual(event.data, JSON.parse(JSON.stringify(liveCheckin)));
    } finally {
      stream.close();
    }
  });
});

test('SSE: an intern without checkins.view is refused, no token gives 401', async () => {
  const restore = await setPolicy('intern', { 'checkins.view': false });
  try {
    await withServer(async (api) => {
      assert.equal((await openStream(api, intern.token)).status, 403);
      assert.equal((await openStream(api, null)).status, 401);
    });
  } finally {
    await restore();
  }
});

test('SSE: when checkins.verify is removed, the next event closes the stream', async () => {
  await withServer(async (api) => {
    const stream = await openStream(api, volunteer.token);
    const restore = await setPolicy('volunteer', { 'checkins.verify': false });
    try {
      assert.deepEqual(await stream.next(), { type: 'connected' });
      eventEmitter.checkinEmitter.emitCheckin(liveCheckin);
      assert.equal(await stream.next(), null);
    } finally {
      await restore();
      stream.close();
    }
  });
});
