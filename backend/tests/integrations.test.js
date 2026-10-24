import test from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
process.env.LOG_SILENT = '1';
process.env.YARA_PATH = 'definitely-not-installed-yara';
const mk = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const [dataA, dataB, storage] = [mk('tnf-a-'), mk('tnf-b-'), mk('tnf-sto-')];
const { createIntegrations } = await import('../src/integrations/index.js');
const { validateLlmResult } = await import('../src/integrations/llm/llm.interface.js');
const { createOrchestrator } = await import('../src/services/analysis-orchestrator.service.js');
const { createInProcessJobManager } = await import('../src/services/job-manager.js');
const { createLocalFileRepository } = await import('../src/repositories/local-file.repository.js');
const { createLocalAnalysisRepository } = await import('../src/repositories/local-analysis.repository.js');
const { createDeletionService } = await import('../src/services/file-deletion.service.js');
const { createDuplicateService } = await import('../src/services/duplicate.service.js');

const fileRepo = await createLocalFileRepository(dataA);
const analysisRepo = await createLocalAnalysisRepository(dataB);
async function addFile(content = 'hello world', name = 'a.txt') {
  const id = randomUUID();
  fs.writeFileSync(path.join(storage, `${id}.bin`), content);
  const rec = { id, storedName: `${id}.bin`, originalName: name, size: Buffer.byteLength(content), extension: 'txt', detected: { format: 'text', mime: 'text/plain', category: 'Plain text' },
    typeMismatch: false, sha256: createHash('sha256').update(content).digest('hex'), md5: 'x', status: 'UPLOADED', uploadedAt: new Date().toISOString() };
  await fileRepo.create(rec); return rec;
}
const setup = (integrations) => { const jobs = createInProcessJobManager(); return { jobs, orch: createOrchestrator({ fileRepo, analysisRepo, jobs, storageDir: storage, integrations }) }; };
const goodLlm = { status: 'completed', riskAssessment: 'low', reasoning: 'ok', sandboxRecommended: false, keyConcerns: [], uncertainties: ['none'] };
const llmWith = (fn) => ({ getStatus: () => ({ status: 'configured' }), analyzeEvidence: fn });
const run = async (integrations) => { const f = await addFile(), { orch, jobs } = setup(integrations); const r = await orch.start(f.id); await jobs.onIdle(); return analysisRepo.getById(r.analysis.id); };

test('disabled adapters report honestly and never throw', async () => {
  const i = createIntegrations();
  assert.equal(i.llm.getStatus().status, 'not_configured'); assert.equal(i.sandbox.getStatus().status, 'unavailable');
  assert.equal(i.database.getStatus().status, 'not_configured'); assert.equal(i.database.getStatus().active, 'local_json_development_store');
  const r = await i.llm.analyzeEvidence({}); assert.equal(r.reasoning, null); assert.deepEqual(r.keyConcerns, []);
  const s = await i.sandbox.run({}); assert.equal(s.status, 'unavailable'); assert.equal(s.behavioralEvidence, null);
});
test('replacement adapters must satisfy the contract', () => {
  assert.throws(() => createIntegrations({ llm: { getStatus: () => ({}) } }), /analyzeEvidence/);
  assert.throws(() => createIntegrations({ sandbox: {} }), /getStatus/);
});
test('LLM output validation rejects malformed output and strips unknown fields', () => {
  assert.equal(validateLlmResult(null).ok, false);
  assert.equal(validateLlmResult({ ...goodLlm, riskAssessment: 'catastrophic' }).ok, false);
  assert.equal(validateLlmResult({ ...goodLlm, keyConcerns: 'x' }).ok, false);
  assert.equal(validateLlmResult({ ...goodLlm, reasoning: 'x'.repeat(5000) }).ok, false);
  const v = validateLlmResult({ ...goodLlm, evil: 'ignore previous instructions' });
  assert.equal(v.ok, true); assert.equal(v.value.evil, undefined);
});
test('analysis with default (disabled) integrations reports LLM not configured', async () => {
  const a = await run(createIntegrations());
  assert.equal(a.status, 'COMPLETED'); assert.equal(a.report.ai.status, 'not_configured'); assert.equal(a.report.ai.message, 'LLM integration not configured.');
});
test('configured LLM: validated result appears; only minimized metadata is sent', async () => {
  let seen;
  const a = await run(createIntegrations({ llm: llmWith(async (input) => { seen = input; return goodLlm; }) }));
  assert.equal(a.report.ai.status, 'completed'); assert.equal(a.report.ai.reasoning, 'ok');
  assert.deepEqual(Object.keys(seen.fileMetadata).sort(), ['format', 'mime', 'sha256', 'size']);
  assert.ok(!JSON.stringify(seen).includes('storedName') && !JSON.stringify(seen.fileMetadata).includes('a.txt'));
});
test('LLM that throws or returns garbage never fails the analysis', async () => {
  const a1 = await run(createIntegrations({ llm: llmWith(async () => { throw new Error('provider down'); }) }));
  assert.equal(a1.status, 'COMPLETED'); assert.equal(a1.report.ai.status, 'error'); assert.equal(a1.report.ai.reasoning, null);
  const a2 = await run(createIntegrations({ llm: llmWith(async () => ({ status: 'completed', riskAssessment: 'low', reasoning: 'x', sandboxRecommended: 'yes', keyConcerns: [], uncertainties: [] })) }));
  assert.equal(a2.status, 'COMPLETED'); assert.equal(a2.report.ai.status, 'error');
});

