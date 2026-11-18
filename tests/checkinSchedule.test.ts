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

// The services use the shared `db`. These tests send its queries to an in-memory
// PostgreSQL (PGlite) that runs the real migrations: no local database is needed.
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
const { CHECKIN_SCHEDULE_KEY, getCheckinSchedule, saveCheckinSchedule } = await import(
  '../src/services/checkinScheduleService'
);
const { createCheckin } = await import('../src/services/checkinService');
const { signQRCode } = await import('../src/utils/qrUtils');
const { generateToken } = await import('../src/utils/jwtUtils');
const { default: settingsRoutes } = await import('../src/routes/settingsRoutes');
const { default: checkinRoutes } = await import('../src/routes/checkinRoutes');
process.chdir(originalDirectory);

type CheckinSchedule = typeof DEFAULT_CHECKIN_SCHEDULE;
const { activities, appSettings, auditLogs, checkins, members, rolePolicies, users } = schema;

const testDb = drizzle(new PGlite(), { schema });
await migrate(testDb, { migrationsFolder });
for (const method of ['select', 'selectDistinct', 'insert', 'update', 'delete', 'transaction']) {
  const target = testDb as unknown as Record<string, (...args: unknown[]) => unknown>;
  mock.method(db, method as 'select', (...args: unknown[]) => target[method](...args));
}

async function newUser(username: string, role: 'admin' | 'intern' | 'volunteer') {
  const [row] = await testDb
    .insert(users)
    .values({ username, email: `${username}@test.local`, password: 'x', role })
    .returning();
  return {
    actor: { id: row.id, username: row.username, role },
    token: generateToken({ id: row.id, username: row.username, email: row.email }),
  };
}

const admin = await newUser('boss', 'admin');
const intern = await newUser('fanja', 'intern');
const volunteer = await newUser('soa', 'volunteer');

function copy(): CheckinSchedule {
  return structuredClone(DEFAULT_CHECKIN_SCHEDULE);
}

async function storedValue(): Promise<unknown> {
  const [row] = await testDb
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, CHECKIN_SCHEDULE_KEY));
  return row?.value;
}

async function resetSchedule() {
  await testDb
    .update(appSettings)
    .set({ value: DEFAULT_CHECKIN_SCHEDULE })
    .where(eq(appSettings.key, CHECKIN_SCHEDULE_KEY));
}

async function scheduleLogs(fromId: number) {
  return testDb
    .select()
    .from(auditLogs)
    .where(and(gt(auditLogs.id, fromId), eq(auditLogs.type, 'checkin_schedule.updated')))
    .orderBy(asc(auditLogs.id));
}

