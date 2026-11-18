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
const { DEFAULT_TIMEZONE, isValidTimeZone } = await import('../src/schemas/timezoneSchema');
const { DEFAULT_CHECKIN_SCHEDULE } = await import('../src/schemas/checkinScheduleSchema');
const { APP_SETTINGS_ID, TIMEZONE_KEY, getTimezone, saveTimezone } = await import(
  '../src/services/appSettingsService'
);
const { createCheckin } = await import('../src/services/checkinService');
const { signQRCode } = await import('../src/utils/qrUtils');
const { generateToken } = await import('../src/utils/jwtUtils');
const { default: settingsRoutes } = await import('../src/routes/settingsRoutes');
const { default: checkinRoutes } = await import('../src/routes/checkinRoutes');
process.chdir(originalDirectory);

const { activities, appSettings, auditLogs, checkins, members, users } = schema;

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

async function storedRow() {
  const [row] = await testDb.select().from(appSettings).where(eq(appSettings.id, APP_SETTINGS_ID));
  return row;
}

async function storedValue(): Promise<string | undefined> {
  return (await storedRow())?.timezone;
}

async function resetTimezone() {
  await testDb
    .update(appSettings)
    .set({ timezone: DEFAULT_TIMEZONE })
    .where(eq(appSettings.id, APP_SETTINGS_ID));
}

async function timezoneLogs(fromId: number) {
  return testDb
    .select()
    .from(auditLogs)
    .where(and(gt(auditLogs.id, fromId), eq(auditLogs.type, 'timezone.updated')))
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

// --- Validation ---------------------------------------------------------------------------

test('a time zone is an IANA name that Intl knows', () => {
  for (const zone of ['Indian/Antananarivo', 'Africa/Nairobi', 'Europe/Paris', 'UTC']) {
    assert.equal(isValidTimeZone(zone), true, zone);
  }
  for (const zone of ['', 'Mars/Olympus_Mons', 'Madagascar', 'EAT+3']) {
    assert.equal(isValidTimeZone(zone), false, zone);
  }
});

// --- Storage ----------------------------------------------------------------------------

test('the migration stores one settings row with the default time zone', async () => {
  assert.equal(DEFAULT_TIMEZONE, 'Indian/Antananarivo');
  const rows = await testDb.select().from(appSettings);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, APP_SETTINGS_ID);
  assert.equal(rows[0].timezone, DEFAULT_TIMEZONE);
  assert.deepEqual(rows[0].checkinSchedule, DEFAULT_CHECKIN_SCHEDULE);
  assert.equal(await getTimezone(), DEFAULT_TIMEZONE);
});

test('the timezone column defaults to Indian/Antananarivo and the id to 1', async () => {
  await testDb.delete(appSettings);
  await testDb.insert(appSettings).values({ checkinSchedule: DEFAULT_CHECKIN_SCHEDULE });
  const row = await storedRow();
  assert.equal(row?.id, 1);
  assert.equal(row?.timezone, 'Indian/Antananarivo');
});

test('the settings table accepts no row other than id 1', async () => {
  await assert.rejects(
    testDb.insert(appSettings).values({ id: 2, checkinSchedule: DEFAULT_CHECKIN_SCHEDULE }),
    (error: Error & { cause?: { message?: string } }) =>
      `${error.message} ${error.cause?.message ?? ''}`.includes('app_settings_single_row')
  );
  assert.equal((await testDb.select().from(appSettings)).length, 1);
});

test('without a row or with an unknown zone, the default time zone is used', async () => {
  await testDb.delete(appSettings).where(eq(appSettings.id, APP_SETTINGS_ID));
  assert.equal(await getTimezone(), DEFAULT_TIMEZONE);

  await testDb.insert(appSettings).values({
    id: APP_SETTINGS_ID,
    timezone: 'Mars/Olympus_Mons',
    checkinSchedule: DEFAULT_CHECKIN_SCHEDULE,
  });
  assert.equal(await getTimezone(), DEFAULT_TIMEZONE);
  await resetTimezone();
});

