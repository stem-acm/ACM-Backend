import 'dotenv/config';
import { parseArgs } from 'node:util';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import xlsx from 'xlsx';
import { bookLoans, members, type NewBookLoan, users } from '@/db/schema';
import { createBookLoanSchema } from '@/schemas/bookLoanSchema';

const HEADERS = ['N°', 'IdMembre', 'TitreLivre', 'DatePret', 'DateFinRetour', 'DateRetour'];

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2147483647) {
    throw new Error(`Expected a positive PostgreSQL integer, received ${String(value)}`);
  }
  return parsed;
}

export function readBookLoans(file: string): Omit<NewBookLoan, 'createdBy'>[] {
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
  const ids = new Set<number>();
  const errors: string[] = [];
  const result: Omit<NewBookLoan, 'createdBy'>[] = [];
  function date(value: unknown): string {
    // Decode calendar components directly to avoid timezone shifts in historical dates.
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
      throw new Error(`Expected an Excel date serial, received ${String(value)}`);
    }
    const parsed = xlsx.SSF.parse_date_code(value, {
      date1904: Boolean(workbook.Workbook?.WBProps?.date1904),
    });
    if (!parsed) throw new Error(`Invalid Excel date: ${value}`);
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  for (const [index, row] of rows.entries()) {
    if (index === 0 || row.every((cell) => cell === null || cell === '')) continue;
    try {
      const id = positiveInteger(row[0]);
      if (ids.has(id)) throw new Error(`Duplicate loan ID ${id}`);
      ids.add(id);
      const data = createBookLoanSchema.parse({
        registrationNumber: positiveInteger(row[1]),
        bookTitle: row[2],
        borrowingDate: date(row[3]),
        expectedReturnDate: date(row[4]),
        effectiveReturnDate: row[5] === null || row[5] === '' ? null : date(row[5]),
      });
      result.push({ id, ...data });
    } catch (error) {
      errors.push(`Row ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  if (!result.length) throw new Error('Workbook contains no loans');
  return result;
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', default: '2BookData.xlsx' },
      'created-by': { type: 'string' },
      apply: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(
      'pnpm import-books [--file path.xlsx] [--created-by USER_ID] [--apply]'
    );
    console.log('Without --apply: validate workbook only; no database connection.');
    return;
  }
  const loans = readBookLoans(values.file);
  console.log(
    `Validated ${loans.length} loans; ${loans.filter((loan) => !loan.effectiveReturnDate).length} unreturned.`
  );
  if (!values.apply) {
    console.log('Preview only. Use --apply to import; --created-by USER_ID is optional.');
    return;
  }
  const createdBy =
    values['created-by'] === undefined ? null : positiveInteger(values['created-by']);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  try {
    const db = drizzle(client);
    await db.transaction(async (tx) => {
      // Serialize imports and prevent inserts racing with ID checks / sequence repair.
      await tx.execute(sql`LOCK TABLE book_loans IN SHARE ROW EXCLUSIVE MODE`);
      if (createdBy !== null) {
        const existingUsers = await tx.select({ id: users.id }).from(users);
        if (!existingUsers.some((user) => user.id === createdBy)) {
          throw new Error(`User ${createdBy} does not exist`);
        }
      }
      const memberIds = new Set(
        (await tx.select({ id: members.registrationNumber }).from(members)).map((row) => row.id)
      );
      const missing = [...new Set(loans.map((loan) => loan.registrationNumber))].filter(
        (id) => !memberIds.has(id)
      );
      if (missing.length)
        throw new Error(`Import members first. Missing member IDs: ${missing.join(', ')}`);
      const existing = new Map((await tx.select().from(bookLoans)).map((loan) => [loan.id, loan]));
      const pending: NewBookLoan[] = [];
      for (const loan of loans) {
        const previous = existing.get(loan.id as number);
        if (previous) {
          const fields = [
            'registrationNumber',
            'bookTitle',
            'borrowingDate',
            'expectedReturnDate',
            'effectiveReturnDate',
          ] as const;
          if (fields.some((field) => previous[field] !== loan[field])) {
            throw new Error(`Loan ID ${loan.id} conflicts with existing data; no loans imported`);
          }
        } else {
          pending.push({ ...loan, createdBy });
        }
      }
      for (let offset = 0; offset < pending.length; offset += 500) {
        await tx.insert(bookLoans).values(pending.slice(offset, offset + 500));
      }
      // Never move the sequence behind existing records or its current value.
      await tx.execute(sql`SELECT setval(
        pg_get_serial_sequence('book_loans', 'id'),
        GREATEST((SELECT MAX(id) FROM book_loans),
          (SELECT last_value FROM book_loans_id_seq)), true
      )`);
      console.log(
        `Imported ${pending.length} loans; skipped ${loans.length - pending.length} identical records.`
      );
    });
  } finally {
    await client.end();
  }
}

// Keep the reader importable for validation tests without executing the CLI.
if (process.argv[1]?.replace(/\\/g, '/').match(/\/importBookLoans\.(ts|js)$/)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
