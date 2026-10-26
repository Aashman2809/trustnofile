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
const { assessRisk } = await import('../src/services/risk-assessment.service.js');
const { canTransition, applyTransition, initialStages } = await import('../src/services/analysis-states.js');
const { createOrchestrator } = await import('../src/services/analysis-orchestrator.service.js');
const { createInProcessJobManager } = await import('../src/services/job-manager.js');
const { createLocalFileRepository } = await import('../src/repositories/local-file.repository.js');
const { createLocalAnalysisRepository } = await import('../src/repositories/local-analysis.repository.js');
const { stringsModule } = await import('../src/analysis/strings.js');
const { entropyModule } = await import('../src/analysis/entropy.js');
const { buildRecommendations } = await import('../src/services/report.service.js');

const fileRepo = await createLocalFileRepository(dataA);
const analysisRepo = await createLocalAnalysisRepository(dataB);
const okMod = (module, extra = {}) => ({ module, status: 'completed', data: {}, findings: [], errors: [], durationMs: 1, ...extra });
const CORE = ['identification', 'hashing', 'metadata', 'strings', 'entropy'].map((m) => okMod(m));
const F = (code, severity, module, kind = 'heuristic') => ({ code, title: code, severity, module, kind });
const text = { detected: { format: 'text' } };

async function addFile(content = 'hello world') {
  const id = randomUUID();
  fs.writeFileSync(path.join(storage, `${id}.bin`), content);
  const rec = { id, storedName: `${id}.bin`, originalName: 'a.txt', size: Buffer.byteLength(content), extension: 'txt', detected: { format: 'text', mime: 'text/plain', category: 'Plain text' },
    typeMismatch: false, sha256: createHash('sha256').update(content).digest('hex'), md5: 'x', status: 'UPLOADED', uploadedAt: new Date().toISOString() };
  await fileRepo.create(rec); return rec;
}
const setup = (runStatic) => { const jobs = createInProcessJobManager(); return { jobs, orch: createOrchestrator({ fileRepo, analysisRepo, jobs, storageDir: storage, ...(runStatic ? { runStatic } : {}) }) }; };

// ---------- risk assessment ----------
test('risk: no indicators -> score 0, low, but explicitly NOT a safety verdict', () => {
  const r = assessRisk({ findings: [], modules: CORE, file: text });
  assert.equal(r.riskScore, 0); assert.equal(r.riskLevel, 'low'); assert.equal(r.noIndicatorsDetected, true);
  assert.ok(r.limitations.some((l) => l.includes('does not mean the file is safe')));
  assert.equal(r.confidence, 'limited'); assert.equal(r.evidenceSufficiency, 'partial');
});
test('risk: one weak indicator stays low', () => {
  const r = assessRisk({ findings: [F('HIGH_ENTROPY', 'low', 'entropy')], modules: CORE, file: text });
  assert.equal(r.riskLevel, 'low'); assert.equal(r.riskScore, 4); assert.equal(r.reasons.length, 1);
});
test('risk: correlated indicators add a bonus and reach moderate', () => {
  const f = [F('FORMAT_MISMATCH', 'medium', 'identification'), F('STR_CMD_EXEC', 'medium', 'strings'), F('PDF_ACTIVE_CONTENT', 'medium', 'metadata')];
  const r = assessRisk({ findings: f, modules: CORE, file: text });
  assert.equal(r.riskScore, 46); assert.equal(r.riskLevel, 'moderate');
  assert.ok(r.reasons.some((x) => x.code === 'CORRELATED_INDICATORS'));
});
test('risk: strong configured indicators score high; duplicates counted once', () => {
  const r = assessRisk({ findings: [F('YARA_MATCH', 'medium', 'yara', 'observed'), F('YARA_MATCH', 'medium', 'yara', 'observed'), F('HASH_MISMATCH', 'high', 'hashing', 'observed')], modules: CORE, file: text });
  assert.equal(r.riskScore, 75); assert.equal(r.riskLevel, 'very_high');
});
test('risk: insufficient evidence yields null score, not an invented one', () => {
  const r = assessRisk({ findings: [], modules: [okMod('hashing'), { module: 'strings', status: 'failed', errors: ['x'], findings: [] }], file: text });
  assert.equal(r.riskScore, null); assert.equal(r.riskLevel, 'insufficient_evidence'); assert.equal(r.sandboxRecommended, true);
});
test('risk: unavailable modules are listed as limitations; failed module lowers confidence', () => {
  const mods = [...CORE, { module: 'yara', status: 'unavailable', reason: 'YARA executable not found', findings: [], errors: [] }, { module: 'archive', status: 'failed', errors: ['boom'], findings: [] }];
  const r = assessRisk({ findings: [], modules: mods, file: text });
  assert.ok(r.limitations.some((l) => l.includes('yara') && l.includes('unavailable')));
  assert.equal(r.confidence, 'low'); assert.equal(r.sandboxRecommended, true);
});
test('risk: executables always recommend sandbox even with no indicators', () => {
  assert.equal(assessRisk({ findings: [], modules: CORE, file: { detected: { format: 'exe' } } }).sandboxRecommended, true);
});
test('recommendations never advise deleting or executing', () => {
  const recs = buildRecommendations([F('FORMAT_MISMATCH', 'low', 'identification')], assessRisk({ findings: [F('FORMAT_MISMATCH', 'low', 'identification')], modules: CORE, file: text }));
  assert.ok(recs.length > 0);
  assert.ok(!recs.some((r) => /delete|execute|run the file/i.test(r.text)));
});

