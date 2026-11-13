import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { asc, eq, gt, sql } from 'drizzle-orm';
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
const audit = await import('../src/services/auditService');
const { registerUser, updateOwnProfile, updateUserAccess } = await import(
  '../src/services/userService'
);
const { defaultPermissions, getRolePolicy, saveRolePolicy } = await import(
  '../src/services/accessService'
);
const { createMember, deleteMember, updateMember } = await import('../src/services/memberService');
const { createActivity, deleteActivity, updateActivity } = await import(
  '../src/services/activityService'
);
const { createCheckin, deleteCheckin } = await import('../src/services/checkinService');
const { createVolunteer, deleteVolunteer, updateVolunteer } = await import(
  '../src/services/volunteerService'
);
const { createBookLoan, returnBookLoan, updateBookLoan } = await import(
  '../src/services/bookLoanService'
);
const { signQRCode } = await import('../src/utils/qrUtils');
const { generateToken } = await import('../src/utils/jwtUtils');
const { default: settingsRoutes } = await import('../src/routes/settingsRoutes');
process.chdir(originalDirectory);

const { activities, auditLogs, bookLoans, checkins, members, rolePolicies, users, volunteers } =
  schema;

const testDb = drizzle(new PGlite(), { schema });
await migrate(testDb, { migrationsFolder });
for (const method of ['select', 'selectDistinct', 'insert', 'update', 'delete', 'transaction']) {
  const target = testDb as unknown as Record<string, (...args: unknown[]) => unknown>;
  mock.method(db, method as 'select', (...args: unknown[]) => target[method](...args));
}

const bcrypt = (await import('bcrypt')).default;
const ADMIN_PASSWORD = 'admin-pass-1';
const [adminRow] = await testDb
  .insert(users)
  .values({
    username: 'boss',
    email: 'boss@test.local',
    password: await bcrypt.hash(ADMIN_PASSWORD, 4),
    role: 'admin',
  })
  .returning();
const admin = { id: adminRow.id, username: adminRow.username, role: 'admin' };

type LogRow = typeof auditLogs.$inferSelect;

async function lastLogId(): Promise<number> {
  const [row] = await testDb
    .select({ max: sql<number>`coalesce(max(${auditLogs.id}), 0)` })
    .from(auditLogs);
  return Number(row.max);
}

/** Runs `action` and returns the log rows that it wrote, oldest first. */
async function logsOf(action: () => Promise<unknown>): Promise<LogRow[]> {
  const from = await lastLogId();
  await action();
  return testDb.select().from(auditLogs).where(gt(auditLogs.id, from)).orderBy(asc(auditLogs.id));
}

function assertActor(log: LogRow) {
  assert.equal(log.actorId, admin.id);
  assert.equal(log.actorUsername, 'boss');
  assert.equal(log.actorRole, 'admin');
}

async function newMember(firstName = 'Miora', lastName: string | null = 'Rakoto') {
  const [member] = await testDb.insert(members).values({ firstName, lastName }).returning();
  return member;
}

async function newActivity(name = 'English Club') {
  const [activity] = await testDb
    .insert(activities)
    .values({ name, startTime: '14:00', endTime: '16:00', createdBy: admin.id })
    .returning();
  return activity;
}

async function newCheckin(registrationNumber: number, activityId: number) {
  const [checkin] = await testDb
    .insert(checkins)
    .values({ registrationNumber, activityId, checkInTime: new Date('2026-11-10T06:30:00Z') })
    .returning();
  return checkin;
}

// --- Step 1: the comparison of two rows -------------------------------------------------

test('diffRows returns only the changed fields and ignores updatedAt and password', () => {
  const before = {
    id: 1,
    firstName: 'Miora',
    phoneNumber: '034',
    profileImage: null,
    password: 'old-hash',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    permissions: { a: true },
  };
  const after = {
    ...before,
    phoneNumber: '032',
    profileImage: 'members/x.png',
    password: 'new-hash',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    permissions: { a: true },
  };
  const changes = audit.diffRows(before, after);
  assert.deepEqual(changes, {
    phoneNumber: { before: '034', after: '032' },
    profileImage: { before: null, after: 'members/x.png' },
  });
  assert.equal('password' in changes, false);
  assert.equal('updatedAt' in changes, false);
  assert.deepEqual(audit.diffRows(before, { ...before }), {});
});

