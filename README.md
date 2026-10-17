# ACM Backend — VPS deployment

Express/TypeScript API backed by PostgreSQL and Drizzle ORM. It manages members, activities, attendance, volunteers, book loans, users, and role permissions. JWT authentication protects the application; server-sent events (SSE) deliver live attendance/activity updates. Uploaded files live on disk.

This guide deploys the **current source** on Ubuntu Server 24.04 LTS using PostgreSQL, systemd, and Nginx. Follow it first, then [deploy the frontend](../ACM-Frontend/README.md). Commands are instructions for your VPS; editing this README does not deploy anything.

## 1. Deployment layout and prerequisites

Use these example values consistently, replacing domains and repository URLs with your own:

| Item | Example |
| --- | --- |
| Frontend public URL | `https://acm.example.com` |
| API public URL | `https://api.acm.example.com` |
| Deployment user | `deploy` |
| Backend checkout | `/srv/acm/ACM-Backend` |
| API internal port | `3000` |
| Database | `acm_db`, owned by `acm_user`, local port `5432` |

Traffic flows from browser → HTTPS Nginx → Express → local PostgreSQL. Only SSH, HTTP, and HTTPS need public access. Start with approximately 2 CPU cores, 4 GB RAM, and sufficient SSD space for uploads and backups; actual requirements depend on usage. Building the frontend can temporarily require additional RAM.

You need SSH access with sudo, a Git checkout/deploy key for each repository, and DNS A records for both domains pointing to your VPS. Add AAAA records only if IPv6 also reaches this server. These directories are separate Git repositories in the workspace; use each repository's actual clone URL. Never put access tokens in clone URLs or documentation.

## 2. Prepare Ubuntu