async function lastLogId(): Promise<number> {
  const [row] = await testDb
    .select({ max: sql<number>`coalesce(max(${auditLogs.id}), 0)` })
    .from(auditLogs);
  return Number(row.max);
}

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRoutes);
  app.use('/api/checkins', checkinRoutes);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
  } finally {
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

// --- Storage ----------------------------------------------------------------------------

test('the migration stores the default schedule', async () => {
  assert.deepEqual(await storedValue(), DEFAULT_CHECKIN_SCHEDULE);
  assert.deepEqual(await getCheckinSchedule(), DEFAULT_CHECKIN_SCHEDULE);
});

test('without a row or with an invalid value, the default schedule is used', async () => {
  await testDb.delete(appSettings).where(eq(appSettings.key, CHECKIN_SCHEDULE_KEY));
  assert.deepEqual(await getCheckinSchedule(), DEFAULT_CHECKIN_SCHEDULE);

  await testDb.insert(appSettings).values({ key: CHECKIN_SCHEDULE_KEY, value: { monday: 1 } });
  assert.deepEqual(await getCheckinSchedule(), DEFAULT_CHECKIN_SCHEDULE);
  await resetSchedule();
});

test('the first save without a row stores the schedule even when nothing changed', async () => {
  await testDb.delete(appSettings).where(eq(appSettings.key, CHECKIN_SCHEDULE_KEY));
  const from = await lastLogId();
  const saved = await saveCheckinSchedule(copy(), admin.actor);
  assert.deepEqual(saved, DEFAULT_CHECKIN_SCHEDULE);
  assert.deepEqual(await storedValue(), DEFAULT_CHECKIN_SCHEDULE);
  assert.deepEqual(await scheduleLogs(from), []);
});

// --- Settings API -------------------------------------------------------------------------

test('GET and PUT /api/settings/checkin-schedule are for admins only', async () => {
  await withServer(async (api) => {
    const url = `${api}/settings/checkin-schedule`;
    assert.equal((await call(url, null)).status, 401);
    assert.equal((await call(url, null, 'PUT', copy())).status, 401);
    for (const user of [intern, volunteer]) {
      assert.equal((await call(url, user.token)).status, 403);
      assert.equal((await call(url, user.token, 'PUT', copy())).status, 403);
    }
    const read = await call(url, admin.token);
    assert.equal(read.status, 200);
    assert.deepEqual(read.body, {
      success: true,
      message: 'Check-in schedule',
      data: DEFAULT_CHECKIN_SCHEDULE,
    });
    const write = await call(url, admin.token, 'PUT', copy());
    assert.equal(write.status, 200);
    assert.equal(write.body.message, 'Check-in schedule updated');
    assert.deepEqual(write.body.data, DEFAULT_CHECKIN_SCHEDULE);
  });
  assert.deepEqual(await storedValue(), DEFAULT_CHECKIN_SCHEDULE);
});

test('an invalid PUT answers 422 with the wrong fields and changes nothing', async () => {
  const invalid = copy();
  invalid.tuesday.slots[0] = { start: '12:00', end: '08:00' };
  invalid.thursday = { open: true, slots: [] };
  const from = await lastLogId();
  await withServer(async (api) => {
    const response = await call(`${api}/settings/checkin-schedule`, admin.token, 'PUT', invalid);
    assert.equal(response.status, 422);
    assert.equal(response.body.success, false);
    assert.deepEqual(response.body.data.errors, [
      { field: 'tuesday.slots.0.end', message: 'End must be after start.' },
      { field: 'thursday.slots', message: 'Add a slot or close the day.' },
    ]);
    assert.equal(response.body.message, 'End must be after start.,Add a slot or close the day.');
  });
  assert.deepEqual(await storedValue(), DEFAULT_CHECKIN_SCHEDULE);
  assert.deepEqual(await scheduleLogs(from), []);
});

test('closing Sunday writes one log with the Sunday before and after', async () => {
  const closed = copy();
  closed.sunday = { open: false, slots: [{ start: '08:00', end: '12:00' }] };
  const from = await lastLogId();
  await withServer(async (api) => {
    const response = await call(`${api}/settings/checkin-schedule`, admin.token, 'PUT', closed);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.sunday, { open: false, slots: [] });
  });
  const logs = await scheduleLogs(from);
  assert.equal(logs.length, 1);
  const [log] = logs;
  assert.equal(log.actorId, admin.actor.id);
  assert.equal(log.actorUsername, 'boss');
  assert.equal(log.actorRole, 'admin');
  assert.equal(log.entity, 'app_settings');
  assert.equal(log.entityId, CHECKIN_SCHEDULE_KEY);
  assert.equal(log.entityLabel, CHECKIN_SCHEDULE_KEY);
  assert.deepEqual(log.changes, {
    sunday: {
      before: DEFAULT_CHECKIN_SCHEDULE.sunday,
      after: { open: false, slots: [] },
    },
  });

  // The same schedule again: no change, no log.
  const again = await lastLogId();
  await withServer(async (api) => {
    const response = await call(`${api}/settings/checkin-schedule`, admin.token, 'PUT', closed);
    assert.equal(response.status, 200);
  });
  assert.deepEqual(await scheduleLogs(again), []);
  await resetSchedule();
});

test('when writeLog fails, the schedule is not changed', async () => {
  const changed = copy();
  changed.monday = { open: false, slots: [] };
  await testDb.execute(sql`alter table audit_logs rename to audit_logs_unavailable`);
  try {
    await assert.rejects(saveCheckinSchedule(changed, admin.actor));
  } finally {
    await testDb.execute(sql`alter table audit_logs_unavailable rename to audit_logs`);
  }
  assert.deepEqual(await storedValue(), DEFAULT_CHECKIN_SCHEDULE);
});

// --- Kiosk API ----------------------------------------------------------------------------

test('GET /api/checkins/schedule is open to the users who can create check-ins', async () => {
  await withServer(async (api) => {
    const url = `${api}/checkins/schedule`;
    assert.equal((await call(url, null)).status, 401);
    // Volunteers cannot read check-ins: a 200 also shows that `/:registrationNumber`
    // does not take this path.
    for (const user of [volunteer, intern]) {
      const response = await call(url, user.token);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        success: true,
        message: 'Check-in schedule',
        data: DEFAULT_CHECKIN_SCHEDULE,
      });
    }

    const changed = copy();
    changed.saturday = { open: true, slots: [{ start: '10:00', end: '13:00' }] };
    assert.equal(
      (await call(`${api}/settings/checkin-schedule`, admin.token, 'PUT', changed)).status,
      200
    );
    assert.deepEqual((await call(url, volunteer.token)).body.data, changed);

    // Updating stays admin-only.
    assert.equal((await call(url, admin.token, 'PUT', changed)).status, 404);
    assert.equal(
      (await call(`${api}/settings/checkin-schedule`, volunteer.token, 'PUT', copy())).status,
      403
    );
  });
  await resetSchedule();
});

