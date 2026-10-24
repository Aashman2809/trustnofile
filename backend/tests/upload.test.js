import test, { before, after } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'tnf-s-'));
process.env.STORAGE_DIR = storage;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tnf-d-'));
process.env.MAX_UPLOAD_MB = '0.01'; // ~10 KB for the oversize test
const { createApp } = await import('../src/app.js');

let server, base;
before(async () => { server = (await createApp()).listen(0); base = `http://localhost:${server.address().port}`; });
after(() => server.close());

const send = (bytes, name, type = 'application/octet-stream') => {
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type }), name);
  return fetch(`${base}/api/files`, { method: 'POST', body: fd });
};
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');
const stored = () => fs.readdirSync(storage).length;

test('successful upload returns hash and detected type, hides storage internals', async () => {
  const res = await send(pdf, 'report.pdf', 'application/pdf');
  assert.equal(res.status, 201);
  const { file } = await res.json();
  assert.equal(file.sha256, createHash('sha256').update(pdf).digest('hex'));
  assert.equal(file.detected.format, 'pdf');
  assert.equal(file.typeMismatch, false);
  assert.equal(file.storedName, undefined);
  assert.equal(file.status, 'UPLOADED');
});
test('oversized upload is rejected and leaves no file behind', async () => {
  const before = stored();
  const res = await send(Buffer.alloc(20000, 97), 'big.txt');
  assert.equal(res.status, 413);
  assert.equal(stored(), before);
});
test('unsupported binary is rejected and cleaned up', async () => {
  const before = stored();
  const res = await send(Buffer.from([0, 1, 2, 3, 250, 251, 252, 0, 9, 9]), 'x.dat');
  assert.equal(res.status, 415);
  assert.equal(stored(), before);
});
test('empty file is rejected', async () => {
  assert.equal((await send(Buffer.alloc(0), 'empty.txt')).status, 400);
});
test('missing file field is rejected', async () => {
  const res = await fetch(`${base}/api/files`, { method: 'POST', body: new FormData() });
  assert.equal(res.status, 400);
});
test('filename is sanitized and path traversal neutralized', async () => {
  const { file } = await (await send('hello', '../../etc/evil<>.txt', 'text/plain')).json();
  assert.equal(file.originalName, 'evil.txt');
});
test('duplicate filenames get distinct IDs', async () => {
  const a = (await (await send('one', 'dup.txt')).json()).file;
  const b = (await (await send('two', 'dup.txt')).json()).file;
  assert.notEqual(a.id, b.id);
});
test('browser MIME type is not trusted', async () => {
  const { file } = await (await send('just text', 'note.txt', 'application/pdf')).json();
  assert.equal(file.detected.mime, 'text/plain');
});
test('extension/signature mismatch is flagged', async () => {
  const { file } = await (await send(pdf, 'invoice.txt', 'text/plain')).json();
  assert.equal(file.detected.format, 'pdf');
  assert.equal(file.typeMismatch, true);
});
test('GET /api/files validates IDs and returns 404 for unknown', async () => {
  assert.equal((await fetch(`${base}/api/files/not-an-id`)).status, 400);
  assert.equal((await fetch(`${base}/api/files/00000000-0000-4000-8000-000000000000`)).status, 404);
});
test('GET /api/files lists uploads and capabilities report uploads enabled', async () => {
  const list = await (await fetch(`${base}/api/files`)).json();
  assert.ok(list.total >= 1);
  const caps = await (await fetch(`${base}/api/config/capabilities`)).json();
  assert.equal(caps.upload.enabled, true);
});
