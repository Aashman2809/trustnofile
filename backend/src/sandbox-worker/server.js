import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../config/env.js';
import { createDockerSandbox } from '../integrations/sandbox/sandbox.docker.js';
import { boundedSandboxResult } from '../integrations/sandbox/sandbox.result.js';
import { identifyFile } from '../analysis/file-identification.js';

const MAX_FILE_BYTES = 48 * 1024 * 1024;
const TOKEN = process.env.SANDBOX_WORKER_TOKEN || '';
const PORT = config.sandboxWorkerPort;
const sandbox = createDockerSandbox({ image: 'trustnofile-runner:local' });

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data), 'cache-control': 'no-store' });
  res.end(data);
}

function reject(req, res, status, body) {
  res.shouldKeepAlive = false;
  res.once('finish', () => req.destroy());
  return send(res, status, body);
}

export function createSandboxWorkerServer({ sandbox: sandboxAdapter = sandbox, token = TOKEN, maxFileBytes = MAX_FILE_BYTES } = {}) {
  if (Buffer.byteLength(token) < 32) throw new Error('SANDBOX_WORKER_TOKEN must contain at least 32 bytes.');
  let active = false;
  const server = http.createServer(async (req, res) => {
    const supplied = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reject(req, res, 401, { error: 'unauthorized' });
    if (req.method === 'GET' && req.url === '/v1/status') {
      const status = await sandboxAdapter.getStatus();
      return send(res, status.status === 'available' ? 200 : 503, { status: status.status });
    }
    if (req.method !== 'POST' || req.url !== '/v1/analyze') return reject(req, res, 404, { error: 'not_found' });
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/octet-stream') return reject(req, res, 415, { error: 'unsupported_media_type' });
    if (!/^\d+$/.test(req.headers['content-length'] || '')) return reject(req, res, 411, { error: 'content_length_required' });
    if (active) return reject(req, res, 503, { error: 'worker_busy' });
    if (Number(req.headers['content-length']) > maxFileBytes) return reject(req, res, 413, { error: 'file_too_large' });

    active = true;
    const jobId = randomUUID();
    let root;
    const respond = async (status, body, closeRequest = false) => {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
      root = null;
      return closeRequest ? reject(req, res, status, body) : send(res, status, body);
    };
    try {
      root = await fs.mkdtemp(path.join(os.tmpdir(), 'trustnofile-worker-'));
      const filePath = path.join(root, 'payload.bin');
      const file = await fs.open(filePath, 'wx', 0o600);
      const hash = createHash('sha256');
      let size = 0;
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxFileBytes) throw Object.assign(new Error('too_large'), { statusCode: 413 });
          hash.update(chunk);
          await file.write(chunk);
        }
      } finally { await file.close(); }
      if (!size) return await respond(400, { error: 'empty_file' });
      await fs.chmod(filePath, 0o400);
      const detected = await identifyFile(filePath);
      if (detected.format !== 'elf') return await respond(415, { error: 'unsupported_file_type' });
      const timeoutMs = config.sandboxTimeoutMs;
      const status = await sandboxAdapter.getStatus();
      if (status.status !== 'available') return await respond(503, { error: 'sandbox_unavailable' });
      const result = boundedSandboxResult(await sandboxAdapter.run({ fileRef: filePath, timeoutMs }));
      res.setHeader('x-sandbox-job-id', jobId);
      return await respond(200, { ...result, jobId, sha256: hash.digest('hex') });
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      if (error.statusCode === 413) {
        return await respond(413, { error: 'file_too_large' }, true);
      }
      return await respond(500, { error: 'sandbox_job_failed' });
    } finally {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {});
      active = false;
    }
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createSandboxWorkerServer();
  server.requestTimeout = 5 * 60_000;
  server.headersTimeout = 30_000;
  server.listen(PORT, '127.0.0.1', () => console.log(`TrustNoFile sandbox worker listening on 127.0.0.1:${PORT}`));
}