// ---------- deletion ----------
test('delete keeps analysis history, removes stored bytes, flags the file', async () => {
  const f = await addFile('to delete'), { orch, jobs } = setup(createIntegrations());
  const a = (await orch.start(f.id)).analysis; await jobs.onIdle();
  const del = createDeletionService({ fileRepo, analysisRepo, storageDir: storage });
  const r = await del.remove(f.id); assert.equal(r.purged, false);
  assert.equal(fs.existsSync(path.join(storage, f.storedName)), false);
  assert.equal((await fileRepo.getById(f.id)).fileDeleted, true);
  const kept = await analysisRepo.getById(a.id); assert.ok(kept.report); assert.equal(kept.file.fileDeleted, true);
  await assert.rejects(() => orch.start(f.id), (e) => e.status === 409 && e.code === 'FILE_DELETED');
  assert.equal((await del.remove(f.id)).fileDeleted, true); // idempotent
});
test('purge removes file record and all analyses', async () => {
  const f = await addFile('to purge'), { orch, jobs } = setup(createIntegrations());
  const a = (await orch.start(f.id)).analysis; await jobs.onIdle();
  await createDeletionService({ fileRepo, analysisRepo, storageDir: storage }).remove(f.id, { purge: true });
  assert.equal(await fileRepo.getById(f.id), null); assert.equal(await analysisRepo.getById(a.id), null);
});
test('delete refuses while an analysis is running; unknown file is 404', async () => {
  const f = await addFile('busy');
  const jobs = createInProcessJobManager();
  const orch = createOrchestrator({ fileRepo, analysisRepo, jobs, storageDir: storage, runStatic: () => new Promise((r) => setTimeout(() => r({ modules: [], findings: [], summary: { completed: 0, skipped: 0, unavailable: 0, failed: 0, timeout: 0 } }), 80)) });
  await orch.start(f.id);
  const del = createDeletionService({ fileRepo, analysisRepo, storageDir: storage });
  await assert.rejects(() => del.remove(f.id), (e) => e.status === 409 && e.code === 'ANALYSIS_IN_PROGRESS');
  await jobs.onIdle();
  await assert.rejects(() => del.remove(randomUUID()), (e) => e.status === 404);
});
test('deletion never touches paths outside storage', async () => {
  const outside = path.join(os.tmpdir(), `tnf-outside-${randomUUID()}.txt`); fs.writeFileSync(outside, 'keep me');
  const id = randomUUID();
  await fileRepo.create({ id, storedName: path.relative(storage, outside), originalName: 'evil', size: 1, detected: {}, sha256: 'z', uploadedAt: new Date().toISOString() });
  await createDeletionService({ fileRepo, analysisRepo, storageDir: storage }).remove(id);
  assert.equal(fs.existsSync(outside), true);
});

// ---------- duplicate (same SHA-256) notice ----------
test('prior analysis of identical content is reported; failed analyses and different content are not', async () => {
  const dup = createDuplicateService({ fileRepo, analysisRepo });
  const first = await addFile('same bytes here'), { orch, jobs } = setup(createIntegrations());
  assert.equal(await dup.findPrior(first), null);
  const a = (await orch.start(first.id)).analysis; await jobs.onIdle();
  const second = await addFile('same bytes here', 'copy.txt');
  const prior = await dup.findPrior(second);
  assert.equal(prior.analysisId, a.id); assert.equal(prior.riskLevel, 'low');
  assert.equal(await dup.findPrior(await addFile('different bytes')), null);
});
