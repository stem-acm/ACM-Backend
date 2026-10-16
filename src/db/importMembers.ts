import 'dotenv/config';
import { parseArgs } from 'node:util';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import xlsx from 'xlsx';
import { z } from 'zod';
import { members, type NewMember } from '@/db/schema';
import { createMemberSchema } from '@/schemas/memberSchema';

const HEADERS = [
  'IdMembre',
  'Photo',
  'Categorie',
  'Prenom',
  'Nom',
  'Adresse',
  'DateNaissance',
  'LieuNaissance',
  'Genre',
  'LieuTravail',
  'Telephone',
  'DateEntree',
];
const idSchema = z.number().int().positive().max(2147483647);
const databaseFieldsSchema = z.object({
  firstName: z.string().max(255),
  lastName: z.string().max(255).nullable(),
  birthDate: z.string().date().nullable(),
  joinDate: z.string().date().nullable(),
  birthPlace: z.string().max(255).nullable(),
  phoneNumber: z.string().max(255).nullable(),
  studyOrWorkPlace: z.string().max(255).nullable(),
  profileImage: z.string().max(500).nullable(),
});

export function readMembers(file: string) {
  const workbook = xlsx.readFile(file);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Workbook has no worksheets');
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  if (HEADERS.some((header, index) => rows[0]?.[index] !== header)) {
    throw new Error(`Expected headers: ${HEADERS.join(', ')}`);
  }
  function text(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error('Expected a text or numeric cell');
    }
    return String(value).trim() || null;
  }
  function date(value: unknown): string | null {
    if (value === null || value === '') return null;
    // Excel serials preserve the full year; decoding components avoids timezone shifts.
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
      throw new Error('Expected an Excel date serial');
    }
    const parsed = xlsx.SSF.parse_date_code(value, {
      date1904: Boolean(workbook.Workbook?.WBProps?.date1904),
    });
    if (!parsed) throw new Error('Invalid Excel date');
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const data: NewMember[] = [];
  const issues: { row: number; registrationNumber: number; message: string }[] = [];
  const ids = new Set<number>();
  for (const [index, row] of rows.entries()) {
    if (index === 0 || row.every((value) => value === null || value === '')) continue;
    // Invalid or duplicated identity aborts even when skipping invalid profiles is enabled.
    const registrationNumber = idSchema.parse(row[0]);
    if (ids.has(registrationNumber))
      throw new Error(`Row ${index + 1}: duplicate member ID ${registrationNumber}`);
    ids.add(registrationNumber);
    try {
      const member = createMemberSchema.parse({
        firstName: text(row[3]),
        lastName: text(row[4]),
        title: text(row[2]),
        gender: text(row[8])?.toLowerCase() ?? null,
        birthDate: date(row[6]),
        birthPlace: text(row[7]),
        address: text(row[5]),
        // The source has no occupation column; do not infer it from workplace.
        occupation: null,
        phoneNumber: text(row[10]),
        studyOrWorkPlace: text(row[9]),
        joinDate: date(row[11]),
        profileImage: text(row[1]),
      });
      databaseFieldsSchema.parse(member);
      data.push({ registrationNumber, ...member });
    } catch (error) {
      issues.push({
        row: index + 1,
        registrationNumber,
        message:
          error instanceof z.ZodError
            ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
            : error instanceof Error
              ? error.message
              : String(error),
      });
    }
  }
  if (!ids.size) throw new Error('Workbook contains no members');
  return { data, issues, total: ids.size };
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', default: '1MainData.xlsx' },
      host: { type: 'string' },
      port: { type: 'string' },
      apply: { type: 'boolean', default: false },
      'check-db': { type: 'boolean', default: false },
      'skip-invalid': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'pnpm import-members [--file path.xlsx] [--host HOST] [--port PORT] [--check-db | --apply] [--skip-invalid]'
    );
    console.log('Default: offline validation. Existing members are always preserved.');
    return;
  }
  if (values.apply && values['check-db']) throw new Error('Use either --apply or --check-db');
  const { data, issues, total } = readMembers(values.file);
  console.log(
    `Workbook: ${total} rows; ${data.length} valid members; ${issues.length} invalid profiles.`
  );
  for (const issue of issues) {
    console.warn(`Row ${issue.row}, member ${issue.registrationNumber}: ${issue.message}`);
  }
  if (!values.apply && !values['check-db']) {
    console.log(
      'Preview only. Use --check-db to compare with the database or --apply to insert missing members.'
    );
    return;
  }
  if (values.apply && issues.length && !values['skip-invalid']) {
    throw new Error(
      'Fix invalid profiles or explicitly use --skip-invalid. No database changes made.'
    );
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const url = new URL(process.env.DATABASE_URL);
  if (values.host !== undefined) url.hostname = values.host;
  if (values.port !== undefined) {
    const port = idSchema.max(65535).parse(Number(values.port));
    url.port = String(port);
  }
  const client = postgres(url.toString(), { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const db = drizzle(client);
    const inserted = await db.transaction(async (tx) => {
      if (values.apply) await tx.execute(sql`LOCK TABLE members IN SHARE ROW EXCLUSIVE MODE`);
      const existing = new Map(
        (await tx.select().from(members)).map((member) => [member.registrationNumber, member])
      );
      const pending = data.filter((member) => !existing.has(member.registrationNumber as number));
      const differing = data.filter((member) => {
        const previous = existing.get(member.registrationNumber as number);
        return (
          previous &&
          (Object.keys(member) as (keyof NewMember)[]).some((key) => member[key] !== previous[key])
        );
      });
      console.log(
        `Database: ${existing.size} members; ${pending.length} valid rows to insert; ${data.length - pending.length} existing valid IDs preserved (${differing.length} differ from workbook).`
      );
      console.log(
        `Invalid profiles: ${issues.filter((issue) => existing.has(issue.registrationNumber)).length} existing IDs preserved; ${issues.filter((issue) => !existing.has(issue.registrationNumber)).length} absent IDs.`
      );
      if (!values.apply) return 0;
      for (let offset = 0; offset < pending.length; offset += 500) {
        await tx.insert(members).values(pending.slice(offset, offset + 500));
      }
      // Include all database records and never decrease an already advanced sequence.
      await tx.execute(sql`SELECT setval(
        pg_get_serial_sequence('members', 'registration_number'),
        GREATEST(COALESCE((SELECT MAX(registration_number) FROM members), 1),
          (SELECT last_value FROM members_registration_number_seq)), true
      )`);
      return pending.length;
    });
    if (values.apply)
      console.log(`Committed ${inserted} new members; repaired member ID sequence.`);
    else console.log('Database comparison only; no changes made.');
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.replace(/\\/g, '/').match(/\/importMembers\.(ts|js)$/)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