Log in as your existing sudo-capable account. If you do not already have a deployment account:

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
```

Install your SSH public key for `deploy` using your provider's tooling or `ssh-copy-id deploy@VPS_IP`. Open a second SSH session as `deploy` and confirm sudo works before changing firewall rules. Run the remaining application commands as `deploy`, using sudo only where shown.

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates xz-utils build-essential python3 nginx postgresql postgresql-contrib ufw openssl snapd
sudo systemctl enable --now nginx postgresql
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

If SSH uses a custom port, allow that port before enabling UFW. Apply equivalent rules in your VPS provider firewall. Do not allow ports 3000, 5432, 5434, or 4983 publicly.

## 3. Install Node.js and pnpm

Use the latest patched **Node.js 22.x** release for this deployment. Angular 18.2 also accepts Node 22, so the same runtime can build the frontend. Install it system-wide rather than through an interactive-shell-only version manager: systemd needs a stable executable path.

One method is the official signed Node distribution. From [Node's download archive](https://nodejs.org/dist/latest-v22.x/), select the Linux archive matching your CPU (`linux-x64` for x86_64 or `linux-arm64` for ARM). Download its `SHASUMS256.txt` and archive, verify the archive against the published checksum, and extract it into `/opt/node22`:

```bash
# Run in the directory containing your downloaded node-v22.*-linux-*.tar.xz.
# Replace the filename with the exact archive you downloaded.
sha256sum --ignore-missing --check SHASUMS256.txt
sudo mkdir -p /opt/node22
sudo tar -xJf node-v22.REPLACE-linux-x64.tar.xz -C /opt/node22 --strip-components=1
sudo ln -sf /opt/node22/bin/node /usr/local/bin/node
sudo ln -sf /opt/node22/bin/npm /usr/local/bin/npm
sudo ln -sf /opt/node22/bin/npx /usr/local/bin/npx
sudo /usr/local/bin/npm install --global --prefix /usr/local pnpm@10.20.0
node --version
npm --version
pnpm --version
```

Stop if checksum verification fails. The backend pins pnpm 10.20.0 in `package.json`; use that version and retain the lockfile. This example assumes `/usr/local/bin/node` is your Node executable.

## 4. Clone and install the backend

```bash
sudo mkdir -p /srv/acm
sudo chown deploy:deploy /srv/acm
cd /srv/acm
git clone <BACKEND_REPOSITORY_URL> ACM-Backend
cd /srv/acm/ACM-Backend
HUSKY=0 pnpm install --frozen-lockfile
mkdir -p uploads logs
```

Keep development dependencies installed: the deployment below runs the existing `tsx` entry point and uses `drizzle-kit` for migrations. `HUSKY=0` skips local Git hook installation on the server. If pnpm reports an ignored bcrypt build and importing bcrypt subsequently fails, run `pnpm rebuild bcrypt`; inspect any build-approval prompt and approve only the dependency you intend to build.

**Why not `pnpm start`?** The current `build` script runs only `tsc`. TypeScript leaves `@/...` aliases and extensionless imports in the emitted ES modules, and `node dist/server.js` does not resolve them. This guide deliberately uses the installed `tsx` runner without watch mode under systemd. `NODE_ENV=production` still applies. A future compiled deployment must first correct and verify emitted import resolution. Do not assume a successful type check proves `pnpm start` works.

The existing Dockerfile/Compose are development tooling: source bind mounts, `pnpm dev`, published database/Studio ports, an inconsistent API port mapping, and a bcrypt version override. They are not the production path in this guide.

## 5. Create PostgreSQL credentials and database

```bash
sudo -u postgres psql
```

At the SQL prompt:

```sql
CREATE ROLE acm_user LOGIN;
\password acm_user
CREATE DATABASE acm_db OWNER acm_user;
\q
```

The password prompt prevents putting the database password into shell history. Use a unique strong password. PostgreSQL must listen only locally for this layout; inspect `/etc/postgresql/*/main/postgresql.conf` and `pg_hba.conf` if authentication fails. Use SCRAM password authentication for TCP loopback connections, then restart PostgreSQL if you changed its configuration.

Verify the connection interactively:

```bash
psql -h 127.0.0.1 -U acm_user -d acm_db -W -c 'SELECT current_database(), current_user;'
```

## 6. Configure the environment

```bash
cd /srv/acm/ACM-Backend
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
openssl rand -hex 32
nano .env
```

Use the two generated values as separate JWT and QR secrets. Replace the complete contents with:

```dotenv
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://acm_user:REPLACE_WITH_URL_ENCODED_PASSWORD@127.0.0.1:5432/acm_db
JWT_SECRET=REPLACE_WITH_FIRST_RANDOM_SECRET
JWT_EXPIRES_IN=1d
QR_SECRET=REPLACE_WITH_SECOND_RANDOM_SECRET
ALLOWED_ORIGINS=https://acm.example.com
LOG_LEVEL=info
UPLOAD_MAX_SIZE=5242880
```

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Local PostgreSQL connection; percent-encode special characters in its password, such as `@` → `%40`. The original password is used at the PostgreSQL prompt. |
| `PORT` | Must match Nginx's upstream port. |
| `NODE_ENV` | Production enables the configured CORS origin allowlist and file-based logging. |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing secret and lifetime. Changing the secret invalidates existing tokens. |
| `QR_SECRET` | QR signing secret; falls back to JWT secret if omitted. Keep it stable or existing signed QR codes may become invalid. |
| `ALLOWED_ORIGINS` | Comma-separated browser origins, including scheme, with no trailing slash or path. Include only frontend origins you use. |
| `UPLOAD_MAX_SIZE` | Per-file limit in bytes; default 5 MiB. Nginx must also allow the entire multipart request. |
| `LOG_LEVEL` | Winston verbosity; `info` is a reasonable starting point. |

**Remove `MAX_REQUEST_LIMIT` entirely**, including an empty assignment. The current configuration schema expects a number but directly receives an environment string, so setting this variable causes startup validation to fail. When absent, it defaults to 1000. The global limiter is commented out in `app.ts`, though route-specific limiters remain active.

`POSTGRES_*` variables are used by development Compose, not by the host-managed PostgreSQL server. Never copy a real environment file into the frontend or commit it. The sample hostname `postgres` resolves inside Compose, not in this host setup.

## 7. Apply the committed database migrations

Run from the backend directory. `drizzle.config.ts` does not load `.env` itself; explicitly load it into the migration process:

```bash
cd /srv/acm/ACM-Backend
node --env-file=.env node_modules/drizzle-kit/bin.cjs migrate
pnpm exec tsc --noEmit
```

Use this direct migration command rather than `pnpm db:migrate`: the package script invokes Docker Compose. Apply all committed migrations (currently `0000` through `0005`) to a new empty database. Do not run `db:generate` as an installation step, and do not substitute `push` on a live database. Migration generation belongs in development and produces files that should be reviewed and committed.

For an existing database, back it up first and inspect its migration history. If it was previously created with `push` or manually edited, reconcile the schema/history before migrating; do not blindly rerun initial SQL or delete migration records.

## 8. Create the first administrator without sample data

Public registration requires an authenticated administrator with `settings.manage`; you must bootstrap the first account directly. **Do not run `pnpm seed` or `pnpm db:seed` in production.** The seed truncates application tables and inserts sample data and a known password.

Create a temporary, non-destructive bootstrap script in the backend root:

```bash
cd /srv/acm/ACM-Backend
cat > bootstrap-admin.mjs <<'JS'
import bcrypt from 'bcrypt';
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16) {
    throw new Error('Use a password of at least 16 characters');
  }
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  const rows = await sql`
    INSERT INTO users (username, email, password, role, active)
    VALUES (${process.env.ADMIN_USERNAME}, ${process.env.ADMIN_EMAIL}, ${hash}, 'admin', true)
    RETURNING id, username, role`;
  console.log(rows);
} finally {
  await sql.end();
}
JS
read -r -p 'Admin username: ' ADMIN_USERNAME
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password (16+ characters): ' ADMIN_PASSWORD
printf '\n'
export ADMIN_USERNAME ADMIN_EMAIL ADMIN_PASSWORD
node --env-file=.env bootstrap-admin.mjs
unset ADMIN_USERNAME ADMIN_EMAIL ADMIN_PASSWORD
rm bootstrap-admin.mjs
```

Use an alphanumeric username of at least 3 characters and a valid email. Stop if insertion fails; a uniqueness error means the username/email already exists. This script never resets or overwrites an existing account. Store the credentials securely. Role policies are created by migrations; the application supplies default permissions.

## Import existing members and historical book loans (optional)

Do this after migrations and administrator setup, before opening the application to users. Import **members first, then loans**: each loan references a member's original registration number. For an already-running installation, take the database/uploads backup described in section 13 and schedule a maintenance window. Both importers lock their destination table during writes; stopping the API avoids concurrent user changes:

```bash
sudo systemctl stop acm-backend
```

Skip that command on a fresh installation where the service has not been created yet. Keep the service stopped if an import fails and you need to investigate; restart it when you are ready to resume normal use.

The detailed format, validation rules, and conflict behavior are documented in:

- [Member import guide — IMPORT_MEMBERS.md](src/db/IMPORT_MEMBERS.md)
- [Historical loan import guide — IMPORT_BOOKS.md](src/db/IMPORT_BOOKS.md)

Those guides include Docker-host examples using port **5434**. For the host-managed PostgreSQL deployment in this README, use the commands below: `.env` already points to **127.0.0.1:5432**, so no `--host` or `--port` override is needed. Their observed workbook/database counts describe an earlier analysis, not guaranteed totals for your files.

### Transfer and protect the workbooks

The Excel files are ignored by Git and must be copied separately. As `deploy`, create a private directory on the VPS:

```bash
install -d -m 700 /srv/acm/imports
```

From your **local computer**, upload the source files (adjust local paths and VPS address):

```bash
scp /path/to/1MainData.xlsx /path/to/2BookData.xlsx deploy@VPS_IP:/srv/acm/imports/
```

Back on the VPS:

```bash
chmod 600 /srv/acm/imports/1MainData.xlsx /srv/acm/imports/2BookData.xlsx
cd /srv/acm/ACM-Backend
```

Keep these personal-data files outside the public web root and `uploads/`. Both importers read the first worksheet and require the exact column headers described in their corresponding guides. Dates must be real Excel date cells/serials, not date-looking text strings.

### Validate, compare, and import members

```bash
# Offline validation only: no database connection or writes.
pnpm import-members --file /srv/acm/imports/1MainData.xlsx

# Read-only comparison against the production database.
pnpm import-members --file /srv/acm/imports/1MainData.xlsx --check-db

# After reviewing the results, insert missing members.
pnpm import-members --file /srv/acm/imports/1MainData.xlsx --apply
```

The importer loads `.env` automatically when run from the backend root. Review the reported invalid profiles and fix the workbook before applying. Offline preview can report profile issues without failing the process, so read its summary rather than relying only on the exit code. Invalid or duplicate member IDs always abort.

If you deliberately accept excluding invalid profiles, replace the apply command with:

```bash
pnpm import-members --file /srv/acm/imports/1MainData.xlsx --apply --skip-invalid
```

Existing member IDs are always preserved, even when spreadsheet fields differ; this is an insert-only import, not an update/synchronization operation. Applying also repairs the member ID sequence. **Skipping a missing invalid member may prevent the loan import** if a loan references that ID; correct/import those members before proceeding.

The member `Photo` column stores a reference only: it does not transfer image files. Copy the corresponding images into `/srv/acm/ACM-Backend/uploads/` with paths matching the stored references and ownership readable by `deploy`. Verify the generated frontend image URLs against `FILE_URL`; copying a workbook alone cannot restore photos.

### Validate and import loans

Ensure all migrations are applied, including `0004` (loan table) and `0005` (nullable creator), then run:

```bash
# Offline validation; does not check database references or conflicts.
pnpm import-books --file /srv/acm/imports/2BookData.xlsx

# Apply using the production DATABASE_URL from .env.
pnpm import-books --file /srv/acm/imports/2BookData.xlsx --apply
```

Despite its name, `import-books` imports **loan records**, not a book catalog. It stores the creator as NULL by default. To attribute new loans to an existing user, use the actual user ID returned during administrator creation, for example:

```bash
# Replace 123 with a real existing user ID; use instead of the apply above.
pnpm import-books --file /srv/acm/imports/2BookData.xlsx --created-by 123 --apply
```

There is no loan `--check-db` or `--skip-invalid` option. Invalid rows abort validation; missing members, a nonexistent explicit creator, or conflicting existing loan IDs abort the database transaction. Identical existing loans are skipped without overwriting them. Review the final process exit status as well as output: the loan import count is logged inside the transaction, before commit completes. Sequence changes are not transactional and may leave harmless gaps after a failure.

### Verify and resume operation

On a fresh installation, continue with section 9 to create/start the service. On an existing deployment:

```bash
sudo systemctl start acm-backend
curl --fail http://127.0.0.1:3000/health
```

Log in to the frontend and verify member registration numbers, photos, historical loan dates, and returned/unreturned status. Compare counts to the importer summaries, accounting for preserved existing members and skipped identical loans. Create a new member and loan through the UI to confirm their generated IDs do not collide with imported IDs. Retain protected source workbooks and the pre-import backup according to your data-retention needs. Never use the destructive seed script to fix an import error.

## 9. Run persistently with systemd

Create the service:

```bash
sudo nano /etc/systemd/system/acm-backend.service
```

```ini
[Unit]
Description=ACM Express API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/srv/acm/ACM-Backend
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/node --import tsx src/server.ts
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0027
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

The working directory matters: dotenv loads `.env` there, and uploads, logs, and Swagger source paths are relative to it. `deploy` must own and be able to write `uploads/` and `logs/`. Keep the process count at one: SSE uses an in-memory event emitter, so independent worker processes would not share events.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now acm-backend
sudo systemctl status acm-backend --no-pager
curl --fail http://127.0.0.1:3000/health
```

Expect JSON with `success: true` and `data.status: "ok"`. This endpoint only checks the HTTP process; it does not test the database. Express currently binds `0.0.0.0`; the host/provider firewall must block direct external access to port 3000.

## 10. Configure the API reverse proxy

```bash
sudo nano /etc/nginx/sites-available/acm-api
```

Replace `api.acm.example.com` in this configuration:

```nginx
server {
    listen 80;
    server_name api.acm.example.com;
    client_max_body_size 12m;

    location /api/sse/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        # SSE carries JWTs in query strings; avoid recording those URLs.
        access_log off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`proxy_pass` has no trailing URI: preserve `/api/...`, `/health`, and `/uploads/...` exactly. Disabling SSE buffering lets events reach browsers immediately. The forwarded client address assumes Nginx is the single public proxy (matching Express's `trust proxy = 1`); revise the trusted-proxy setup if adding a CDN or load balancer. Uploaded files under `/uploads` are publicly served by Express, so upload only content intended to be accessible by URL.

```bash
sudo ln -s /etc/nginx/sites-available/acm-api /etc/nginx/sites-enabled/acm-api
sudo nginx -t
sudo systemctl reload nginx
curl --fail http://api.acm.example.com/health
```

If the symlink already exists, edit the existing file rather than creating it again.

## 11. Enable HTTPS

DNS and inbound port 80 must work before requesting a certificate:

```bash
sudo snap install --classic certbot
sudo /snap/bin/certbot --nginx -d api.acm.example.com
sudo nginx -t
sudo /snap/bin/certbot renew --dry-run
curl --fail https://api.acm.example.com/health
```

Provide your email and choose the HTTPS redirect if prompted. Certbot installs renewal scheduling; verify it with `systemctl list-timers --all | grep certbot`. Keep port 80 available for renewal/redirects. Repeat certificate setup for the frontend domain in its guide.

Swagger is at `/api-docs`, but its server URL is currently hardcoded to `http://localhost:5002` in `src/swagger/options.ts`. To use “Try it out” remotely, change that URL to your HTTPS API domain and restart the service. Swagger UI alone is not proof that the API/database works.

## 12. Verify the complete application

1. Deploy the frontend using its README and open its HTTPS URL.
2. Log in with the administrator created above. Successful login verifies database access and password hashing.
3. Create a test member/activity and verify that data survives a backend restart.
4. Upload a profile image and open its URL under `https://api.acm.example.com/uploads/`.
5. Open two sessions and create an activity/check-in; inspect live updates. The browser's Network panel should show `/api/sse/...` as a pending `text/event-stream`, receiving events/heartbeats.
6. Refresh a frontend page directly and test QR scanning over HTTPS (camera access requires a secure context).
7. Reboot during an agreed maintenance period and verify Nginx, PostgreSQL, and `acm-backend` all return automatically.

Check CORS separately if needed:

```bash
curl -i -X OPTIONS https://api.acm.example.com/api/auth/login \
  -H 'Origin: https://acm.example.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expect the frontend origin in `Access-Control-Allow-Origin`. An HTTP health check cannot establish that browser CORS is configured correctly.

## 13. Logs, backups, updates, and recovery

### Diagnose problems

```bash
sudo journalctl -u acm-backend -n 100 --no-pager
tail -n 100 /srv/acm/ACM-Backend/logs/error.log
tail -n 100 /srv/acm/ACM-Backend/logs/combined.log
sudo tail -n 100 /var/log/nginx/error.log
sudo ss -ltnp
```

Production Winston logs go to files; journal output alone may omit request/database failures. Configure log rotation, for example `/etc/logrotate.d/acm-backend`:

```text
/srv/acm/ACM-Backend/logs/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
    su deploy deploy
}
```

### Back up database and files

Back up both PostgreSQL and `uploads/`; a database dump does not contain photos/certificates. Keep a protected copy of `.env` separately, including the QR secret. For a consistent maintenance snapshot, stop writes briefly:

```bash
sudo install -d -m 700 /var/backups/acm
sudo systemctl stop acm-backend
sudo -u postgres pg_dump -Fc acm_db | sudo tee /var/backups/acm/database.dump > /dev/null
sudo tar -czf /var/backups/acm/uploads.tar.gz -C /srv/acm/ACM-Backend uploads
sudo chmod 600 /var/backups/acm/database.dump /var/backups/acm/uploads.tar.gz
sudo systemctl start acm-backend
```

Check both backup commands succeeded; restart the service even if a backup fails. These filenames are overwritten: copy them to timestamped, encrypted off-server storage before the next backup. Schedule backups to match acceptable data loss and test restoration in an isolated database.

For disaster recovery, stop the API, recreate an **empty** `acm_db` owned by `acm_user` (do not drop a live database casually), and restore as follows. `pg_restore` must be able to read the dump, so stream it through sudo:

```bash
sudo cat /var/backups/acm/database.dump | sudo -u postgres pg_restore --no-owner --role=acm_user -d acm_db
sudo tar -xzf /var/backups/acm/uploads.tar.gz -C /srv/acm/ACM-Backend
sudo chown -R deploy:deploy /srv/acm/ACM-Backend/uploads
sudo systemctl start acm-backend
```

Restore the matching application version and environment secrets, then verify login, images, and live updates. Migration history is included in the dump; do not reinitialize a restored schema.

### Update an existing installation

Take and verify backups first. Record `git rev-parse HEAD`, inspect the incoming changes/migrations, and preserve `.env`, uploads, and logs. During a maintenance window:

```bash
cd /srv/acm/ACM-Backend
sudo systemctl stop acm-backend
git pull --ff-only
HUSKY=0 pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
node --env-file=.env node_modules/drizzle-kit/bin.cjs migrate
sudo systemctl start acm-backend
curl --fail http://127.0.0.1:3000/health
```

If installation, checking, or migration fails, stop and inspect the error before serving traffic. Application rollback alone may be incompatible with a changed schema: restore the matching database/files backup if needed, accepting loss of writes since the snapshot. Do not use the seed script as recovery. Restart the service after backend `.env` changes; frontend URL changes require rebuilding the frontend.

## Troubleshooting reference

| Symptom | Likely cause / action |
| --- | --- |
| Configuration validation fails at `rateLimit.max` | Remove `MAX_REQUEST_LIMIT` from `.env` and any inherited environment. |
| `ENOTFOUND postgres` | Use `127.0.0.1` in the host deployment's database URL. |
| 502 Bad Gateway | Check systemd, logs, and matching `PORT`/Nginx upstream. |
| `Cannot find package '@/...'` after `pnpm start` | Use the documented tsx systemd entry point; emitted JS imports need a separate build fix. |
| `relation ... does not exist` | Apply migrations to the same database the service uses. |
| Browser CORS error | Match the exact HTTPS frontend origin in `ALLOWED_ORIGINS`, then restart. |
| Upload 413 / failed upload | Check Nginx request limit, application per-file limit, permissions, and disk space. |
| Login works but live data stalls | Check SSE buffering/timeouts, token permissions, and keep one API process. |
| Missing photos after redeploy | Preserve/restore `uploads/`; do not replace it with an empty checkout. |

## Reference documentation

- [Angular/Node compatibility](https://angular.dev/reference/versions)
- [Node.js 22 distribution files](https://nodejs.org/dist/latest-v22.x/)
- [Nginx proxy directives and buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Certbot Nginx installation and renewal](https://certbot.eff.org/instructions?os=snap&tab=standard&ws=nginx)