test('snapshot and writeLog never keep the password column', async () => {
  assert.deepEqual(audit.snapshot({ id: 1, username: 'a', password: 'hash' }), {
    id: 1,
    username: 'a',
  });
  const logs = await logsOf(() =>
    testDb.transaction((tx) =>
      audit.writeLog(tx, admin, {
        type: 'user.created',
        entity: 'users',
        entityId: 99,
        entityLabel: 'x',
        changes: { username: 'x', password: 'secret' },
      })
    )
  );
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0].changes, { username: 'x' });
  await testDb.delete(auditLogs).where(eq(auditLogs.id, logs[0].id));
});

test('labels: members are "LASTNAME Firstname"', () => {
  assert.equal(audit.memberLabel({ firstName: 'Miora', lastName: 'Rakoto' }), 'RAKOTO Miora');
  assert.equal(audit.memberLabel({ firstName: 'Soa', lastName: null }), 'Soa');
});

// --- Step 2: one test for each row of "Rules for each write" ------------------------------

test('registerUser writes user.created with the row and without the password', async () => {
  const logs = await logsOf(() =>
    registerUser(
      { username: 'tiana', email: 'tiana@test.local', password: 'Password123', role: 'intern' },
      admin
    )
  );
  assert.equal(logs.length, 1);
  const [log] = logs;
  assertActor(log);
  assert.equal(log.type, 'user.created');
  assert.equal(log.entity, 'users');
  assert.equal(log.entityLabel, 'tiana');
  assert.equal((log.changes as Record<string, unknown>).role, 'intern');
  assert.equal('password' in log.changes, false);
  assert.doesNotMatch(JSON.stringify(log), /password|Password123|\$2[aby]\$/);
});

test('updateOwnProfile logs the username/email change and, separately, a password change', async () => {
  const [user] = await testDb
    .insert(users)
    .values({
      username: 'lova',
      email: 'lova@test.local',
      password: await bcrypt.hash('Current123', 4),
      role: 'volunteer',
    })
    .returning();
  const self = { id: user.id, username: 'lova', role: 'volunteer' };

  const logs = await logsOf(() =>
    updateOwnProfile(
      user.id,
      { username: 'lova2', currentPassword: 'Current123', newPassword: 'Newpass123' },
      self
    )
  );
  assert.deepEqual(
    logs.map((log) => log.type),
    ['user.profile_updated', 'user.password_changed']
  );
  assert.deepEqual(logs[0].changes, { username: { before: 'lova', after: 'lova2' } });
  assert.deepEqual(logs[1].changes, {});
  assert.equal(logs[0].actorId, user.id);
  assert.doesNotMatch(JSON.stringify(logs), /password"|Newpass123|Current123|\$2[aby]\$/);

  const noChange = await logsOf(() =>
    updateOwnProfile(
      user.id,
      { username: 'lova2', currentPassword: 'Newpass123', newPassword: 'Newpass123' },
      self
    )
  );
  assert.deepEqual(noChange, [], 'same username and same password: no log');
});

test('PUT /settings/users/:id (updateUserAccess) writes one log for each changed field', async () => {
  const [user] = await testDb
    .insert(users)
    .values({ username: 'njaka', email: 'njaka@test.local', password: 'x', role: 'volunteer' })
    .returning();

  const both = await logsOf(() =>
    updateUserAccess(user.id, { role: 'intern', active: false }, admin)
  );
  assert.deepEqual(
    both.map((log) => [log.type, log.changes]),
    [
      ['user.role_changed', { role: { before: 'volunteer', after: 'intern' } }],
      ['user.activation_changed', { active: { before: true, after: false } }],
    ]
  );
  assert.equal(both[0].entityLabel, 'njaka');

  const one = await logsOf(() =>
    updateUserAccess(user.id, { role: 'intern', active: true }, admin)
  );
  assert.deepEqual(
    one.map((log) => log.type),
    ['user.activation_changed']
  );
  const none = await logsOf(() =>
    updateUserAccess(user.id, { role: 'intern', active: true }, admin)
  );
  assert.deepEqual(none, []);

  await assert.rejects(
    updateUserAccess(admin.id, { role: 'intern', active: true }, admin),
    /You cannot remove your own admin access/
  );
  await assert.rejects(updateUserAccess(999_999, { role: 'intern', active: true }, admin), {
    message: 'User not found',
  });
});

test('saveRolePolicy without a stored row writes role_policy.created against the defaults', async () => {
  await testDb.delete(rolePolicies).where(eq(rolePolicies.role, 'volunteer'));
  const defaults = defaultPermissions('volunteer');
  const permissions = { ...defaults, 'members.create': true, 'books.view': false };

  const logs = await logsOf(() => saveRolePolicy('volunteer', true, permissions, admin));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].type, 'role_policy.created');
  assert.equal(logs[0].entity, 'role_policies');
  assert.equal(logs[0].entityId, 'volunteer');
  assert.equal(logs[0].entityLabel, 'volunteer');
  assert.deepEqual(logs[0].changes, {
    'members.create': { before: false, after: true },
    'books.view': { before: true, after: false },
  });
});