test('the first save without a row stores the time zone even when nothing changed', async () => {
  await testDb.delete(appSettings).where(eq(appSettings.id, APP_SETTINGS_ID));
  const from = await lastLogId();
  assert.equal(await saveTimezone(DEFAULT_TIMEZONE, admin.actor), DEFAULT_TIMEZONE);
  const row = await storedRow();
  assert.equal(row?.timezone, DEFAULT_TIMEZONE);
  assert.deepEqual(row?.checkinSchedule, DEFAULT_CHECKIN_SCHEDULE);
  assert.deepEqual(await timezoneLogs(from), []);
});

test('saving the time zone leaves the check-in schedule unchanged', async () => {
  const schedule = structuredClone(DEFAULT_CHECKIN_SCHEDULE);
  schedule.sunday = { open: false, slots: [] };
  await testDb
    .update(appSettings)
    .set({ checkinSchedule: schedule })
    .where(eq(appSettings.id, APP_SETTINGS_ID));
  try {
    await saveTimezone('Africa/Nairobi', admin.actor);
    const row = await storedRow();
    assert.equal(row?.timezone, 'Africa/Nairobi');
    assert.deepEqual(row?.checkinSchedule, schedule);
  } finally {
    await testDb
      .update(appSettings)
      .set({ timezone: DEFAULT_TIMEZONE, checkinSchedule: DEFAULT_CHECKIN_SCHEDULE })
      .where(eq(appSettings.id, APP_SETTINGS_ID));
  }
});

test('when writeLog fails, the time zone is not changed', async () => {
  await testDb.execute(sql`alter table audit_logs rename to audit_logs_unavailable`);
  try {
    await assert.rejects(saveTimezone('UTC', admin.actor));
  } finally {
    await testDb.execute(sql`alter table audit_logs_unavailable rename to audit_logs`);
  }
  assert.equal(await storedValue(), DEFAULT_TIMEZONE);
});

// --- Settings API -------------------------------------------------------------------------

test('GET and PUT /api/settings/timezone are for admins only', async () => {
  await withServer(async (api) => {
    const url = `${api}/settings/timezone`;
    const body = { timezone: DEFAULT_TIMEZONE };
    assert.equal((await call(url, null)).status, 401);
    assert.equal((await call(url, null, 'PUT', body)).status, 401);
    for (const user of [intern, volunteer]) {
      assert.equal((await call(url, user.token)).status, 403);
      assert.equal((await call(url, user.token, 'PUT', body)).status, 403);
    }
    const read = await call(url, admin.token);
    assert.equal(read.status, 200);
    assert.deepEqual(read.body, {
      success: true,
      message: 'Time zone',
      data: { timezone: DEFAULT_TIMEZONE },
    });
    const write = await call(url, admin.token, 'PUT', body);
    assert.equal(write.status, 200);
    assert.deepEqual(write.body, {
      success: true,
      message: 'Time zone updated',
      data: { timezone: DEFAULT_TIMEZONE },
    });
  });
});

test('an unknown time zone answers 422 on the field timezone and changes nothing', async () => {
  const from = await lastLogId();
  await withServer(async (api) => {
    const url = `${api}/settings/timezone`;
    for (const body of [{ timezone: 'Mars/Olympus_Mons' }, { timezone: '' }, { timezone: 3 }, {}]) {
      const response = await call(url, admin.token, 'PUT', body);
      assert.equal(response.status, 422, JSON.stringify(body));
      assert.deepEqual(response.body, {
        success: false,
        message: 'Unknown time zone.',
        data: { errors: [{ field: 'timezone', message: 'Unknown time zone.' }] },
      });
    }
  });
  assert.equal(await storedValue(), DEFAULT_TIMEZONE);
  assert.deepEqual(await timezoneLogs(from), []);
});

