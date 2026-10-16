import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mock, test } from 'node:test';
import {
  bookLoanQuerySchema,
  bookTitleQuerySchema,
  createBookLoanSchema,
} from '../src/schemas/bookLoanSchema';

// Keep service tests independent of local credentials and database configuration.
const originalDirectory = process.cwd();
process.chdir(tmpdir());
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret';
process.env.QR_SECRET = 'test-secret';
delete process.env.MAX_REQUEST_LIMIT;
const { db } = await import('../src/db/drizzle');
const { getBookLoanById, getBookLoans, getBookTitles } = await import(
  '../src/services/bookLoanService'
);
process.chdir(originalDirectory);

test('loan reads select public creator fields and preserve creatorless loans', async () => {
  const loan = { id: 1, createdBy: 2 };
  const user = { id: 2, username: 'librarian', permissions: {} };
  const rows = [
    { book_loans: loan, members: null, User: user },
    { book_loans: { id: 2, createdBy: null }, members: null, User: null },
  ];
  const select = mock.method(db, 'select', (selection: Record<string, unknown>) => {
    const isCount = 'count' in selection;
    if (!isCount) {
      assert.deepEqual(Object.keys(selection.User as object).sort(), [
        'active',
        'createdAt',
        'email',
        'id',
        'permissions',
        'role',
        'updatedAt',
        'username',
      ]);
    }
    const result = isCount ? [{ count: 2 }] : rows;
    const chain = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
      // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable.
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  });
  try {
    const result = await getBookLoans(bookLoanQuerySchema.parse({}));
    assert.equal(result.data[0].User, user);
    assert.equal(result.data[1].User, null);
    assert.equal(result.pagination.total, 2);
    assert.equal((await getBookLoanById(1))?.User, user);
  } finally {
    select.mock.restore();
  }
});

test('creation accepts frontend fields without relations and ignores client-supplied creators', () => {
  const input = {
    registrationNumber: 101,
    bookTitle: 'Book',
    borrowingDate: '2026-10-16',
    expectedReturnDate: '2026-10-23',
    effectiveReturnDate: null,
  };
  assert.deepEqual(createBookLoanSchema.parse(input), input);
  assert.deepEqual(
    createBookLoanSchema.parse({ ...input, createdBy: 999, User: { id: 999 } }),
    input
  );
});

test('title suggestions use distinct sorted titles and escape literal search characters', async () => {
  const originalSelect = db.selectDistinct.bind(db);
  const select = mock.method(db, 'selectDistinct', (selection) => {
    const from = originalSelect(selection);
    return {
      from: (table) => {
        const query = from.from(table);
        return {
          where: (condition) => {
            const filtered = query.where(condition);
            return {
              orderBy: (order) => {
                const sorted = filtered.orderBy(order);
                return {
                  limit: (limit) => {
                    const generated = sorted.limit(limit).toSQL();
                    assert.match(generated.sql, /select distinct trim/);
                    assert.match(generated.sql, /ilike/);
                    assert.match(generated.sql, /order by trim.*asc/);
                    assert.deepEqual(generated.params, ['%50\\%\\_off%', 10]);
                    return Promise.resolve([{ title: '50%_off' }]);
                  },
                };
              },
            };
          },
        };
      },
    };
  });
  try {
    assert.deepEqual(await getBookTitles('', 10), []);
    assert.equal(select.mock.callCount(), 0);
    assert.deepEqual(await getBookTitles('50%_off', 10), ['50%_off']);
  } finally {
    select.mock.restore();
  }
  assert.deepEqual(bookTitleQuerySchema.parse({ search: ' Book ' }), { search: 'Book', limit: 10 });
  assert.equal(bookTitleQuerySchema.safeParse({ limit: 21 }).success, false);
});