test('GET /api/checkins/schedule answers 403 to a role without checkins.create', async () => {
  const [stored] = await testDb.select().from(rolePolicies).where(eq(rolePolicies.role, 'intern'));
  await testDb
    .update(rolePolicies)
    .set({ permissions: { ...stored.permissions, 'checkins.create': false } })
    .where(eq(rolePolicies.role, 'intern'));
  try {
    await withServer(async (api) => {
      assert.equal((await call(`${api}/checkins/schedule`, intern.token)).status, 403);
    });
  } finally {
    await testDb
      .update(rolePolicies)
      .set({ permissions: stored.permissions })
      .where(eq(rolePolicies.role, 'intern'));
  }
});

// --- Check-in validation ------------------------------------------------------------------

const [member] = await testDb
  .insert(members)
  .values({ firstName: 'Miora', lastName: 'Rakoto' })
  .returning();
const [activity] = await testDb
  .insert(activities)
  .values({ name: 'English Club', startTime: '14:00', endTime: '16:00', createdBy: admin.actor.id })
  .returning();

function scan(checkInTime: string) {
  return createCheckin({
    registrationNumber: member.registrationNumber,
    signature: signQRCode(member.registrationNumber).signature,
    activityId: activity.id,
    checkInTime,
  });
}

async function clearCheckins() {
  await testDb.delete(checkins).where(eq(checkins.registrationNumber, member.registrationNumber));
}

test('a scan on Monday 09:00 is accepted with the default schedule', async () => {
  await clearCheckins();
  const created = await scan('2026-11-09T06:00:00.000Z'); // Monday 09:00 in Mahajanga
  assert.equal(created.registrationNumber, member.registrationNumber);
  await clearCheckins();
});

test('a scan on a closed day or outside the slots is refused', async () => {
  await clearCheckins();
  const closed = copy();
  closed.sunday = { open: false, slots: [] };
  await saveCheckinSchedule(closed, admin.actor);
  try {
    await assert.rejects(scan('2026-11-15T07:00:00.000Z'), {
      message: 'Check-in is closed on Sunday.',
    });
    await assert.rejects(scan('2026-11-10T10:00:00.000Z'), {
      message: 'Check-in on Tuesday is allowed 08:00–12:00, 15:00–18:00.',
    });
  } finally {
    await resetSchedule();
  }
  const rows = await testDb
    .select()
    .from(checkins)
    .where(eq(checkins.registrationNumber, member.registrationNumber));
  assert.deepEqual(rows, []);
});

test('one scan per slot: the same slot is refused, another slot is accepted', async () => {
  await clearCheckins();
  await scan('2026-11-10T05:30:00.000Z'); // Tuesday 08:30
  await assert.rejects(scan('2026-11-10T08:00:00.000Z'), {
    message: 'Already scanned for this half day',
  });
  await scan('2026-11-10T12:30:00.000Z'); // Tuesday 15:30
  // Wednesday 08:30 is another day.
  await scan('2026-11-11T05:30:00.000Z');
  await clearCheckins();
});

test('earlier scans get their slot from the current schedule', async () => {
  await clearCheckins();
  await scan('2026-11-11T06:00:00.000Z'); // Wednesday 09:00, slot wednesday-08:00
  const changed = copy();
  changed.wednesday.slots = [{ start: '08:30', end: '12:00' }];
  await saveCheckinSchedule(changed, admin.actor);
  try {
    // 09:00 and 10:00 are both in the new slot wednesday-08:30.
    await assert.rejects(scan('2026-11-11T07:00:00.000Z'), {
      message: 'Already scanned for this half day',
    });

    // A scan that is now outside all slots does not block the new slot.
    await clearCheckins();
    await scan('2026-11-11T05:45:00.000Z'); // Wednesday 08:45
    const later = copy();
    later.wednesday.slots = [{ start: '09:00', end: '12:00' }];
    await saveCheckinSchedule(later, admin.actor);
    await scan('2026-11-11T07:00:00.000Z'); // Wednesday 10:00
  } finally {
    await resetSchedule();
    await clearCheckins();
  }
});