test('a new time zone writes one log with the time zone before and after', async () => {
  const from = await lastLogId();
  await withServer(async (api) => {
    const url = `${api}/settings/timezone`;
    const response = await call(url, admin.token, 'PUT', { timezone: 'Europe/Paris' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, { timezone: 'Europe/Paris' });
    assert.deepEqual((await call(url, admin.token)).body.data, { timezone: 'Europe/Paris' });
  });
  assert.equal(await storedValue(), 'Europe/Paris');
  const logs = await timezoneLogs(from);
  assert.equal(logs.length, 1);
  const [log] = logs;
  assert.equal(log.actorId, admin.actor.id);
  assert.equal(log.actorUsername, 'boss');
  assert.equal(log.actorRole, 'admin');
  assert.equal(log.entity, 'app_settings');
  assert.equal(log.entityId, TIMEZONE_KEY);
  assert.equal(log.entityLabel, TIMEZONE_KEY);
  assert.deepEqual(log.changes, {
    timezone: { before: DEFAULT_TIMEZONE, after: 'Europe/Paris' },
  });

  // The same time zone again: no change, no log.
  const again = await lastLogId();
  assert.equal(await saveTimezone('Europe/Paris', admin.actor), 'Europe/Paris');
  assert.deepEqual(await timezoneLogs(again), []);
  await resetTimezone();
});

test('the time zone is stored in its canonical spelling (#66)', async () => {
  await withServer(async (api) => {
    const url = `${api}/settings/timezone`;
    for (const [sent, stored] of [
      ['europe/paris', 'Europe/Paris'],
      ['utc', 'UTC'],
    ]) {
      const response = await call(url, admin.token, 'PUT', { timezone: sent });
      assert.equal(response.status, 200, sent);
      assert.deepEqual(response.body.data, { timezone: stored });
      assert.equal(await storedValue(), stored);
    }
    // Another spelling of the stored zone is no change: no log.
    const from = await lastLogId();
    const again = await call(url, admin.token, 'PUT', { timezone: 'Utc' });
    assert.deepEqual(again.body.data, { timezone: 'UTC' });
    assert.deepEqual(await timezoneLogs(from), []);
  });
  await resetTimezone();
});

test('a stored time zone in another spelling is read in its canonical spelling', async () => {
  await testDb
    .update(appSettings)
    .set({ timezone: 'europe/paris' })
    .where(eq(appSettings.id, APP_SETTINGS_ID));
  assert.equal(await getTimezone(), 'Europe/Paris');
  await resetTimezone();
});

// --- Kiosk API and check-ins --------------------------------------------------------------

test('GET /api/checkins/schedule gives the time zone of the app', async () => {
  await saveTimezone('UTC', admin.actor);
  try {
    await withServer(async (api) => {
      const response = await call(`${api}/checkins/schedule`, volunteer.token);
      assert.equal(response.status, 200);
      assert.equal(response.body.data.timezone, 'UTC');
      assert.ok(response.body.data.schedule.monday);
    });
  } finally {
    await resetTimezone();
  }
});

const [member] = await testDb
  .insert(members)
  .values({ firstName: 'Miora', lastName: 'Rakoto' })
  .returning();
const [activity] = await testDb
  .insert(activities)
  .values({ name: 'English Club', startTime: '14:00', endTime: '16:00', createdBy: admin.actor.id })
  .returning();

/** A scan at the instant `checkInTime`, as if the server clock showed that time. */
function scan(checkInTime: string) {
  return createCheckin(
    {
      registrationNumber: member.registrationNumber,
      signature: signQRCode(member.registrationNumber).signature,
      activityId: activity.id,
    },
    new Date(checkInTime)
  );
}

async function clearCheckins() {
  await testDb.delete(checkins).where(eq(checkins.registrationNumber, member.registrationNumber));
}

test('a check-in is checked against the schedule in the time zone of the app', async () => {
  await clearCheckins();
  // Tuesday 13:00 UTC is 16:00 in Mahajanga: open with the default time zone.
  await scan('2026-11-10T13:00:00.000Z');
  await clearCheckins();

  await saveTimezone('UTC', admin.actor);
  try {
    // In UTC, 13:00 is between the two slots.
    await assert.rejects(scan('2026-11-10T13:00:00.000Z'), {
      message: 'Check-in on Tuesday is allowed 08:00–12:00, 15:00–18:00.',
    });
    // 07:00 UTC (10:00 in Mahajanga) is before the first slot in UTC.
    await assert.rejects(scan('2026-11-10T07:00:00.000Z'));
    // 09:00 UTC is in the morning slot in UTC.
    await scan('2026-11-10T09:00:00.000Z');
    await assert.rejects(scan('2026-11-10T11:00:00.000Z'), {
      message: 'Already scanned for this half day',
    });
    // 15:30 UTC is in the afternoon slot in UTC: another slot of the same day.
    await scan('2026-11-10T15:30:00.000Z');
  } finally {
    await resetTimezone();
    await clearCheckins();
  }
});