// ---------- state machine ----------
test('state machine: valid and invalid transitions', () => {
  assert.ok(canTransition('UPLOADED', 'VALIDATING')); assert.ok(canTransition('VALIDATING', 'REJECTED'));
  assert.ok(!canTransition('UPLOADED', 'COMPLETED')); assert.ok(!canTransition('COMPLETED', 'VALIDATING')); assert.ok(!canTransition('FAILED', 'STATIC_ANALYSIS'));
});
test('stages: failure marks active stage failed and the rest skipped', () => {
  let s = initialStages('t0');
  s = applyTransition(s, 'VALIDATING', 't1'); s = applyTransition(s, 'STATIC_ANALYSIS', 't2'); s = applyTransition(s, 'FAILED', 't3', 'boom');
  const by = Object.fromEntries(s.map((x) => [x.name, x.status]));
  assert.deepEqual(by, { upload: 'completed', validation: 'completed', static_analysis: 'failed', evidence_aggregation: 'skipped', risk_assessment: 'skipped', ai_decision: 'skipped', sandbox_analysis: 'skipped', report_generation: 'skipped' });
});

// ---------- orchestrator ----------
test('orchestrator: successful analysis produces evidence, assessment and report', async () => {
  const f = await addFile('plain harmless text'), { orch, jobs } = setup();
  const r = await orch.start(f.id); assert.equal(r.created, true);
  await jobs.onIdle();
  const a = await analysisRepo.getById(r.analysis.id);
  assert.equal(a.status, 'COMPLETED');
  assert.ok(a.stages.filter((s) => s.name !== 'sandbox_analysis').every((s) => s.status === 'completed'));
  assert.equal(a.stages.find((s) => s.name === 'sandbox_analysis').status, 'skipped');
  assert.equal(a.assessment.riskLevel, 'low');
  assert.equal(a.report.ai.status, 'not_configured'); assert.equal(a.report.behavioral.status, 'not_required');
  assert.equal(a.report.file.storedName, undefined);
  assert.equal(a.evidence.modules.find((m) => m.module === 'yara').status, 'unavailable');
});
test('orchestrator: failed module -> PARTIAL, evidence from other modules kept', async () => {
  const f = await addFile(), { orch, jobs } = setup(async () => ({
    modules: [...CORE, { module: 'yara', status: 'failed', errors: ['x'], findings: [], data: {}, durationMs: 1 }], findings: [], summary: { completed: 5, skipped: 0, unavailable: 0, failed: 1, timeout: 0 } }));
  const r = await orch.start(f.id); await jobs.onIdle();
  const a = await analysisRepo.getById(r.analysis.id);
  assert.equal(a.status, 'PARTIAL'); assert.equal(a.assessment.confidence, 'low'); assert.ok(a.report);
});
test('orchestrator: crash in static stage -> FAILED, later stages skipped, no report', async () => {
  const f = await addFile(), { orch, jobs } = setup(async () => { throw new Error('secret internal /path detail'); });
  const r = await orch.start(f.id); await jobs.onIdle();
  const a = await analysisRepo.getById(r.analysis.id);
  assert.equal(a.status, 'FAILED'); assert.equal(a.report, null);
  assert.equal(a.stages.find((s) => s.name === 'static_analysis').status, 'failed');
  assert.equal(a.stages.find((s) => s.name === 'report_generation').status, 'skipped');
  assert.ok(!JSON.stringify(a.error).includes('secret'));
});
test('orchestrator: missing stored file -> REJECTED', async () => {
  const f = await addFile(), { orch, jobs } = setup();
  fs.rmSync(path.join(storage, f.storedName));
  const r = await orch.start(f.id); await jobs.onIdle();
  assert.equal((await analysisRepo.getById(r.analysis.id)).status, 'REJECTED');
});
test('orchestrator: only core module hashing completes -> COMPLETED with insufficient_evidence', async () => {
  const f = await addFile(), { orch, jobs } = setup(async () => ({ modules: [okMod('hashing')], findings: [], summary: { completed: 1, skipped: 0, unavailable: 0, failed: 0, timeout: 0 } }));
  const r = await orch.start(f.id); await jobs.onIdle();
  const a = await analysisRepo.getById(r.analysis.id);
  assert.equal(a.assessment.riskLevel, 'insufficient_evidence'); assert.equal(a.assessment.riskScore, null);
});
test('orchestrator: duplicate requests do not duplicate work; force does', async () => {
  const f = await addFile();
  const { orch, jobs } = setup(async () => { await new Promise((r) => setTimeout(r, 60)); return { modules: CORE, findings: [], summary: { completed: 5, skipped: 0, unavailable: 0, failed: 0, timeout: 0 } }; });
  const [a, b] = await Promise.all([orch.start(f.id), orch.start(f.id)]);
  assert.equal(a.analysis.id, b.analysis.id); assert.equal([a, b].filter((x) => x.created).length, 1); assert.equal(b.reason, 'already_running');
  await jobs.onIdle();
  const again = await orch.start(f.id); assert.equal(again.created, false); assert.equal(again.reason, 'already_completed');
  const forced = await orch.start(f.id, { force: true }); assert.equal(forced.created, true); assert.notEqual(forced.analysis.id, a.analysis.id);
  await jobs.onIdle();
});
test('orchestrator: unknown file -> 404 error; interrupted analyses are marked FAILED on startup', async () => {
  const { orch } = setup();
  await assert.rejects(() => orch.start(randomUUID()), (e) => e.status === 404);
  const f = await addFile();
  const stuck = await analysisRepo.create({ id: randomUUID(), fileId: f.id, status: 'STATIC_ANALYSIS', startedAt: new Date().toISOString(), finishedAt: null,
    stages: applyTransition(applyTransition(initialStages('t'), 'VALIDATING', 't'), 'STATIC_ANALYSIS', 't'), error: null, file: { originalName: 'a.txt' }, evidence: null, assessment: null, report: null });
  await orch.recoverInterrupted();
  const a = await analysisRepo.getById(stuck.id);
  assert.equal(a.status, 'FAILED'); assert.equal(a.error.code, 'INTERRUPTED');
});

