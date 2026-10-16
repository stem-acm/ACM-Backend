import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import xlsx from 'xlsx';
import { readBookLoans } from '../src/db/importBookLoans';

const headers = ['N°', 'IdMembre', 'TitreLivre', 'DatePret', 'DateFinRetour', 'DateRetour'];

test('reads Excel dates and nullable returns, and rejects invalid or duplicate records', () => {
  const directory = mkdtempSync(join(tmpdir(), 'acm-books-'));
  const file = join(directory, 'loans.xlsx');
  function write(rows: unknown[][], date1904 = false) {
    const workbook = xlsx.utils.book_new();
    workbook.Workbook = { WBProps: { date1904 } };
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([headers, ...rows]), 'Loans');
    xlsx.writeFile(workbook, file);
  }
  try {
    const row = [1, 4, ' Book title ', 44881, 44917, null];
    write([row]);
    assert.deepEqual(readBookLoans(file), [
      {
        id: 1,
        registrationNumber: 4,
        bookTitle: 'Book title',
        borrowingDate: '2022-11-16',
        expectedReturnDate: '2022-12-22',
        effectiveReturnDate: null,
      },
    ]);
    write([[1, 4, 'Book', 44881 - 1462, 44917 - 1462, 44888 - 1462]], true);
    assert.equal(readBookLoans(file)[0].borrowingDate, '2022-11-16');
    assert.equal(readBookLoans(file)[0].effectiveReturnDate, '2022-11-23');
    write([row, row]);
    assert.throws(() => readBookLoans(file), /Row 3: Duplicate loan ID/);
    write([[1, 4, 'Book', 44881, 44880, null]]);
    assert.throws(() => readBookLoans(file), /Expected return date cannot be before/);
    write([[1, '4oops', 'Book', 44881, 44917, null]]);
    assert.throws(() => readBookLoans(file), /positive PostgreSQL integer/);
    write([[1, 4, 'Book', 'invalid', 44917, null]]);
    assert.throws(() => readBookLoans(file), /Expected an Excel date serial/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
