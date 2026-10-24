import test from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tnf-h-'));
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tnf-hd-'));
const { createApp } = await import('../src/app.js');
test('GET /api/health', async () => {
  const s = (await createApp()).listen(0);
  const res = await fetch(`http://localhost:${s.address().port}/api/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'ok');
  s.close();
});
