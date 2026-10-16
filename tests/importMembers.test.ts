import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import xlsx from 'xlsx';
import { readMembers } from '../src/db/importMembers';

test('validates member fields, preserves identity and decodes Excel dates', () => {
  const directory = mkdtempSync(join(tmpdir(), 'acm-members-'));
  const file = join(directory, 'members.xlsx');
  const headers = [
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
  const row = [
    20,
    'photo.jpg',
    'Miss',
    ' Alice ',
    ' Smith ',
    null,
    18216,
    null,
    'Female',
    ' School ',
    '0340012345',
    44881,
  ];
  function write(rows: unknown[][], date1904 = false) {
    const workbook = xlsx.utils.book_new();
    workbook.Workbook = { WBProps: { date1904 } };
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([headers, ...rows]), 'Members');
    xlsx.writeFile(workbook, file);
  }
  try {
    write([row]);
    const result = readMembers(file);
    assert.equal(result.issues.length, 0);
    assert.deepEqual(result.data[0], {
      registrationNumber: 20,
      firstName: 'Alice',
      lastName: 'Smith',
      title: 'Miss',
      gender: 'female',
      birthDate: '1949-11-14',
      birthPlace: null,
      address: null,
      occupation: null,
      phoneNumber: '0340012345',
      studyOrWorkPlace: 'School',
      joinDate: '2022-11-16',
      profileImage: 'photo.jpg',
    });
    const bad = [...row];
    bad[3] = null;
    write([bad]);
    assert.equal(readMembers(file).data.length, 0);
    assert.match(readMembers(file).issues[0].message, /firstName/);
    write([row, row]);
    assert.throws(() => readMembers(file), /duplicate member ID/);
    const invalidId = [...row];
    invalidId[0] = '20oops';
    write([invalidId]);
    assert.throws(() => readMembers(file));
    const invalidDate = [...row];
    invalidDate[6] = 60;
    write([invalidDate]);
    assert.equal(readMembers(file).issues.length, 1);
    const longName = [...row];
    longName[3] = 'a'.repeat(256);
    write([longName]);
    assert.equal(readMembers(file).issues.length, 1);
    const shifted = [...row];
    shifted[6] = 18216 - 1462;
    shifted[11] = 44881 - 1462;
    write([shifted], true);
    assert.equal(readMembers(file).data[0].birthDate, '1949-11-14');
    assert.equal(readMembers(file).data[0].joinDate, '2022-11-16');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
