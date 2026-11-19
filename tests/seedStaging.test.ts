import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { and, asc, eq, gte, isNotNull, isNull, lt, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { SeedDatabase } from '../src/db/seedStaging';

// The seed runs against an in-memory PostgreSQL (PGlite) with the real migrations.
// No local or remote database is used.
const migrationsFolder = fileURLToPath(new URL('../src/db/migrations', import.meta.url));
const originalDirectory = process.cwd();
process.chdir(tmpdir());
const schema = await import('../src/db/schema');
const seed = await import('../src/db/seedStaging');
process.chdir(originalDirectory);

const {
  activities,
  appSettings,
  auditLogs,
  bookLoans,
  checkins,
  members,
  rolePolicies,
  users,
  volunteers,
} = schema;
const { checkSeedEnvironment, countRows, runStagingSeed, seedStaging, shiftDate } = seed;

const GOOD_ENV = {
  APP_ENV: 'staging',
  SEED_INTERN_PASSWORD: 'intern-password-1',
  SEED_VOLUNTEER_PASSWORD: 'volunteer-password-1',
};
const passwords = {
  intern: GOOD_ENV.SEED_INTERN_PASSWORD,
  volunteer: GOOD_ENV.SEED_VOLUNTEER_PASSWORD,
};

async function newDatabase() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder });
  return db;
}
type TestDb = Awaited<ReturnType<typeof newDatabase>>;
const asSeedDb = (db: TestDb) => db as unknown as SeedDatabase;

test('the guard refuses when APP_ENV is not staging and opens no database', async () => {
  for (const appEnv of [undefined, '', 'production', 'development', 'Staging']) {
    const openDatabase = mock.fn(async () => {
      throw new Error('the database must not be opened');
    });
    await assert.rejects(
      runStagingSeed({ ...GOOD_ENV, APP_ENV: appEnv }, openDatabase),
      /APP_ENV must be "staging"/
    );
    assert.equal(openDatabase.mock.callCount(), 0);
  }
});

test('the guard refuses missing or short seed passwords and opens no database', async () => {
  const cases = [
    { SEED_INTERN_PASSWORD: undefined },
    { SEED_INTERN_PASSWORD: 'elevenchars' },
    { SEED_VOLUNTEER_PASSWORD: undefined },
    { SEED_VOLUNTEER_PASSWORD: 'short' },
  ];
  for (const override of cases) {
    const openDatabase = mock.fn(async () => {
      throw new Error('the database must not be opened');
    });
    const name = Object.keys(override)[0];
    await assert.rejects(
      runStagingSeed({ ...GOOD_ENV, ...override }, openDatabase),
      new RegExp(`${name} must contain at least 12 characters`)
    );
    assert.equal(openDatabase.mock.callCount(), 0);
  }
  assert.deepEqual(
    checkSeedEnvironment({
      ...GOOD_ENV,
      SEED_INTERN_PASSWORD: 'twelve-chars',
      SEED_VOLUNTEER_PASSWORD: 'twelve-chars',
    }),
    { intern: 'twelve-chars', volunteer: 'twelve-chars' }
  );
});

test('the seed refuses without an active admin and changes nothing', async () => {
  const db = await newDatabase();
  await db.insert(users).values([
    { username: 'old-admin', email: 'old@test.local', password: 'x', role: 'admin', active: false },
    { username: 'intern', email: 'intern@test.local', password: 'x', role: 'intern' },
  ]);
  await db.insert(members).values({ firstName: 'Keep' });
  await assert.rejects(
    seedStaging(asSeedDb(db), { passwords, bcryptRounds: 4 }),
    /no active admin user/
  );
  const counts = await countRows(asSeedDb(db));
  assert.equal(counts.users, 2);
  assert.equal(counts.members, 1);
});