test('saveRolePolicy with a stored row logs permission changes and status changes apart', async () => {
  const current = await getRolePolicy('intern');
  const permissions = {
    ...current.permissions,
    'members.delete': !current.permissions['members.delete'],
    'books.update': !current.permissions['books.update'],
  };
  const logs = await logsOf(() => saveRolePolicy('intern', false, permissions, admin));
  assert.deepEqual(
    logs.map((log) => log.type),
    ['role_policy.permissions_changed', 'role_policy.activation_changed']
  );
  assert.deepEqual(Object.keys(logs[0].changes).sort(), ['books.update', 'members.delete']);
  assert.deepEqual(logs[1].changes, { active: { before: true, after: false } });

  const same = await logsOf(() => saveRolePolicy('intern', false, permissions, admin));
  assert.deepEqual(same, [], 'a save that changes nothing writes no log');
});

test('createMember, updateMember and deleteMember write member.* logs (with profileImage)', async () => {
  let registrationNumber = 0;
  const created = await logsOf(async () => {
    const member = await createMember(
      {
        firstName: 'Kanto',
        lastName: 'Razafy',
        title: null,
        gender: null,
        birthDate: null,
        birthPlace: null,
        address: null,
        occupation: 'student',
        phoneNumber: '034',
        studyOrWorkPlace: null,
        joinDate: null,
        profileImage: 'members/a.png',
      },
      admin
    );
    registrationNumber = member.registrationNumber;
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'member.created');
  assert.equal(created[0].entityId, String(registrationNumber));
  assert.equal(created[0].entityLabel, 'RAZAFY Kanto');
  assert.equal((created[0].changes as Record<string, unknown>).profileImage, 'members/a.png');

  const updated = await logsOf(() =>
    updateMember(
      registrationNumber,
      { phoneNumber: '032', occupation: 'employee', profileImage: 'members/b.png' },
      admin
    )
  );
  assert.equal(updated.length, 1);
  assert.equal(updated[0].type, 'member.updated');
  assert.deepEqual(updated[0].changes, {
    phoneNumber: { before: '034', after: '032' },
    occupation: { before: 'student', after: 'employee' },
    profileImage: { before: 'members/a.png', after: 'members/b.png' },
  });

  const unchanged = await logsOf(() =>
    updateMember(registrationNumber, { phoneNumber: '032', profileImage: 'members/b.png' }, admin)
  );
  assert.deepEqual(unchanged, [], 'an update that changes no field writes no log');

  const deleted = await logsOf(() => deleteMember(registrationNumber, admin));
  assert.deepEqual(
    deleted.map((log) => log.type),
    ['member.deleted']
  );
  assert.equal((deleted[0].changes as Record<string, unknown>).phoneNumber, '032');
});

test('deleteMember logs each deleted check-in and volunteer row with the member as parent', async () => {
  const member = await newMember('Soa', 'Rabe');
  const internet = await newActivity('Internet');
  const reading = await newActivity('Reading');
  const first = await newCheckin(member.registrationNumber, internet.id);
  const second = await newCheckin(member.registrationNumber, reading.id);
  const [volunteer] = await testDb
    .insert(volunteers)
    .values({ registrationNumber: member.registrationNumber, createdBy: admin.id })
    .returning();

  const logs = await logsOf(() => deleteMember(member.registrationNumber, admin));
  assert.deepEqual(
    logs.map((log) => [log.type, log.entityId, log.entityLabel]),
    [
      ['checkin.cascade_deleted', String(first.id), 'RABE Soa, Internet'],
      ['checkin.cascade_deleted', String(second.id), 'RABE Soa, Reading'],
      ['volunteer.cascade_deleted', String(volunteer.id), 'RABE Soa'],
      ['member.deleted', String(member.registrationNumber), 'RABE Soa'],
    ]
  );
  for (const log of logs.slice(0, 3)) {
    assert.equal(log.parentEntity, 'members');
    assert.equal(log.parentId, String(member.registrationNumber));
    assert.equal(log.parentLabel, 'RABE Soa');
  }
  assert.equal(logs[3].parentEntity, null);
  assert.equal(
    (logs[0].changes as Record<string, unknown>).checkInTime,
    '2026-11-10T06:30:00.000Z'
  );
  const left = await testDb.select().from(checkins).where(eq(checkins.activityId, internet.id));
  assert.deepEqual(left, []);
});

test('createActivity, updateActivity and deleteActivity write activity.* logs and cascade logs', async () => {
  let id = 0;
  const created = await logsOf(async () => {
    const activity = await createActivity(
      {
        name: 'Chess',
        isPeriodic: true,
        dayOfWeek: 'wednesday',
        startTime: '14:00',
        endTime: '16:00',
        startDate: null,
        endDate: null,
      },
      admin
    );
    id = activity.id;
    assert.equal(activity.createdBy, admin.id);
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'activity.created');
  assert.equal(created[0].entityLabel, 'Chess');
  const snapshot = created[0].changes as Record<string, unknown>;
  assert.equal(snapshot.startTime, '14:00:00');
  assert.equal(snapshot.endTime, '16:00:00');

  const updated = await logsOf(() =>
    updateActivity(id, { dayOfWeek: 'friday', endTime: '17:00' }, admin)
  );
  assert.deepEqual(updated[0].changes, {
    dayOfWeek: { before: 'wednesday', after: 'friday' },
    endTime: { before: '16:00:00', after: '17:00:00' },
  });
  assert.deepEqual(await logsOf(() => updateActivity(id, { dayOfWeek: 'friday' }, admin)), []);

  const member = await newMember('Lova', 'Andria');
  const checkin = await newCheckin(member.registrationNumber, id);
  const deleted = await logsOf(() => deleteActivity(id, admin));
  assert.deepEqual(
    deleted.map((log) => [
      log.type,
      log.entityLabel,
      log.parentEntity,
      log.parentId,
      log.parentLabel,
    ]),
    [
      ['checkin.cascade_deleted', 'ANDRIA Lova, Chess', 'activities', String(id), 'Chess'],
      ['activity.deleted', 'Chess', null, null, null],
    ]
  );
  assert.equal(deleted[0].entityId, String(checkin.id));
});

test('deleteCheckin writes checkin.deleted; creating a check-in writes no log', async () => {
  const member = await newMember('Haja', 'Rabe');
  const activity = await newActivity('Kiosk');
  let checkinId = 0;
  const created = await logsOf(async () => {
    const checkin = await createCheckin({
      registrationNumber: member.registrationNumber,
      signature: signQRCode(member.registrationNumber).signature,
      activityId: activity.id,
      checkInTime: '2026-11-10T06:00:00.000Z', // Tuesday 09:00 in Mahajanga
    });
    checkinId = checkin.id;
  });
  assert.deepEqual(created, []);

  const deleted = await logsOf(() => deleteCheckin(checkinId, admin));
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].type, 'checkin.deleted');
  assert.equal(deleted[0].entityLabel, 'RABE Haja, Kiosk');
  assert.equal(
    (deleted[0].changes as Record<string, unknown>).checkInTime,
    '2026-11-10T06:00:00.000Z'
  );
});

