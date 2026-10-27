import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createSandboxWorkerServer } from '../src/sandbox-worker/server.js';

const token = 'sandbox-test-token-that-is-at-least-32-bytes';
const elf = await fs.readFile('/bin/true');

async function withWorker(sandbox, fn, maxFileBytes = 48 * 1024 * 1024) {
  const server = createSandboxWorkerServer({ sandbox, token, maxFileBytes });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(`http://127.0.0.1:${port}`); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('worker rejects unauthenticated and oversized requests before sandbox execution', async () => {
  let ran = 0;
  const sandbox = { getStatus:async () => ({ status:'available' }), run:async () => { ran++; return { status:'completed' }; } };
  await withWorker(sandbox, async (url) => {
    const denied = await fetch(`${url}/v1/analyze`, { method:'POST', headers:{ 'content-type':'application/octet-stream' }, body:elf });
    assert.equal(denied.status, 401);
    const oversized = await fetch(`${url}/v1/analyze`, { method:'POST', headers:{ authorization:`Bearer ${token}`, 'content-type':'application/octet-stream' }, body:Buffer.alloc(129) });
    assert.equal(oversized.status, 413);
    assert.equal(ran, 0);
  }, 128);
});

test('worker rejects unbounded chunked uploads that omit Content-Length', async () => {
  const sandbox = { getStatus:async () => ({ status:'available' }), run:async () => assert.fail('must not execute') };
  await withWorker(sandbox, async (url) => {
    const { port } = new URL(url);
    const status = await new Promise((resolve, reject) => {
      const request = http.request({ hostname:'127.0.0.1', port, path:'/v1/analyze', method:'POST',
        headers:{ authorization:`Bearer ${token}`, 'content-type':'application/octet-stream', 'transfer-encoding':'chunked' } }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject);
      request.end(elf);
    });
    assert.equal(status, 411);
  });
});

test('worker stages, validates, hashes, delegates, and cleans the uploaded ELF', async () => {
  let sandboxPath;
  const sandbox = {
    getStatus:async () => ({ status:'available' }),
    run:async ({ fileRef, timeoutMs }) => {
      sandboxPath = fileRef;
      assert.equal(timeoutMs, 30000);
      assert.deepEqual(await fs.readFile(fileRef), elf);
      return { status:'completed', message:'bounded', behavioralEvidence:{ events:[{ type:'process_created', detail:'runner' }, { type:'private_host_data', detail:'/home/user' }], exitCode:0, stdout:'ok' }, logs:['omit logs'], artifacts:[{ name:'omit' }] };
    },
  };
  await withWorker(sandbox, async (url) => {
    const response = await fetch(`${url}/v1/analyze`, { method:'POST', headers:{ authorization:`Bearer ${token}`, 'content-type':'application/octet-stream' }, body:elf });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('x-sandbox-job-id'), /^[0-9a-f-]{36}$/);
    const result = await response.json();
    assert.match(result.jobId, /^[0-9a-f-]{36}$/);
    assert.equal(result.sha256, createHash('sha256').update(elf).digest('hex'));
    assert.deepEqual(result.behavioralEvidence.events, [{ type:'process_created', detail:'runner' }]);
    assert.deepEqual(result.logs, []);
    assert.deepEqual(result.artifacts, []);
    assert.equal(JSON.stringify(result).includes('/home/user'), false);
  });
  await assert.rejects(fs.stat(sandboxPath), { code:'ENOENT' });
});

test('worker maps a runner timeout to bounded response and cleans the staged file', async () => {
  let sandboxPath;
  const sandbox = { getStatus:async () => ({ status:'available' }), run:async ({ fileRef }) => {
    sandboxPath = fileRef;
    return { status:'timeout', message:'fixed timeout message', behavioralEvidence:{ events:[], exitCode:124 }, logs:[], artifacts:[] };
  } };
  await withWorker(sandbox, async (url) => {
    const response = await fetch(`${url}/v1/analyze`, { method:'POST', headers:{ authorization:`Bearer ${token}`, 'content-type':'application/octet-stream' }, body:elf });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'timeout');
  });
  await assert.rejects(fs.stat(sandboxPath), { code:'ENOENT' });
});

test('worker reports Docker/image unavailability without invoking the runner', async () => {
  let ran = false;
  const sandbox = { getStatus:async () => ({ status:'unavailable' }), run:async () => { ran = true; } };
  await withWorker(sandbox, async (url) => {
    const status = await fetch(`${url}/v1/status`, { headers:{ authorization:`Bearer ${token}` } });
    assert.equal(status.status, 503);
    const response = await fetch(`${url}/v1/analyze`, { method:'POST', headers:{ authorization:`Bearer ${token}`, 'content-type':'application/octet-stream' }, body:elf });
    assert.equal(response.status, 503);
    assert.equal(ran, false);
  });
});
