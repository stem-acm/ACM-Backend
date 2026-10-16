import { and, asc, desc, eq, ilike, lt, or, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { bookLoans, members } from '@/db/schema';
import type {
  BookLoanQueryInput,
  CreateBookLoanInput,
  UpdateBookLoanInput,
} from '@/schemas/bookLoanSchema';

function withMember(row: {
  book_loans: typeof bookLoans.$inferSelect;
  members: typeof members.$inferSelect | null;
}) {
  return { ...row.book_loans, Member: row.members };
}

async function ensureMemberExists(registrationNumber: number) {
  const [member] = await db
    .select({ registrationNumber: members.registrationNumber })
    .from(members)
    .where(eq(members.registrationNumber, registrationNumber))
    .limit(1);
  if (!member) throw new Error('Member not found');
}

export async function createBookLoan(input: CreateBookLoanInput, createdBy: number) {
  await ensureMemberExists(input.registrationNumber);
  const [created] = await db
    .insert(bookLoans)
    .values({ ...input, createdBy })
    .returning();
  return getBookLoanById(created.id);
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
        ilike(sql<string>`cast(${bookLoans.registrationNumber} as text)`, `%${search}%`)
      )
    );
  }
  if (status === 'returned') conditions.push(sql`${bookLoans.effectiveReturnDate} is not null`);
  if (status === 'borrowed') {
    conditions.push(
      and(
        sql`${bookLoans.effectiveReturnDate} is null`,
        sql`${bookLoans.expectedReturnDate} >= current_date`
      )
    );
  }
  if (status === 'overdue') {
    conditions.push(
      and(
        sql`${bookLoans.effectiveReturnDate} is null`,
        lt(bookLoans.expectedReturnDate, sql`current_date`)
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  let countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(bookLoans)
    .leftJoin(members, eq(bookLoans.registrationNumber, members.registrationNumber));
  if (where) countQuery = countQuery.where(where) as typeof countQuery;
  const [{ count }] = await countQuery;

  let dataQuery = db
    .select()
    .from(bookLoans)
    .leftJoin(members, eq(bookLoans.registrationNumber, members.registrationNumber));
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
    data: rows.map(withMember),
    pagination: { offset, limit, total, hasMore: offset + limit < total },
  };
}

export async function getBookLoanById(id: number) {
  const [row] = await db
    .select()
    .from(bookLoans)
    .leftJoin(members, eq(bookLoans.registrationNumber, members.registrationNumber))
    .where(eq(bookLoans.id, id))
    .limit(1);
  return row ? withMember(row) : null;
}

export async function updateBookLoan(id: number, input: UpdateBookLoanInput) {
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

  await db
    .update(bookLoans)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(bookLoans.id, id));
  return getBookLoanById(id);
}

export async function returnBookLoan(id: number, effectiveReturnDate: string) {
  return updateBookLoan(id, { effectiveReturnDate });
}
