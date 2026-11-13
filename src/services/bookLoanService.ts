import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { bookLoans, members, rolePolicies, users } from '@/db/schema';
import type {
  BookLoanQueryInput,
  CreateBookLoanInput,
  UpdateBookLoanInput,
} from '@/schemas/bookLoanSchema';
import {
  type Actor,
  diffRows,
  memberLabel,
  snapshot,
  type Transaction,
  writeLog,
} from '@/services/auditService';

const loanSelection = {
  book_loans: bookLoans,
  members,
  User: {
    id: users.id,
    username: users.username,
    email: users.email,
    role: users.role,
    active: users.active,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
    permissions: sql<Record<string, boolean>>`coalesce(${rolePolicies.permissions}, '{}'::jsonb)`,
  },
};

function withRelations(row: {
  book_loans: typeof bookLoans.$inferSelect;
  members: typeof members.$inferSelect | null;
  User:
    | (Omit<typeof users.$inferSelect, 'password'> & {
        permissions: Record<string, boolean>;
      })
    | null;
}) {
  return { ...row.book_loans, Member: row.members, User: row.User?.id ? row.User : null };
}

async function ensureMemberExists(registrationNumber: number) {
  const [member] = await db
    .select({ registrationNumber: members.registrationNumber })
    .from(members)
    .where(eq(members.registrationNumber, registrationNumber))
    .limit(1);
  if (!member) throw new Error('Member not found');
}

/** "Book title, LASTNAME Firstname". */
async function bookLoanLabel(tx: Transaction, loan: typeof bookLoans.$inferSelect) {
  const [member] = await tx
    .select({ firstName: members.firstName, lastName: members.lastName })
    .from(members)
    .where(eq(members.registrationNumber, loan.registrationNumber))
    .limit(1);
  return member ? `${loan.bookTitle}, ${memberLabel(member)}` : loan.bookTitle;
}

export async function createBookLoan(input: CreateBookLoanInput, actor: Actor) {
  await ensureMemberExists(input.registrationNumber);
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(bookLoans)
      .values({ ...input, createdBy: actor.id })
      .returning();
    await writeLog(tx, actor, {
      type: 'book_loan.created',
      entity: 'book_loans',
      entityId: row.id,
      entityLabel: await bookLoanLabel(tx, row),
      changes: snapshot(row),
    });
    return row;
  });
  return getBookLoanById(created.id);
}

export function bookLoanStatusCondition(status: BookLoanQueryInput['status']) {
  if (status === 'returned') return isNotNull(bookLoans.effectiveReturnDate);
  if (status === 'active') {
    return and(
      isNull(bookLoans.effectiveReturnDate),
      gte(bookLoans.expectedReturnDate, sql`current_date`)
    );
  }
  if (status === 'overdue') {
    return and(
      isNull(bookLoans.effectiveReturnDate),
      lt(bookLoans.expectedReturnDate, sql`current_date`)
    );
  }
  return undefined;
}

