# Import members

`pnpm import-members` reads `1MainData.xlsx` from the current working directory.
It uses the first worksheet, validates the twelve original column headers, and
preserves `IdMembre` as `members.registration_number` so check-ins, volunteers and
book loans keep their existing links. Use `--file /path/to/file.xlsx` to override.

| Spreadsheet | Member field |
| --- | --- |
| IdMembre | registrationNumber |
| Photo | profileImage |
| Categorie | title |
| Prenom | firstName (required) |
| Nom | lastName |
| Adresse | address |
| DateNaissance | birthDate |
| LieuNaissance | birthPlace |
| Genre | gender (lowercase) |
| LieuTravail | studyOrWorkPlace |
| Telephone | phoneNumber |
| DateEntree | joinDate |

Occupation is NULL for new records because the workbook contains no occupation
column. Missing optional values become NULL. Strings are trimmed; telephone text
retains leading zeroes. Photo references are stored as supplied, without copying
image files. Creation/update timestamps use database defaults for inserted rows.

The importer validates against the current member API schema plus database string
lengths and real calendar dates. Excel serial dates preserve their full year and
use the workbook's 1900/1904 date system without timezone conversion. Unsupported
dates and enum values are reported rather than silently changed to NULL. Invalid
or duplicate IDs always abort: the importer never generates replacement IDs.

## Commands

Offline preview (default; does not connect to PostgreSQL):

```sh
pnpm import-members
```

Read-only comparison with the current Docker database from the host machine:

```sh
pnpm import-members --check-db --host localhost --port 5434
```

Insert missing valid members, preserving every existing member:

```sh
pnpm import-members --apply --host localhost --port 5434
```

If validation reports invalid profiles, correct them in the workbook first, or
explicitly exclude them with:

```sh
pnpm import-members --apply --skip-invalid --host localhost --port 5434
```

Connection credentials/database come from `DATABASE_URL` in the environment or
`.env`. Host/port overrides affect only this invocation. Inside Docker, use the
configured `postgres:5432` endpoint instead. The workbook must be available to the
process (it is ignored by Git and is not mounted into the backend container).

## Existing records and sequence

Existing registration numbers are always skipped, including profiles that differ
from the workbook. The summary counts differing profiles without exposing their
personal details. This is an insert-only import, not a synchronization command.
No existing values, timestamps or related records are overwritten or deleted.

Applying uses one transaction and locks `members` against concurrent writes while
checking IDs and inserting batches. It repairs the registration number sequence
to at least the highest database ID, without decreasing its existing value, even
when no new rows need inserting. PostgreSQL sequence changes are not rolled back;
a failed commit may leave harmless gaps. The success message is printed after
commit. `--check-db` performs neither inserts nor sequence repair.

## Observed source and database state

At analysis time, the workbook contained 4,776 unique member IDs, of which 4,704
passed validation. All 72 invalid profiles lacked a first name. The database held
4,753 members: all 4,704 valid spreadsheet IDs plus 49 IDs whose spreadsheet profile
lacks a first name. The remaining 23 invalid IDs were absent from the database.
Among valid profiles, 1,676 differed from stored values and are preserved.

The database sequence was at 1 while the maximum stored ID was 4,776. Applying
with `--skip-invalid` against this state inserts no members and repairs that
sequence. The analysis and read-only comparison did not change the database.

Tests:

```sh
pnpm exec tsx --test tests/importMembers.test.ts
pnpm exec tsc --noEmit
```
