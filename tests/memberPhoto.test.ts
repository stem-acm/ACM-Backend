import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  deleteMemberPhoto,
  detectImageType,
  saveMemberPhoto,
  uploadsRoot,
} from '../src/utils/memberPhoto';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test('detects supported image signatures and rejects disguised content', () => {
  assert.equal(detectImageType(onePixelPng)?.mimeType, 'image/png');
  assert.equal(detectImageType(Buffer.from('<script>alert(1)</script>')), null);
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), null);
});

test('stores member photos under uploads/members with a generated safe name', async () => {
  const file = {
    buffer: onePixelPng,
    mimetype: 'image/png',
    originalname: '../../unsafe.png',
    fieldname: 'photo',
    size: onePixelPng.length,
  } as Express.Multer.File;

  const reference = await saveMemberPhoto(file);
  try {
    assert.match(reference, /^members\/[0-9a-f-]+\.png$/);
    await access(resolve(uploadsRoot, reference));
  } finally {
    await deleteMemberPhoto(reference);
  }
});

test('refuses to delete paths outside the managed member directory', async () => {
  await deleteMemberPhoto('../package.json');
});