export async function getBookLoans(query: BookLoanQueryInput) {
  const { offset, limit, search, status, sortBy, order } = query;
  const conditions = [];

  if (search) {
    conditions.push(
      or(
        ilike(bookLoans.bookTitle, `%${search}%`),
        ilike(members.firstName, `%${search}%`),
        ilike(members.lastName, `%${search}%`),
        ilike(sql<string>`cast(${bookLoans.registrationNumber} as text)`, `%${search}%`),
        ilike(sql<string>`cast(${bookLoans.borrowingDate} as text)`, `%${search}%`),
        ilike(sql<string>`cast(${bookLoans.expectedReturnDate} as text)`, `%${search}%`),
        ilike(sql<string>`cast(${bookLoans.effectiveReturnDate} as text)`, `%${search}%`)
      )
    );
  }
  const statusCondition = bookLoanStatusCondition(status);
  if (statusCondition) conditions.push(statusCondition);

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  let countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(bookLoans)
    .leftJoin(members, eq(bookLoans.registrationNumber, members.registrationNumber));
  if (where) countQuery = countQuery.where(where) as typeof countQuery;
  const [{ count }] = await countQuery;

  let dataQuery = db
    .select(loanSelection)
    .from(bookLoans)
    .leftJoin(members, eq(bookLoans.registrationNumber, members.registrationNumber))
    .leftJoin(users, eq(bookLoans.createdBy, users.id))
    .leftJoin(rolePolicies, eq(users.role, rolePolicies.role));
  if (where) dataQuery = dataQuery.where(where) as typeof dataQuery;

  const orderBy = order === 'desc' ? desc : asc;
  const sortColumn = {
    id: bookLoans.id,
    bookTitle: bookLoans.bookTitle,
    borrowingDate: bookLoans.borrowingDate,
    expectedReturnDate: bookLoans.expectedReturnDate,
    createdAt: bookLoans.createdAt,
  }[sortBy];
  const rows = await dataQuery.orderBy(orderBy(sortColumn)).limit(limit).offset(offset);
  const total = Number(count ?? 0);

  return {
    data: rows.map(withRelations),
    pagination: { offset, limit, total, hasMore: offset + limit < total },
  };
}

export async function getBookLoanById(id: number) {
  const [row] = await db
    .select(loanSelection)
    .from(bookLoans)
    .leftJoin(members, eq(bookLoans.registrationNumber, members.registrationNumber))
    .leftJoin(users, eq(bookLoans.createdBy, users.id))
    .leftJoin(rolePolicies, eq(users.role, rolePolicies.role))
    .where(eq(bookLoans.id, id))
    .limit(1);
  return row ? withRelations(row) : null;
}

/** Applies an update and writes exactly one log, of the given type, if a field changes. */
async function changeBookLoan(
  id: number,
  input: UpdateBookLoanInput,
  actor: Actor,
  type: 'book_loan.updated' | 'book_loan.returned'
) {
  const existing = await getBookLoanById(id);
  if (!existing) throw new Error('Book loan not found');
  if (input.registrationNumber !== undefined) await ensureMemberExists(input.registrationNumber);

  const borrowingDate = input.borrowingDate ?? existing.borrowingDate;
  const expectedReturnDate = input.expectedReturnDate ?? existing.expectedReturnDate;
  const effectiveReturnDate =
    input.effectiveReturnDate === undefined
      ? existing.effectiveReturnDate
      : input.effectiveReturnDate;
  if (expectedReturnDate < borrowingDate) {
    throw new Error('Expected return date cannot be before borrowing date');
  }
  if (effectiveReturnDate && effectiveReturnDate < borrowingDate) {
    throw new Error('Effective return date cannot be before borrowing date');
  }

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(bookLoans).where(eq(bookLoans.id, id)).limit(1);
    if (!before) throw new Error('Book loan not found');
    const [after] = await tx
      .update(bookLoans)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(bookLoans.id, id))
      .returning();
    const changes = diffRows(before, after);
    if (Object.keys(changes).length > 0) {
      await writeLog(tx, actor, {
        type,
        entity: 'book_loans',
        entityId: after.id,
        entityLabel: await bookLoanLabel(tx, after),
        changes,
      });
    }
  });
  return getBookLoanById(id);
}

export async function updateBookLoan(id: number, input: UpdateBookLoanInput, actor: Actor) {
  return changeBookLoan(id, input, actor, 'book_loan.updated');
}

export async function returnBookLoan(id: number, effectiveReturnDate: string, actor: Actor) {
  return changeBookLoan(id, { effectiveReturnDate }, actor, 'book_loan.returned');
}

export async function getBookTitles(search: string, limit: number) {
  if (!search) return [];
  const title = sql<string>`trim(${bookLoans.bookTitle})`;
  const escaped = search.replace(/[\\%_]/g, '\\$&');
  const rows = await db
    .selectDistinct({ title })
    .from(bookLoans)
    .where(ilike(title, `%${escaped}%`))
    .orderBy(asc(title))
    .limit(limit);
  return rows.map((row) => row.title);
}