test('two runs give the seed counts, the same distribution and keep the admin', async () => {
  const db = await newDatabase();
  const now = new Date();
  const today = shiftDate(now, 0);
  const [admin] = await db
    .insert(users)
    .values({ username: 'boss', email: 'boss@test.local', password: 'admin-hash', role: 'admin' })
    .returning();
  const [policiesBefore, settingsBefore] = await Promise.all([
    db.select().from(rolePolicies),
    db.select().from(appSettings),
  ]);

  // Data that the seed must remove: an old intern that owns rows, a check-in and a log.
  const [oldIntern] = await db
    .insert(users)
    .values({ username: 'old-intern', email: 'old@test.local', password: 'x', role: 'intern' })
    .returning();
  const [member] = await db.insert(members).values({ firstName: 'Old' }).returning();
  const [activity] = await db
    .insert(activities)
    .values({ name: 'Old', startTime: '10:00', endTime: '11:00', createdBy: oldIntern.id })
    .returning();
  await db
    .insert(volunteers)
    .values({ registrationNumber: member.registrationNumber, createdBy: oldIntern.id });
  await db.insert(bookLoans).values({
    registrationNumber: member.registrationNumber,
    bookTitle: 'Old',
    borrowingDate: today,
    expectedReturnDate: today,
    createdBy: oldIntern.id,
  });
  await db
    .insert(checkins)
    .values({ registrationNumber: member.registrationNumber, activityId: activity.id });
  await db.insert(auditLogs).values({
    actorId: oldIntern.id,
    actorUsername: 'old-intern',
    actorRole: 'intern',
    type: 'member.created',
    entity: 'member',
    entityId: '1',
    entityLabel: 'Old',
    changes: {},
  });

  const log = mock.method(console, 'log', () => {});
  try {
    for (let run = 0; run < 2; run++) {
      const counts = await runStagingSeed(
        GOOD_ENV,
        async () => ({ db: asSeedDb(db), close: async () => {} }),
        { now, bcryptRounds: 4 }
      );
      assert.deepEqual(counts, {
        users: 3,
        members: 40,
        volunteers: 8,
        activities: 6,
        book_loans: 15,
        checkins: 0,
        audit_logs: 0,
      });
    }
  } finally {
    log.mock.restore();
  }

  // The admin, the role policies and the settings did not change.
  const [adminAfter] = await db.select().from(users).where(eq(users.id, admin.id));
  assert.deepEqual(adminAfter, admin);
  assert.deepEqual(await db.select().from(rolePolicies), policiesBefore);
  assert.deepEqual(await db.select().from(appSettings), settingsBefore);

  const bcrypt = (await import('bcrypt')).default;
  const others = await db
    .select()
    .from(users)
    .where(ne(users.role, 'admin'))
    .orderBy(asc(users.username));
  assert.deepEqual(
    others.map((u) => [u.username, u.role, u.active]),
    [
      ['staging-intern', 'intern', true],
      ['staging-volunteer', 'volunteer', true],
    ]
  );
  assert.ok(await bcrypt.compare(passwords.intern, others[0].password));
  assert.ok(await bcrypt.compare(passwords.volunteer, others[1].password));

  // Members: every enum value, five with only a first name, joins over three years.
  const allMembers = await db.select().from(members);
  for (const [field, values] of [
    ['title', ['Miss', 'Mr', 'Mrs']],
    ['gender', ['male', 'female']],
    ['occupation', ['student', 'unemployed', 'employee', 'entrepreneur']],
  ] as const) {
    const seen = new Set(allMembers.map((m) => m[field]));
    for (const value of values) assert.ok(seen.has(value), `${field} ${value} is missing`);
  }
  const optional = [
    'lastName',
    'title',
    'gender',
    'birthDate',
    'birthPlace',
    'address',
    'occupation',
    'phoneNumber',
    'studyOrWorkPlace',
    'joinDate',
    'profileImage',
  ] as const;
  const firstNameOnly = allMembers.filter((m) => optional.every((field) => m[field] === null));
  assert.equal(firstNameOnly.length, 5);
  assert.ok(allMembers.every((m) => m.profileImage === null));
  const joinDates = allMembers.flatMap((m) => (m.joinDate ? [m.joinDate] : [])).sort();
  assert.ok(joinDates[0] < shiftDate(now, -2 * 365));
  assert.ok(joinDates[0] >= shiftDate(now, -3 * 365));
  assert.ok(joinDates[joinDates.length - 1] <= today);

  // Volunteers: each one is a seeded member; six valid, two expired.
  const allVolunteers = await db.select().from(volunteers);
  const memberIds = new Set(allMembers.map((m) => m.registrationNumber));
  assert.ok(allVolunteers.every((v) => memberIds.has(v.registrationNumber as number)));
  assert.equal(new Set(allVolunteers.map((v) => v.registrationNumber)).size, 8);
  assert.equal(allVolunteers.filter((v) => (v.expirationDate as string) > today).length, 6);
  assert.equal(allVolunteers.filter((v) => (v.expirationDate as string) < today).length, 2);
  assert.ok(allVolunteers.every((v) => v.createdBy === admin.id));

  // Activities: three weekly on different days, two in the future, one in the past.
  const allActivities = await db.select().from(activities);
  const weekly = allActivities.filter((a) => a.isPeriodic);
  assert.equal(weekly.length, 3);
  assert.equal(new Set(weekly.map((a) => a.dayOfWeek)).size, 3);
  assert.ok(weekly.every((a) => a.dayOfWeek !== null && a.dayOfWeek !== 'everyday'));
  const dated = allActivities.filter((a) => !a.isPeriodic);
  assert.equal(dated.filter((a) => (a.startDate as string) > today).length, 2);
  assert.equal(dated.filter((a) => (a.endDate as string) < today).length, 1);
  assert.ok(allActivities.every((a) => a.createdBy === admin.id));

  // Book loans: six open on time, four open and late, five returned.
  const loanCount = async (condition: Parameters<typeof and>[0]) =>
    (await db.select().from(bookLoans).where(condition)).length;
  assert.equal(
    await loanCount(
      and(isNull(bookLoans.effectiveReturnDate), gte(bookLoans.expectedReturnDate, today))
    ),
    6
  );
  assert.equal(
    await loanCount(
      and(isNull(bookLoans.effectiveReturnDate), lt(bookLoans.expectedReturnDate, today))
    ),
    4
  );
  assert.equal(await loanCount(isNotNull(bookLoans.effectiveReturnDate)), 5);
});
