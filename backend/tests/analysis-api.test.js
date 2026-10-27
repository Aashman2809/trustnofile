import test, { before, after } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Creates a temporary test directory.
const mk = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const storage = mk('tnf-as-');
process.env.STORAGE_DIR = storage; process.env.DATA_DIR = mk('tnf-ad-');
process.env.LOG_SILENT = '1'; process.env.YARA_PATH = 'definitely-not-installed-yara';
const { createApp } = await import('../src/app.js');

let server, base, app;
before(/* Sets up resources before the test cases run. */ async () => { app = await createApp(); server = app.listen(0); base = `http://localhost:${server.address().port}`; });
after(/* Releases resources after the test cases run. */ () => server.close());

// Uploads the supplied test file.
const upload = async (content, name = 'note.txt') => {
  const fd = new FormData(); fd.append('file', new Blob([content]), name);
  return (await (await fetch(`${base}/api/files`, { method: 'POST', body: fd })).json()).file;
};

// Handles post operation.
const post = (id, body) => fetch(`${base}/api/files/${id}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });

test('analyze -> 202, then poll to COMPLETED; evidence, report and JSON download work',/* Runs the test case: analyze -> 202, then poll to COMPLETED; evidence, report and JSON download work. */ async () => {
  const f = await upload('hello from a test file');
  const res = await post(f.id); assert.equal(res.status, 202);
  const { analysis, created } = await res.json(); assert.equal(created, true);
  await app.locals.jobs.onIdle();
  const got = (await (await fetch(`${base}/api/analyses/${analysis.id}`)).json()).analysis;
  assert.equal(got.status, 'COMPLETED'); assert.equal(got.assessment.riskLevel, 'low');
  const ev = await (await fetch(`${base}/api/analyses/${analysis.id}/evidence`)).json();
  assert.equal(ev.evidence.modules.length, 8);
  const rep = await (await fetch(`${base}/api/analyses/${analysis.id}/report`)).json();
  assert.equal(rep.report.ai.status, 'not_configured'); assert.equal(rep.report.file.sha256, f.sha256);
  const dl = await fetch(`${base}/api/analyses/${analysis.id}/report.json`);
  assert.equal(dl.status, 200); assert.match(dl.headers.get('content-disposition'), /attachment/);
  assert.equal(JSON.parse(await dl.text()).schemaVersion, '1.0');
});
test('second analyze request returns existing result with 200 instead of duplicating',/* Runs the test case: second analyze request returns existing result with 200 instead of duplicating. */ async () => {
  const f = await upload('another file');
  const a = await (await post(f.id)).json(); await app.locals.jobs.onIdle();
  const res = await post(f.id); assert.equal(res.status, 200);
  assert.equal((await res.json()).analysis.id, a.analysis.id);
  assert.equal((await post(f.id, { force: true })).status, 202); await app.locals.jobs.onIdle();
});
test('invalid and unknown IDs; unknown file; unavailable report',/* Runs the test case: invalid and unknown IDs; unknown file; unavailable report. */ async () => {
  assert.equal((await post('nope')).status, 400);
  assert.equal((await post('00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await fetch(`${base}/api/analyses/nope`)).status, 400);
  assert.equal((await fetch(`${base}/api/analyses/00000000-0000-4000-8000-000000000000/report`)).status, 404);
});
test('rejected analysis has no report (409) and appears in filtered history',/* Runs the test case: rejected analysis has no report (409) and appears in filtered history. */ async () => {
  const f = await upload('will be deleted');
  fs.readdirSync(storage).forEach(/* Processes each item in the collection. */ (n) => { if (n.endsWith('.bin') && fs.readFileSync(path.join(storage, n), 'utf8') === 'will be deleted') fs.rmSync(path.join(storage, n)); });
  const a = (await (await post(f.id)).json()).analysis; await app.locals.jobs.onIdle();
  assert.equal((await fetch(`${base}/api/analyses/${a.id}/report`)).status, 409);
  const list = await (await fetch(`${base}/api/analyses?status=REJECTED`)).json();
  assert.ok(list.items.some(/* Checks whether the item meets the condition. */ (x) => x.id === a.id));
});
test('list filters validate input',/* Runs the test case: list filters validate input. */ async () => {
  assert.equal((await fetch(`${base}/api/analyses?status=BOGUS`)).status, 400);
  assert.equal((await fetch(`${base}/api/analyses?risk=BOGUS`)).status, 400);
  const ok = await (await fetch(`${base}/api/analyses?risk=low&search=note`)).json();
  assert.ok(ok.total >= 1);
});