test('createVolunteer writes one volunteer.created log for each inserted row', async () => {
  // src/db/schema.ts declares volunteers.registration_number nullable, but no migration
  // drops the NOT NULL of 0000. Mirror the schema here to cover the label without a member.
  await testDb.execute(sql`alter table volunteers alter column registration_number drop not null`);
  const first = await newMember('Tojo', 'Randria');
  const second = await newMember('Fara', 'Rasoa');
  const logs = await logsOf(() =>
    createVolunteer(
      [
        {
          registrationNumber: first.registrationNumber,
          role: null,
          joinDate: '2026-01-01',
          expirationDate: null,
        },
        {
          registrationNumber: second.registrationNumber,
          role: null,
          joinDate: null,
          expirationDate: null,
        },
        { registrationNumber: null, role: null, joinDate: null, expirationDate: null },
      ],
      admin
    )
  );
  assert.deepEqual(
    logs.map((log) => [log.type, log.entityLabel]),
    [
      ['volunteer.created', 'RANDRIA Tojo'],
      ['volunteer.created', 'RASOA Fara'],
      ['volunteer.created', audit.VOLUNTEER_WITHOUT_MEMBER_LABEL],
    ]
  );
  const single = await logsOf(() =>
    createVolunteer(
      {
        registrationNumber: first.registrationNumber,
        role: null,
        joinDate: null,
        expirationDate: null,
      },
      admin
    )
  );
  assert.equal(single.length, 1);
});

