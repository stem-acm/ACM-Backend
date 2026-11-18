import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { after, before, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import express from 'express';

// The auth middleware reads the shared `db`. Its queries go to an in-memory PostgreSQL
// (PGlite) that runs the real migrations: no local database is needed.
const migrationsFolder = fileURLToPath(new URL('../src/db/migrations', import.meta.url));
const originalDirectory = process.cwd();
process.chdir(tmpdir());
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-secret';
process.env.QR_SECRET = 'test-secret';
const { db } = await import('../src/db/drizzle');
const schema = await import('../src/db/schema');
const { generateToken } = await import('../src/utils/jwtUtils');
const { saveMemberPhoto, deleteMemberPhoto } = await import('../src/utils/memberPhoto');
const { default: uploadRoutes } = await import('../src/routes/uploadRoutes');
process.chdir(originalDirectory);

const testDb = drizzle(new PGlite(), { schema });
await migrate(testDb, { migrationsFolder });
for (const method of ['select', 'insert', 'update', 'delete', 'transaction']) {
  const target = testDb as unknown as Record<string, (...args: unknown[]) => unknown>;
  mock.method(db, method as 'select', (...args: unknown[]) => target[method](...args));
}

const [user] = await testDb
  .insert(schema.users)
  .values({ username: 'viewer', email: 'viewer@test.local', password: 'x', role: 'admin' })
  .returning();
const token = generateToken({
  id: user.id,
  username: user.username,
  email: user.email,
  role: 'admin',
});

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

let server: Server;
let baseUrl: string;
let photo: string;

before(async () => {
  photo = await saveMemberPhoto({ buffer: onePixelPng } as Express.Multer.File);
  const app = express();
  app.use('/uploads', uploadRoutes);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/uploads`;
});

after(async () => {
  server.close();
  await deleteMemberPhoto(photo);
});

test('a member photo without a token gets 401 and no image', async () => {
  const response = await fetch(`${baseUrl}/${photo}`);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('a member photo with an invalid token gets 401', async () => {
  const response = await fetch(`${baseUrl}/${photo}`, {
    headers: { Authorization: 'Bearer not-a-token' },
  });
  assert.equal(response.status, 401);
});

test('the members folder does not redirect or list without a token', async () => {
  const response = await fetch(`${baseUrl}/members`, { redirect: 'manual' });
  assert.equal(response.status, 401);
});

test('a member photo with a valid token is served, not cached by shared caches', async () => {
  const response = await fetch(`${baseUrl}/${photo}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), onePixelPng);
});

test('the default avatar stays public', async () => {
  const response = await fetch(`${baseUrl}/user.png`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
});

test('another file at the root of uploads needs a token', async () => {
  const response = await fetch(`${baseUrl}/linus.jpg`);
  assert.equal(response.status, 401);
});
