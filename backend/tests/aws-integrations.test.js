import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createS3ObjectStorage } from '../src/integrations/storage/storage.s3.js';
import { createSqsJobQueue } from '../src/integrations/jobs/jobs.sqs.js';
import { createBatchSandbox } from '../src/integrations/sandbox/sandbox.batch.js';
import { createAnalysisWorker } from '../src/worker.js';
import { createPostgresAdapter } from '../src/integrations/database/postgres.adapter.js';

test('S3 adapter uses fixed prefixes and rejects path-like keys', async () => {
  const calls = [];
  const client = { async send(command) {
    calls.push(command);
    if (command.constructor.name === 'GetObjectCommand') return { Body: Readable.from(['payload']) };
    return {};
  } };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tnf-s3-test-'));
  const source = path.join(dir, 'source.bin');
  await fs.writeFile(source, 'payload');
  const key = '123e4567-e89b-42d3-a456-426614174000.bin';
  try {
    const storage = createS3ObjectStorage({ bucket: 'test-bucket', region: 'us-east-1', client });
    await storage.put(source, key);
    const materialized = await storage.materialize(key);
    assert.equal(await fs.readFile(materialized.filePath, 'utf8'), 'payload');
    await materialized.cleanup();
    await storage.delete(key);
    await assert.rejects(storage.delete('../payload.bin'), /Invalid storage object key/);
    assert.equal(calls[0].input.Key, `uploads/${key}`);
    assert.equal(calls.at(-1).input.Key, `uploads/${key}`);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('SQS adapter publishes versioned payloads and consumes/acknowledges messages', async () => {
  const calls = [];
  const client = { async send(command) {
    calls.push(command);
    if (command.constructor.name === 'ReceiveMessageCommand') return { Messages: [{ ReceiptHandle: 'receipt', Body: '{"version":1}' }] };
    return {};
  } };
  const queue = createSqsJobQueue({ queueUrl: 'https://sqs.us-east-1.amazonaws.com/000000000000/test', region: 'us-east-1', client });
  await queue.enqueue({ analysisId: 'a', fileId: 'b' });
  assert.deepEqual(JSON.parse(calls[0].input.MessageBody), { version: 1, analysisId: 'a', fileId: 'b' });
  assert.equal((await queue.receive())[0].receiptHandle, 'receipt');
  await queue.acknowledge('receipt');
  assert.equal(calls[2].constructor.name, 'DeleteMessageCommand');
});

test('Batch sandbox rejects non-ELF input and returns bounded successful results', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tnf-batch-test-'));
  const filePath = path.join(dir, 'sample.bin');
  const calls = [];
  const client = { async send(command) {
    calls.push(command);
    if (command.constructor.name === 'DescribeJobQueuesCommand') return { jobQueues: [{ status: 'VALID', state: 'ENABLED' }] };
    if (command.constructor.name === 'SubmitJobCommand') return { jobId: 'job-1' };
    if (command.constructor.name === 'DescribeJobsCommand') return { jobs: [{ status: 'SUCCEEDED' }] };
    return {};
  } };
  const result = { status: 'completed', behavioralEvidence: { events: [{ type: 'process_created', detail: 'ok' }, { type: 'ignored' }], exitCode: 0 }, logs: [], artifacts: [] };
  const storage = { async putSandboxInput() {}, async createPresignedDownload() { return 'https://s3.invalid/in'; }, async createPresignedUpload() { return 'https://s3.invalid/out'; }, async getSandboxResult() { return result; }, async deleteSandboxObject() {} };
  try {
    const sandbox = createBatchSandbox({ storage, client, jobQueue: 'queue', jobDefinition: 'jobdef', sleep: async () => {} });
    await fs.writeFile(filePath, Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(32)]));
    assert.equal((await sandbox.run({ fileRef: filePath })).status, 'completed');
    const submit = calls.find((command) => command.constructor.name === 'SubmitJobCommand');
    assert.equal(submit.input.containerOverrides.environment.length, 4);
    await fs.writeFile(filePath, 'not an executable');
    const previous = calls.length;
    assert.equal((await sandbox.run({ fileRef: filePath })).status, 'unavailable');
    assert.equal(calls.length, previous);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('analysis worker consumes a versioned message and acknowledges an already completed analysis', async () => {
  let worker, pollResolve;
  const acknowledgements = [];
  const analysisId = '123e4567-e89b-42d3-a456-426614174000';
  const fileId = '223e4567-e89b-42d3-a456-426614174000';
  let received = false, closed = false;
  const integrations = {
    database: {
      async getStatus() { return { status: 'connected' }; },
      async createRepositories() { return { fileRepo: {}, analysisRepo: { async getById() { return { id: analysisId, fileId, status: 'COMPLETED' }; } } }; },
      async close() { closed = true; },
    },
    jobs: {
      async receive() {
        if (!received) { received = true; return [{ receiptHandle: 'receipt', body: JSON.stringify({ version: 1, analysisId, fileId }) }]; }
        return new Promise((resolve) => { pollResolve = resolve; });
      },
      async acknowledge(receipt) { acknowledgements.push(receipt); },
      async extendVisibility() {},
    },
    storage: { async getStatus() { return { status: 'available' }; } },
    sandbox: {}, llm: {},
  };
  worker = await createAnalysisWorker({ integrations });
  const running = worker.run();
  for (let i = 0; i < 20 && !pollResolve; i++) await new Promise((resolve) => setTimeout(resolve, 2));
  await worker.stop();
  pollResolve?.([]);
  await running;
  assert.deepEqual(acknowledgements, ['receipt']);
  assert.equal(closed, true);
});

test('PostgreSQL TLS validation overrides insecure sslmode parameters in the connection URL', async () => {
  const previousTls = process.env.DATABASE_SSL;
  const previousVerify = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
  let poolOptions;
  class PoolStub {
    constructor(options) { poolOptions = options; }
    on() {}
    async query() { return { rows: [{ '?column?': 1 }] }; }
    async end() {}
  }
  try {
    process.env.DATABASE_SSL = 'true';
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
    const adapter = createPostgresAdapter({ url: 'postgresql://user:pass@example.test/db?sslmode=no-verify&application_name=tnf', PoolClass: PoolStub });
    assert.equal((await adapter.getStatus()).status, 'connected');
    assert.equal(poolOptions.ssl.rejectUnauthorized, true);
    assert.equal(new URL(poolOptions.connectionString).searchParams.has('sslmode'), false);
    assert.equal(new URL(poolOptions.connectionString).searchParams.get('application_name'), 'tnf');
  } finally {
    if (previousTls === undefined) delete process.env.DATABASE_SSL; else process.env.DATABASE_SSL = previousTls;
    if (previousVerify === undefined) delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED; else process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = previousVerify;
  }
});