test('updateVolunteer and deleteVolunteer write volunteer.updated (never role) and volunteer.deleted', async () => {
  const member = await newMember('Mamy', 'Rakoto');
  const [volunteer] = await testDb
    .insert(volunteers)
    .values({
      registrationNumber: member.registrationNumber,
      joinDate: '2026-01-01',
      role: 'helper',
      createdBy: admin.id,
    })
    .returning();

  const updated = await logsOf(() =>
    updateVolunteer(volunteer.id, { role: 'leader', expirationDate: '2027-01-01' }, admin)
  );
  assert.equal(updated.length, 1);
  assert.equal(updated[0].type, 'volunteer.updated');
  assert.deepEqual(updated[0].changes, {
    expirationDate: { before: null, after: '2027-01-01' },
  });
  assert.deepEqual(
    await logsOf(() => updateVolunteer(volunteer.id, { role: 'other' }, admin)),
    [],
    'role is ignored by updateVolunteer, so this update changes no field'
  );

  const deleted = await logsOf(() => deleteVolunteer(volunteer.id, admin));
  assert.deepEqual(
    deleted.map((log) => [log.type, log.entityLabel]),
    [['volunteer.deleted', 'RAKOTO Mamy']]
  );
});

test('book loans: created, updated, and returned with exactly one book_loan.returned log', async () => {
  const member = await newMember('Soa', 'Rabe');
  let id = 0;
  const created = await logsOf(async () => {
    const loan = await createBookLoan(
      {
        registrationNumber: member.registrationNumber,
        bookTitle: 'Things Fall Apart',
        borrowingDate: '2026-11-01',
        expectedReturnDate: '2026-11-08',
        effectiveReturnDate: null,
      },
      admin
    );
    id = loan?.id ?? 0;
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'book_loan.created');
  assert.equal(created[0].entityLabel, 'Things Fall Apart, RABE Soa');
  assert.equal((created[0].changes as Record<string, unknown>).borrowingDate, '2026-11-01');

  const updated = await logsOf(() =>
    updateBookLoan(id, { expectedReturnDate: '2026-11-15' }, admin)
  );
  assert.deepEqual(
    updated.map((log) => [log.type, log.changes]),
    [['book_loan.updated', { expectedReturnDate: { before: '2026-11-08', after: '2026-11-15' } }]]
  );

  const returned = await logsOf(() => returnBookLoan(id, '2026-11-12', admin));
  assert.deepEqual(
    returned.map((log) => [log.type, log.changes]),
    [['book_loan.returned', { effectiveReturnDate: { before: null, after: '2026-11-12' } }]]
  );
  assert.deepEqual(await logsOf(() => returnBookLoan(id, '2026-11-12', admin)), []);
  await testDb.delete(bookLoans).where(eq(bookLoans.id, id));
});

// --- Step 3: a failing log rolls the change back ------------------------------------------

test('when writeLog fails, the change is not in the database', async () => {
  const member = await newMember('Tiana', 'Rabe');
  const countMembers = async () =>
    Number((await testDb.select({ n: sql<number>`count(*)` }).from(members))[0].n);
  const before = await countMembers();

  await testDb.execute(sql`alter table audit_logs rename to audit_logs_unavailable`);
  try {
    await assert.rejects(
      createMember(
        {
          firstName: 'Ghost',
          lastName: null,
          title: null,
          gender: null,
          birthDate: null,
          birthPlace: null,
          address: null,
          occupation: null,
          phoneNumber: null,
          studyOrWorkPlace: null,
          joinDate: null,
        },
        admin
      )
    );
    await assert.rejects(updateMember(member.registrationNumber, { firstName: 'Changed' }, admin));
    await assert.rejects(deleteMember(member.registrationNumber, admin));
  } finally {
    await testDb.execute(sql`alter table audit_logs_unavailable rename to audit_logs`);
  }

  assert.equal(await countMembers(), before);
  const [stored] = await testDb
    .select()
    .from(members)
    .where(eq(members.registrationNumber, member.registrationNumber));
  assert.equal(stored.firstName, 'Tiana');
});

// --- Step 4: the read route ---------------------------------------------------------------

async function withSettingsServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRoutes);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/settings`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /api/settings/logs answers 403 to an intern and 401 without a token', async () => {
  const [intern] = await testDb
    .insert(users)
    .values({ username: 'fanja', email: 'fanja@test.local', password: 'x', role: 'intern' })
    .returning();
  // The intern role was deactivated by an earlier test: reactivate it, so the 403 comes
  // from the settings.manage gate and not from the inactive role.
  await testDb.update(rolePolicies).set({ active: true }).where(eq(rolePolicies.role, 'intern'));
  const token = generateToken({ id: intern.id, username: intern.username, email: intern.email });

  await withSettingsServer(async (baseUrl) => {
    const forbidden = await fetch(`${baseUrl}/logs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(forbidden.status, 403);
    const anonymous = await fetch(`${baseUrl}/logs`);
    assert.equal(anonymous.status, 401);
  });
});

