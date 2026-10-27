import test, { before, after } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Creates a temporary test directory.
const mk = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const storage = mk('tnf-fs-');
process.env.STORAGE_DIR = storage; process.env.DATA_DIR = mk('tnf-fd-');
process.env.LOG_SILENT = '1'; process.env.YARA_PATH = 'definitely-not-installed-yara';
const { createApp } = await import('../src/app.js');
let server, base, app;
before(/* Sets up resources before the test cases run. */ async () => { app = await createApp(); server = app.listen(0); base = `http://localhost:${server.address().port}`; });
after(/* Releases resources after the test cases run. */ () => server.close());

// Uploads the supplied test file.
const upload = async (content, name = 'note.txt') => {
  const fd = new FormData(); fd.append('file', new Blob([content]), name);
  return (await fetch(`${base}/api/files`, { method: 'POST', body: fd })).json();
};

// Analyzes analyze operation.
const analyze = async (id) => { const r = await (await fetch(`${base}/api/files/${id}/analyze`, { method: 'POST' })).json(); await app.locals.jobs.onIdle(); return r.analysis; };

test('capabilities report disabled integrations honestly',/* Runs the test case: capabilities report disabled integrations honestly. */ async () => {
  const c = await (await fetch(`${base}/api/config/capabilities`)).json();
  assert.equal(c.integrations.llm.status, 'not_configured'); assert.equal(c.integrations.sandbox.status, 'unavailable');
  assert.equal(c.integrations.database.status, 'not_configured'); assert.equal(c.persistence, 'local_json_development_store');
  assert.ok(!JSON.stringify(c).includes(storage));
});
test('re-uploading identical content returns a priorAnalysis notice',/* Runs the test case: re-uploading identical content returns a priorAnalysis notice. */ async () => {
  const first = await upload('identical content for dedupe test');
  assert.equal(first.priorAnalysis, null);
  const a = await analyze(first.file.id);
  const second = await upload('identical content for dedupe test', 'copy.txt');
  assert.equal(second.priorAnalysis.analysisId, a.id); assert.notEqual(second.file.id, first.file.id);
});
test('DELETE keeps the report but removes stored bytes; purge removes history',/* Runs the test case: DELETE keeps the report but removes stored bytes; purge removes history. */ async () => {
  const up = await upload('delete me please'); const a = await analyze(up.file.id);
  const stored = fs.readdirSync(storage).length;
  const res = await fetch(`${base}/api/files/${up.file.id}`, { method: 'DELETE' });
  assert.equal(res.status, 200); assert.equal((await res.json()).purged, false);
  assert.equal(fs.readdirSync(storage).length, stored - 1);
  assert.equal((await fetch(`${base}/api/analyses/${a.id}/report`)).status, 200);
  assert.equal((await (await fetch(`${base}/api/files/${up.file.id}`)).json()).file.fileDeleted, true);
  assert.equal((await fetch(`${base}/api/files/${up.file.id}/analyze`, { method: 'POST' })).status, 409);
  assert.equal((await fetch(`${base}/api/files/${up.file.id}?purge=true`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${base}/api/analyses/${a.id}`)).status, 404);
});
test('DELETE validates IDs and unknown files',/* Runs the test case: DELETE validates IDs and unknown files. */ async () => {
  assert.equal((await fetch(`${base}/api/files/nope`, { method: 'DELETE' })).status, 400);
  assert.equal((await fetch(`${base}/api/files/00000000-0000-4000-8000-000000000000`, { method: 'DELETE' })).status, 404);
});
