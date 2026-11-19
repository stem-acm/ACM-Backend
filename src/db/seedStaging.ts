import 'dotenv/config';
import bcrypt from 'bcrypt';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { NewActivity, NewBookLoan, NewMember } from '@/db/schema';
import * as schema from '@/db/schema';

// Staging seed: it replaces the club data of the staging database with fictional data.
// All names, addresses, schools and phone numbers below are invented.
// The script keeps the admin accounts, `role_policies` and `app_settings`.
// `src/db/seed.ts` stays for local development only.

const { activities, auditLogs, bookLoans, checkins, members, users, volunteers } = schema;

export type SeedDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export const STAGING_APP_ENV = 'staging';
export const MIN_SEED_PASSWORD_LENGTH = 12;
export const STAGING_INTERN_USERNAME = 'staging-intern';
export const STAGING_VOLUNTEER_USERNAME = 'staging-volunteer';

export interface SeedPasswords {
  intern: string;
  volunteer: string;
}

export interface SeedOptions {
  passwords: SeedPasswords;
  /** The run date. All seed dates are calculated from it. */
  now?: Date;
  /** bcrypt cost. Tests use a low cost to stay fast. */
  bcryptRounds?: number;
}

export type RowCounts = Record<
  'users' | 'members' | 'volunteers' | 'activities' | 'book_loans' | 'checkins' | 'audit_logs',
  number
>;

/**
 * Checks the environment before any database use. It returns the seed passwords,
 * or throws when the environment is not staging or a password is too short.
 */
export function checkSeedEnvironment(env: NodeJS.ProcessEnv): SeedPasswords {
  if (env.APP_ENV !== STAGING_APP_ENV) {
    throw new Error(
      `Refusing to seed: APP_ENV must be "${STAGING_APP_ENV}" (current value: ${
        env.APP_ENV === undefined ? 'not set' : `"${env.APP_ENV}"`
      }). This script deletes data and runs only on staging.`
    );
  }
  const passwords: SeedPasswords = {
    intern: env.SEED_INTERN_PASSWORD ?? '',
    volunteer: env.SEED_VOLUNTEER_PASSWORD ?? '',
  };
  for (const [name, value] of [
    ['SEED_INTERN_PASSWORD', passwords.intern],
    ['SEED_VOLUNTEER_PASSWORD', passwords.volunteer],
  ] as const) {
    if (value.length < MIN_SEED_PASSWORD_LENGTH) {
      throw new Error(
        `Refusing to seed: ${name} must contain at least ${MIN_SEED_PASSWORD_LENGTH} characters.`
      );
    }
  }
  return passwords;
}

