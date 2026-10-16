# Import historical book loans

The books API (`/api/book-loans`) manages loans, rather than a book catalog.
`2BookData.xlsx`, worksheet `_2BookData`, contains 3,482 loans with unique IDs
(1 through 3,555, with gaps); 66 have no effective return date.
All rows pass the existing API validation rules.

| Workbook column | Database column                            |
| --------------- | ------------------------------------------ |
| N°              | book_loans.id                              |
| IdMembre        | registration_number                        |
| TitreLivre      | book_title (trimmed)                       |
| DatePret        | borrowing_date                             |
| DateFinRetour   | expected_return_date                       |
| DateRetour      | effective_return_date (blank becomes NULL) |

Excel serial dates are decoded using the workbook's date system, without timezone
conversion. Historical creation timestamps are unavailable; database defaults
set them to the import time. `created_by` defaults to NULL. Optionally supply an existing user ID with `--created-by`.

Run from the repository root. No new dependencies or schema changes are needed.
Apply the existing database migrations first, including migration 0004 that creates
`book_loans` and migration 0005 that allows a NULL creator, and import members with their original registration numbers.

Validate the spreadsheet without connecting to a database:

```sh
pnpm import-books
```

Set `DATABASE_URL` in the environment or `.env`, then import:

```sh
pnpm import-books --host localhost --port 5434 --apply

```

To attribute the loans to an existing user, add `--created-by 1` (replace 1 with
the desired user ID). Omit the option to store NULL.

Use `--file /absolute/path/to/file.xlsx` to read a different file. The first worksheet
must use the same six headers. The spreadsheet is ignored by Git and must be
available on the machine running the script.

The script validates the entire workbook before opening a connection. All inserts
run in one transaction. Missing members, an explicitly supplied creator that does not exist, or a conflicting loan
ID abort the import. Existing IDs with identical member, title and date fields are
skipped; existing records are never overwritten, even if their creator differs.
This makes rerunning an unchanged workbook safe. A later API edit to an imported
loan can cause a conflict on rerun; resolve the data explicitly before retrying.

The importer locks `book_loans` against concurrent writes during the transaction
and advances its sequence to at least the highest database ID without decreasing
its current value. PostgreSQL sequence changes are not transactional; a failed
commit can leave harmless gaps. Read-only API requests can continue during import.
The offline preview does not check database members, users, or ID conflicts.

Run the parser regression check with:

```sh
pnpm exec tsx --test tests/importBookLoans.test.ts
```

## Running on the host with Docker PostgreSQL

The Compose hostname `postgres` resolves inside Docker. From your host machine,
use the published endpoint `localhost:5434`, keeping credentials and database
name from `DATABASE_URL`:

```sh
pnpm import-books --host localhost --port 5434 --apply
```

These options override the connection for this invocation without editing `.env`
or changing the backend container configuration. PostgreSQL must be running
(`docker compose up -d postgres`).