// ---------- tuning fixes from the real-PDF scan ----------
test('strings: hex-only runs are not reported as base64 blobs; real base64 still is', async () => {
  const hex = path.join(storage, 'hex.txt'), b64 = path.join(storage, 'b64.txt');
  fs.writeFileSync(hex, 'FEFF00330020005400680069'.repeat(30)); fs.writeFileSync(b64, 'QUJD' + 'Zm9vYmFy'.repeat(40) + 'xyz+/Zz');
  assert.ok(!(await stringsModule({ filePath: hex })).findings.some((f) => f.code === 'STR_BASE64_BLOB'));
  assert.ok((await stringsModule({ filePath: b64 })).findings.some((f) => f.code === 'STR_BASE64_BLOB'));
});
test('entropy: PDFs (compressed streams) no longer raise HIGH_ENTROPY', async () => {
  const p = path.join(storage, 'rand.bin'); fs.writeFileSync(p, (await import('node:crypto')).randomBytes(70000));
  assert.equal((await entropyModule({ filePath: p, file: { detected: { format: 'pdf' } } })).findings.length, 0);
});

test('limitations: signature noise only for executables; no doubled punctuation', () => {
  const mods = [...CORE, { module: 'signature', status: 'unavailable', reason: 'Only for PE files.', findings: [], errors: [] }, { module: 'yara', status: 'unavailable', reason: 'YARA executable not found. This is NOT a clean scan.', findings: [], errors: [] }];
  const pdf = assessRisk({ findings: [], modules: mods, file: { detected: { format: 'pdf' } } });
  assert.ok(!pdf.limitations.some((l) => l.includes('"signature"')));
  assert.ok(pdf.limitations.some((l) => l.includes('"yara"')));
  assert.ok(!pdf.limitations.some((l) => /\.\)\./.test(l)));
  assert.ok(assessRisk({ findings: [], modules: mods, file: { detected: { format: 'exe' } } }).limitations.some((l) => l.includes('"signature"')));
});

test('limitations: only trailing periods/whitespace are trimmed, never letters', () => {
  const mods = [...CORE, { module: 'yara', status: 'unavailable', reason: 'Tools not installed...  ', findings: [], errors: [] }];
  const r = assessRisk({ findings: [], modules: mods, file: { detected: { format: 'pdf' } } });
  assert.ok(r.limitations.some((l) => l.endsWith('(Tools not installed).')), r.limitations.join('|'));
});