test('GET /api/settings/logs returns the rows newest first and applies each filter', async () => {
  const token = generateToken({ id: admin.id, username: admin.username, email: 'boss@test.local' });
  const get = async (baseUrl: string, query: string) => {
    const response = await fetch(`${baseUrl}/logs${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: await response.json() };
  };

  await withSettingsServer(async (baseUrl) => {
    const all = await get(baseUrl, '?limit=100');
    assert.equal(all.status, 200);
    assert.equal(all.body.success, true);
    const ids = all.body.data.map((row: LogRow) => row.id);
    assert.deepEqual(
      ids,
      [...ids].sort((a, b) => b - a),
      'newest first'
    );
    assert.equal(all.body.pagination.limit, 100);

    const page = await get(baseUrl, '?limit=2&offset=1');
    assert.deepEqual(
      page.body.data.map((row: LogRow) => row.id),
      ids.slice(1, 3)
    );
    assert.equal(page.body.pagination.total, all.body.pagination.total);

    const byType = await get(baseUrl, '?type=book_loan.returned');
    assert.ok(byType.body.data.length > 0);
    assert.ok(byType.body.data.every((row: LogRow) => row.type === 'book_loan.returned'));

    const byEntity = await get(baseUrl, '?entity=role_policies&limit=100');
    assert.ok(byEntity.body.data.every((row: LogRow) => row.entity === 'role_policies'));

    const search = await get(baseUrl, '?search=rabe%20soa&limit=100');
    assert.ok(search.body.data.length > 0);
    assert.ok(search.body.data.every((row: LogRow) => /rabe soa/i.test(row.entityLabel)));

    const byActor = await get(baseUrl, `?actorId=${admin.id}&limit=100`);
    assert.ok(byActor.body.data.every((row: LogRow) => row.actorId === admin.id));
    const byOtherActor = await get(baseUrl, '?actorId=999999');
    assert.deepEqual(byOtherActor.body.data, []);

    const today = new Date().toISOString().slice(0, 10);
    const inRange = await get(baseUrl, `?from=${today}&to=${today}&limit=100`);
    assert.equal(inRange.body.pagination.total, all.body.pagination.total);
    const past = await get(baseUrl, '?from=2000-01-01&to=2000-01-02');
    assert.equal(past.body.pagination.total, 0);
    const future = await get(baseUrl, `?from=${new Date(Date.now() + 60_000).toISOString()}`);
    assert.equal(future.body.pagination.total, 0);

    assert.equal((await get(baseUrl, '?type=unknown')).status, 422);
    assert.equal((await get(baseUrl, '?limit=101')).status, 422);
    assert.equal((await get(baseUrl, '?from=yesterday')).status, 422);
  });
});

// --- More cases around the stored rows and the read function ------------------------------
// These tests add rows with old dates: keep them after the tests of the read route above.

const { auditLogQuerySchema } = await import('../src/schemas/auditSchema');

test('writeLog stores the ids as text, and no parent when the entry has none', async () => {
  const logs = await logsOf(() =>
    db.transaction(async (tx) => {
      await audit.writeLog(tx, admin, {
        type: 'member.created',
        entity: 'members',
        entityId: 4321,
        entityLabel: 'TEXT Id',
        changes: { firstName: 'Id' },
      });
      await audit.writeLog(tx, admin, {
        type: 'checkin.cascade_deleted',
        entity: 'checkins',
        entityId: 99,
        entityLabel: 'TEXT Id, Club',
        parentEntity: 'members',
        parentId: 4321,
        parentLabel: 'TEXT Id',
        changes: {},
      });
    })
  );
  assert.equal(logs.length, 2);
  assert.equal(logs[0].entityId, '4321');
  assert.equal(logs[0].parentEntity, null);
  assert.equal(logs[0].parentId, null);
  assert.equal(logs[0].parentLabel, null);
  assert.equal(logs[1].parentEntity, 'members');
  assert.equal(logs[1].parentId, '4321');
  assert.equal(logs[1].parentLabel, 'TEXT Id');
  assert.ok(logs[0].createdAt instanceof Date);
});

test('a first save that also deactivates the role logs the creation and the status', async () => {
  await testDb.delete(rolePolicies).where(eq(rolePolicies.role, 'volunteer'));
  const logs = await logsOf(() =>
    saveRolePolicy('volunteer', false, defaultPermissions('volunteer'), admin)
  );
  assert.deepEqual(
    logs.map((log) => log.type),
    ['role_policy.created', 'role_policy.activation_changed']
  );
  assert.deepEqual(logs[0].changes, {}, 'no permission differs from the defaults');
  assert.deepEqual(logs[1].changes, { active: { before: true, after: false } });
});

test('the admin role keeps settings.manage and stays active in its log', async () => {
  await testDb.delete(rolePolicies).where(eq(rolePolicies.role, 'admin'));
  const permissions = { ...defaultPermissions('admin'), 'settings.manage': false };
  const logs = await logsOf(() => saveRolePolicy('admin', false, permissions, admin));
  assert.deepEqual(
    logs.map((log) => log.type),
    ['role_policy.created']
  );
  assert.deepEqual(logs[0].changes, {});
});

test('a member with a book loan is not deleted: nothing is removed and no log is written', async () => {
  const member = await newMember('Soa', 'Loankeeper');
  const activity = await newActivity('Reading Club');
  const checkin = await newCheckin(member.registrationNumber, activity.id);
  await testDb.insert(bookLoans).values({
    registrationNumber: member.registrationNumber,
    bookTitle: 'Kept Book',
    borrowingDate: '2026-11-01',
    expectedReturnDate: '2026-11-15',
  });

  let failure: unknown;
  const logs = await logsOf(async () => {
    try {
      await deleteMember(member.registrationNumber, admin);
    } catch (error) {
      failure = error;
    }
  });

  assert.ok(failure, 'the delete is refused');
  assert.deepEqual(logs, []);
  const [keptMember] = await testDb
    .select()
    .from(members)
    .where(eq(members.registrationNumber, member.registrationNumber));
  assert.ok(keptMember, 'the member is still there');
  const [keptCheckin] = await testDb.select().from(checkins).where(eq(checkins.id, checkin.id));
  assert.ok(keptCheckin, 'the check-in of the member is still there');
});

test('getLogs reads "%" and "_" in the search as plain characters', async () => {
  await db.transaction(async (tx) => {
    for (const entityLabel of ['Wild 100% sure', 'Wild 100x sure', 'Under_score', 'Underxscore']) {
      await audit.writeLog(tx, admin, {
        type: 'activity.created',
        entity: 'activities',
        entityId: 1,
        entityLabel,
        changes: {},
      });
    }
  });
  const labels = async (search: string) =>
    (await audit.getLogs(auditLogQuerySchema.parse({ search, limit: 100 }))).data
      .map((row) => row.entityLabel)
      .sort();

  assert.deepEqual(await labels('100%'), ['Wild 100% sure']);
  assert.deepEqual(await labels('under_score'), ['Under_score']);
  assert.deepEqual(await labels('wild 100'), ['Wild 100% sure', 'Wild 100x sure']);
});

test('getLogs searches the label and the username of the actor, in any case', async () => {
  await db.transaction(async (tx) => {
    await audit.writeLog(
      tx,
      { id: 4242, username: 'Zanaka', role: 'intern' },
      {
        type: 'activity.created',
        entity: 'activities',
        entityId: 2,
        entityLabel: 'Quoridor evening',
        changes: {},
      }
    );
  });
  const search = async (text: string) =>
    (await audit.getLogs(auditLogQuerySchema.parse({ search: text }))).data;

  assert.equal((await search('zanaka')).length, 1);
  assert.equal((await search('QUORIDOR')).length, 1);
  assert.equal((await search('zanaka'))[0].actorRole, 'intern');
  assert.deepEqual(await search('no-such-text-anywhere'), []);
});

test('getLogs: a day as "to" includes the whole day, a date-time is an exact bound', async () => {
  const base = {
    actorId: admin.id,
    actorUsername: 'boss',
    actorRole: 'admin',
    type: 'activity.created',
    entity: 'activities',
    entityId: '3',
    changes: {},
  };
  await testDb.insert(auditLogs).values([
    { ...base, entityLabel: 'day start', createdAt: new Date('2020-05-10T00:00:00.000Z') },
    { ...base, entityLabel: 'day end', createdAt: new Date('2020-05-10T23:59:59.999Z') },
    { ...base, entityLabel: 'next day', createdAt: new Date('2020-05-11T00:00:00.000Z') },
  ]);
  const labels = async (from: string, to: string) =>
    (await audit.getLogs(auditLogQuerySchema.parse({ from, to }))).data.map(
      (row) => row.entityLabel
    );

  // Newest first.
  assert.deepEqual(await labels('2020-05-10', '2020-05-10'), ['day end', 'day start']);
  assert.deepEqual(await labels('2020-05-11', '2020-05-11'), ['next day']);
  assert.deepEqual(await labels('2020-05-10', '2020-05-11'), ['next day', 'day end', 'day start']);
  assert.deepEqual(await labels('2020-05-10T00:00:00.000Z', '2020-05-10T12:00:00.000Z'), [
    'day start',
  ]);
  assert.deepEqual(await labels('2020-05-10T03:00:00+03:00', '2020-05-10T23:59:59.999Z'), [
    'day end',
    'day start',
  ]);
  assert.deepEqual(await labels('2020-05-12', '2020-05-20'), []);
});

test('getLogs tells whether more rows follow the page', async () => {
  const total = (await audit.getLogs(auditLogQuerySchema.parse({ limit: 1 }))).pagination.total;
  assert.ok(total > 2);

  const first = await audit.getLogs(auditLogQuerySchema.parse({ limit: 1 }));
  assert.equal(first.data.length, 1);
  assert.deepEqual(first.pagination, { offset: 0, limit: 1, total, hasMore: true });

  const last = await audit.getLogs(auditLogQuerySchema.parse({ limit: 1, offset: total - 1 }));
  assert.equal(last.data.length, 1);
  assert.equal(last.pagination.hasMore, false);

  const beyond = await audit.getLogs(auditLogQuerySchema.parse({ offset: total + 10 }));
  assert.deepEqual(beyond.data, []);
  assert.equal(beyond.pagination.total, total);
  assert.equal(beyond.pagination.hasMore, false);
});

test('getLogs combines the filters', async () => {
  const query = auditLogQuerySchema.parse({
    entity: 'activities',
    type: 'activity.created',
    actorId: 4242,
    search: 'quoridor',
  });
  const { data } = await audit.getLogs(query);
  assert.equal(data.length, 1);
  assert.equal(data[0].entityLabel, 'Quoridor evening');

  const none = await audit.getLogs({ ...query, entity: 'members' });
  assert.deepEqual(none.data, []);
});
