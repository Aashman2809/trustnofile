import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRemoteSandbox } from '../src/integrations/sandbox/sandbox.remote.js';
import { createLocalFileRepository } from '../src/repositories/local-file.repository.js';
import { createLocalAnalysisRepository } from '../src/repositories/local-analysis.repository.js';
import { createOrchestrator } from '../src/services/analysis-orchestrator.service.js';
import { createInProcessJobManager } from '../src/services/job-manager.js';
import { randomUUID } from 'node:crypto';

test('remote adapter sends the staged file with worker auth and bounds the worker result', async () => {
  const file = path.join(os.tmpdir(), `tnf-worker-${process.pid}`);
  fs.writeFileSync(file, Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  const calls = [];
  const adapter = createRemoteSandbox({ url:'https://worker.example.test', token:'a'.repeat(40), fetchImpl:async (url, options) => {
    let uploaded = Buffer.alloc(0);
    if (url.endsWith('/v1/analyze')) for await (const chunk of options.body) uploaded = Buffer.concat([uploaded, chunk]);
    calls.push({ url, options, uploaded });
    if (url.endsWith('/v1/status')) return new Response(JSON.stringify({ status:'available' }), { status:200 });
    return new Response(JSON.stringify({ status:'completed', message:'ok', jobId:'ignored', sha256:'ignored', arbitrary:'ignored',
      behavioralEvidence:{ events:[{ type:'process_created', detail:'x'.repeat(500) }, { type:'unexpected', detail:'bad' }], exitCode:0, stdout:'y'.repeat(3000) }, logs:['ignored'], artifacts:[{ name:'ignored' }] }), { status:200 });
  } });
  try {
    assert.deepEqual(await adapter.getStatus(), { status:'available', executionScope:'isolated_linux_elf' });
    const result = await adapter.run({ fileRef:file, timeoutMs:5000 });
    assert.deepEqual(calls[1].uploaded, Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
    assert.equal(calls[1].options.headers.authorization, `Bearer ${'a'.repeat(40)}`);
    assert.equal(calls[1].options.headers['content-type'], 'application/octet-stream');
    assert.equal(calls[1].options.headers['content-length'], '4');
    assert.equal(calls[1].options.duplex, 'half');
    assert.deepEqual(result.behavioralEvidence.events, [{ type:'process_created', detail:'x'.repeat(300) }]);
    assert.equal(result.behavioralEvidence.stdout.length, 2000);
    assert.deepEqual(result.logs, []);
    assert.deepEqual(result.artifacts, []);
    assert.equal(JSON.stringify(result).includes('ignored'), false);
  } finally { fs.rmSync(file, { force:true }); }
});

test('remote adapter treats an unavailable worker as sandbox-unavailable without throwing', async () => {
  const file = path.join(os.tmpdir(), `tnf-worker-${process.pid}`);
  fs.writeFileSync(file, 'anything');
  const adapter = createRemoteSandbox({ url:'https://worker.example.test', token:'b'.repeat(40), fetchImpl:async () => { throw new Error('offline'); } });
  try {
    assert.equal((await adapter.getStatus()).status, 'unavailable');
    assert.equal((await adapter.run({ fileRef:file })).status, 'unavailable');
    assert.match((await adapter.run({ fileRef:file })).message, /static analysis results are preserved/);
  } finally { fs.rmSync(file, { force:true }); }
});

test('remote adapter refuses non-HTTPS endpoints except loopback development URLs', async () => {
  const remoteHttp = createRemoteSandbox({ url:'http://worker.example.test', token:'c'.repeat(40) });
  const localHttp = createRemoteSandbox({ url:'http://127.0.0.1:4100', token:'c'.repeat(40) });
  assert.equal((await remoteHttp.getStatus()).status, 'unavailable');
  assert.equal((await localHttp.getStatus()).status, 'unavailable');
});

test('orchestrator keeps static analysis results when the remote worker is unavailable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tnf-remote-fallback-'));
  try {
    const dataDir = path.join(root, 'data'), storageDir = path.join(root, 'storage');
    fs.mkdirSync(storageDir);
    const filePath = path.join(storageDir, 'sample.bin');
    fs.copyFileSync('/bin/true', filePath);
    const fileRepo = await createLocalFileRepository(dataDir), analysisRepo = await createLocalAnalysisRepository(dataDir);
    const file = { id:randomUUID(), storedName:'sample.bin', originalName:'sample.bin', size:fs.statSync(filePath).size,
      detected:{ format:'elf', mime:'application/x-elf' }, sha256:'a'.repeat(64), uploadedAt:new Date().toISOString(), fileDeleted:false };
    await fileRepo.create(file);
    const modules = ['identification', 'hashing', 'metadata', 'strings', 'entropy'].map((module) => ({ module, status:'completed' }));
    const worker = createRemoteSandbox({ url:'https://worker.example.test', token:'d'.repeat(40), fetchImpl:async () => { throw new Error('offline'); } });
    const jobs = createInProcessJobManager();
    const orchestrator = createOrchestrator({ fileRepo, analysisRepo, jobs, runStatic:async () => ({ modules, findings:[], summary:{ completed:5, skipped:0, unavailable:0, failed:0, timeout:0 } }),
      integrations:{ sandbox:worker, storage:{ materialize:async () => ({ filePath, cleanup:async () => {} }) } } });
    const { analysis } = await orchestrator.start(file.id);
    await jobs.onIdle();
    const result = await analysisRepo.getById(analysis.id);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.report.behavioral.status, 'unavailable');
    assert.equal(result.report.staticAnalysis.summary.completed, 5);
  } finally { fs.rmSync(root, { recursive:true, force:true }); }
});