/** Returns `date` moved by `days` days, as `YYYY-MM-DD` in the local calendar. */
export function shiftDate(date: Date, days: number): string {
  const shifted = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${shifted.getFullYear()}-${month}-${day}`;
}

type Title = 'Miss' | 'Mr' | 'Mrs';
type Occupation = 'student' | 'unemployed' | 'employee' | 'entrepreneur';

// [title, first name, last name, occupation, place of study or work, district]
const FULL_MEMBERS: [Title, string, string, Occupation, string | null, string][] = [
  ['Mr', 'Hery', 'Rakotomalala', 'student', 'Lycée Les Jacarandas', 'Ambohipo'],
  ['Miss', 'Fanja', 'Randrianarisoa', 'student', 'Université d’Andohalo', 'Ankadifotsy'],
  ['Mrs', 'Voahangy', 'Rasoanaivo', 'employee', 'Clinique Fitiavana', 'Isotry'],
  ['Mr', 'Toky', 'Andriamanana', 'entrepreneur', 'Atelier Vatolahy', 'Analakely'],
  ['Miss', 'Mialy', 'Razafindrabe', 'unemployed', null, 'Ampefiloha'],
  ['Mr', 'Andry', 'Rabemananjara', 'student', 'Institut Ravinala', 'Ankatso'],
  ['Mrs', 'Lalao', 'Rakotondrabe', 'entrepreneur', 'Épicerie Tsara Be', 'Mahamasina'],
  ['Mr', 'Rivo', 'Ramanantsoa', 'employee', 'Société Lohasoa Services', 'Antanimena'],
  ['Miss', 'Tiana', 'Rasolofonirina', 'student', 'Collège Saint-Fictif', 'Behoririka'],
  ['Mr', 'Njaka', 'Andrianjafy', 'unemployed', null, 'Anosibe'],
  ['Mrs', 'Hanitra', 'Raharimalala', 'employee', 'Banque Vonjy', 'Tsaralalana'],
  ['Mr', 'Sitraka', 'Rakotoarisoa', 'student', 'Lycée Les Jacarandas', 'Ambohijatovo'],
  ['Miss', 'Kanto', 'Ravelojaona', 'student', 'Université d’Andohalo', 'Ankadivato'],
  ['Mr', 'Mamy', 'Randriamampionona', 'entrepreneur', 'Garage Mazava', '67 Ha'],
  ['Mrs', 'Nirina', 'Rabearivelo', 'unemployed', null, 'Ambanidia'],
  ['Mr', 'Tahina', 'Razanakoto', 'employee', 'Imprimerie Fanilo', 'Andravoahangy'],
  ['Miss', 'Onja', 'Rakotovao', 'student', 'Institut Ravinala', 'Ambatonakanga'],
  ['Mr', 'Fitia', 'Andrianasolo', 'student', 'Collège Saint-Fictif', 'Antsahavola'],
  ['Mrs', 'Haingo', 'Ratsimbazafy', 'entrepreneur', 'Couture Masoandro', 'Ampasampito'],
  ['Mr', 'Liva', 'Rajaonarison', 'employee', 'Coopérative Tantely', 'Ankorondrano'],
  ['Miss', 'Miora', 'Rafaramalala', 'unemployed', null, 'Andohatapenaka'],
  ['Mr', 'Santatra', 'Rabenandrasana', 'student', 'Lycée Les Jacarandas', 'Ivandry'],
  ['Mrs', 'Fenosoa', 'Ralaivao', 'employee', 'Pharmacie Aina', 'Ambohimiandra'],
  ['Mr', 'Tsiry', 'Randrianasolo', 'entrepreneur', 'Studio Hazavana', 'Antanimora'],
  ['Miss', 'Nomena', 'Rasamimanana', 'student', 'Université d’Andohalo', 'Mahazo'],
  ['Mr', 'Hasina', 'Rakotonirina', 'unemployed', null, 'Ambodivona'],
  ['Mrs', 'Domoina', 'Rafanomezantsoa', 'employee', 'École Kintana', 'Faravohitra'],
  ['Mr', 'Aina', 'Ramaroson', 'student', 'Institut Ravinala', 'Ankazomanga'],
  ['Miss', 'Valisoa', 'Ranaivoson', 'student', 'Collège Saint-Fictif', 'Antohomadinika'],
  ['Mr', 'Josia', 'Rakotozafy', 'employee', 'Transport Lalana', 'Andavamamba'],
  ['Mrs', 'Ravaka', 'Andriamihaja', 'entrepreneur', 'Boulangerie Vary Mena', 'Itaosy'],
  ['Mr', 'Zo', 'Rasoloarison', 'student', 'Lycée Les Jacarandas', 'Ambohimanarina'],
  ['Miss', 'Lova', 'Razafimahatratra', 'employee', 'Librairie Fahendrena', 'Anjanahary'],
  ['Mr', 'Ony', 'Ravelomanana', 'unemployed', null, 'Ankadindramamy'],
  ['Mrs', 'Bodo', 'Rakotobe', 'student', 'Université d’Andohalo', 'Ampandrana'],
];

// Members with only a first name: every other optional field stays null.
const FIRST_NAME_ONLY_MEMBERS = ['Faly', 'Soa', 'Tojo', 'Nantenaina', 'Mahery'];

const BIRTH_PLACES = ['Antananarivo', 'Antsirabe', 'Fianarantsoa', 'Toamasina', 'Mahajanga'];

function memberRows(now: Date): NewMember[] {
  const full = FULL_MEMBERS.map(([title, firstName, lastName, occupation, place, district], i) => {
    // Students are younger; the others are adults of different ages.
    const age = occupation === 'student' ? 15 + (i % 8) : 23 + (i % 20);
    return {
      firstName,
      lastName,
      title,
      gender: title === 'Mr' ? ('male' as const) : ('female' as const),
      birthDate: shiftDate(now, -(age * 365 + i * 11)),
      birthPlace: BIRTH_PLACES[i % BIRTH_PLACES.length],
      address: `Lot ${100 + i * 7} ${district}, Antananarivo`,
      occupation,
      phoneNumber: `034 00 000 ${String(i + 1).padStart(2, '0')}`,
      studyOrWorkPlace: place,
      // Spread over three years: the oldest member joined 1 054 days before the run date.
      joinDate: shiftDate(now, -i * 31),
      profileImage: null,
    };
  });
  const firstNameOnly = FIRST_NAME_ONLY_MEMBERS.map((firstName) => ({ firstName }));
  return [...full, ...firstNameOnly];
}

// [volunteer role, days from the run date to the expiration date]
const VOLUNTEERS: [string, number][] = [
  ['Accueil', 200],
  ['Bibliothèque', 150],
  ['Atelier robotique', 300],
  ['Atelier programmation', 90],
  ['Communication', 45],
  ['Accueil', 20],
  ['Bibliothèque', -15],
  ['Atelier robotique', -60],
];

function activityRows(now: Date, createdBy: number): NewActivity[] {
  return [
    {
      emoji: '🤖',
      name: 'Robotics workshop',
      description: 'Building and programming small robots.',
      isPeriodic: true,
      dayOfWeek: 'monday',
      startTime: '15:00:00',
      endTime: '17:00:00',
      startDate: null,
      endDate: null,
      createdBy,
    },
    {
      emoji: '💻',
      name: 'Coding club',
      description: 'Programming exercises for beginners and advanced learners.',
      isPeriodic: true,
      dayOfWeek: 'wednesday',
      startTime: '14:00:00',
      endTime: '17:00:00',
      startDate: null,
      endDate: null,
      createdBy,
    },
    {
      emoji: '📚',
      name: 'Reading and homework help',
      description: 'Free reading and help with homework.',
      isPeriodic: true,
      dayOfWeek: 'saturday',
      startTime: '09:00:00',
      endTime: '12:00:00',
      startDate: null,
      endDate: null,
      createdBy,
    },
    {
      emoji: '🔬',
      name: 'STEM open day',
      description: 'Presentation of the club and demonstrations.',
      isPeriodic: false,
      dayOfWeek: null,
      startTime: '09:00:00',
      endTime: '16:00:00',
      startDate: shiftDate(now, 10),
      endDate: shiftDate(now, 10),
      createdBy,
    },
    {
      emoji: '🏆',
      name: 'Youth hackathon',
      description: 'Three days of team projects.',
      isPeriodic: false,
      dayOfWeek: null,
      startTime: '08:00:00',
      endTime: '18:00:00',
      startDate: shiftDate(now, 24),
      endDate: shiftDate(now, 26),
      createdBy,
    },
    {
      emoji: '🌍',
      name: 'Climate conference',
      description: 'Talk and debate about the climate in Madagascar.',
      isPeriodic: false,
      dayOfWeek: null,
      startTime: '14:00:00',
      endTime: '17:00:00',
      startDate: shiftDate(now, -30),
      endDate: shiftDate(now, -29),
      createdBy,
    },
  ];
}

const BOOK_TITLES = [
  'The Little Prince',
  'Twenty Thousand Leagues Under the Seas',
  'Introduction to Electronics',
  'Great Expectations',
  'Learning Python Step by Step',
  'Tales of Madagascar',
  'Around the World in Eighty Days',
  'Mathematics for Everyone',
  'Frankenstein',
  'Introduction to Robotics',
  'Treasure Island',
  'Astronomy for Beginners',
  'The Count of Monte Cristo',
  'Fun with Chemistry',
  'Pride and Prejudice',
];

// [days from the run date to the borrowing date, to the expected return date,
//  to the effective return date (null while the book is out)]
const LOANS: [number, number, number | null][] = [
  // Open and on time.
  [-2, 12, null],
  [-5, 9, null],
  [-7, 7, null],
  [-1, 20, null],
  [-10, 4, null],
  [-3, 11, null],
  // Open and late.
  [-30, -16, null],
  [-25, -11, null],
  [-45, -31, null],
  [-20, -6, null],
  // Returned.
  [-60, -46, -50],
  [-90, -76, -70],
  [-40, -26, -27],
  [-120, -106, -110],
  [-15, -1, -3],
];

/** Counts the rows of the tables that the seed writes. */
export async function countRows(db: SeedDatabase): Promise<RowCounts> {
  const tables = {
    users,
    members,
    volunteers,
    activities,
    book_loans: bookLoans,
    checkins,
    audit_logs: auditLogs,
  };
  const result = {} as RowCounts;
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await db.select({ value: count() }).from(table);
    result[name as keyof RowCounts] = Number(row.value);
  }
  return result;
}

/**
 * Replaces the club data with the staging seed, in one transaction.
 * It keeps the admin accounts and needs at least one active admin.
 */
export async function seedStaging(db: SeedDatabase, options: SeedOptions): Promise<void> {
  const now = options.now ?? new Date();
  const rounds = options.bcryptRounds ?? 10;
  const [internHash, volunteerHash] = await Promise.all([
    bcrypt.hash(options.passwords.intern, rounds),
    bcrypt.hash(options.passwords.volunteer, rounds),
  ]);

  await db.transaction(async (tx) => {
    const [admin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.active, true)))
      .orderBy(asc(users.id))
      .limit(1);
    if (!admin) {
      throw new Error(
        'Refusing to seed: no active admin user. Create one with bootstrap-admin.mjs first.'
      );
    }

    // These are all the tables that reference `members`, `activities` or `users`
    // (`audit_logs` has no foreign key). No CASCADE: an unknown reference makes the
    // statement fail instead of emptying another table.
    await tx.execute(
      sql`TRUNCATE TABLE checkins, book_loans, volunteers, activities, members, audit_logs RESTART IDENTITY`
    );
    // Nothing references these users any more, so the delete cannot fail.
    await tx.delete(users).where(ne(users.role, 'admin'));

    const insertedMembers = await tx
      .insert(members)
      .values(memberRows(now))
      .returning({ registrationNumber: members.registrationNumber });

    await tx.insert(volunteers).values(
      VOLUNTEERS.map(([role, expiresIn], i) => ({
        registrationNumber: insertedMembers[i].registrationNumber,
        role,
        joinDate: shiftDate(now, expiresIn - 365),
        expirationDate: shiftDate(now, expiresIn),
        createdBy: admin.id,
      }))
    );

    await tx.insert(activities).values(activityRows(now, admin.id));

    const loans: NewBookLoan[] = LOANS.map(([borrowed, expected, returned], i) => ({
      // Borrowers are members 9 to 23, who are not volunteers.
      registrationNumber: insertedMembers[VOLUNTEERS.length + i].registrationNumber,
      bookTitle: BOOK_TITLES[i],
      borrowingDate: shiftDate(now, borrowed),
      expectedReturnDate: shiftDate(now, expected),
      effectiveReturnDate: returned === null ? null : shiftDate(now, returned),
      createdBy: admin.id,
    }));
    await tx.insert(bookLoans).values(loans);

    await tx.insert(users).values([
      {
        username: STAGING_INTERN_USERNAME,
        email: 'staging-intern@example.org',
        password: internHash,
        role: 'intern',
        active: true,
      },
      {
        username: STAGING_VOLUNTEER_USERNAME,
        email: 'staging-volunteer@example.org',
        password: volunteerHash,
        role: 'volunteer',
        active: true,
      },
    ]);
  });
}

export interface DatabaseHandle {
  db: SeedDatabase;
  close: () => Promise<void>;
}

/**
 * Checks the environment, then opens the database, seeds it and prints the row counts.
 * `openDatabase` is called only after the checks pass.
 */
export async function runStagingSeed(
  env: NodeJS.ProcessEnv,
  openDatabase: () => Promise<DatabaseHandle>,
  options: Omit<SeedOptions, 'passwords'> = {}
): Promise<RowCounts> {
  const passwords = checkSeedEnvironment(env);
  const { db, close } = await openDatabase();
  try {
    await seedStaging(db, { ...options, passwords });
    const counts = await countRows(db);
    console.log('Staging seed completed. Rows per table:');
    for (const [table, value] of Object.entries(counts)) console.log(`  ${table}: ${value}`);
    return counts;
  } finally {
    await close();
  }
}

async function openProductionDatabase(): Promise<DatabaseHandle> {
  const [{ drizzle }, { default: postgres }, { config }] = await Promise.all([
    import('drizzle-orm/postgres-js'),
    import('postgres'),
    import('@/config'),
  ]);
  const client = postgres(config.database.url, { max: 1 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

if (process.argv[1]?.replace(/\\/g, '/').match(/\/seedStaging\.(ts|js)$/)) {
  runStagingSeed(process.env, openProductionDatabase).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
