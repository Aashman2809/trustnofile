import { BatchClient, DescribeJobsCommand, DescribeJobQueuesCommand, SubmitJobCommand, TerminateJobCommand } from '@aws-sdk/client-batch';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { config } from '../../config/env.js';
import { boundedSandboxResult } from './sandbox.result.js';
import { identifyFile } from '../../analysis/file-identification.js';

const MAX_FILE_BYTES = 48 * 1024 * 1024;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createBatchSandbox({ storage, client = null, sleep = pause, jobQueue = config.batchJobQueue, jobDefinition = config.batchJobDefinition, timeoutMs = config.sandboxTimeoutMs } = {}) {
  if (!storage?.putSandboxInput || !storage?.getSandboxResult || !storage?.createPresignedDownload || !storage?.createPresignedUpload) {
    throw new Error('Batch sandbox requires an S3 storage adapter with sandbox job methods.');
  }
  if (!jobQueue || !jobDefinition) throw new Error('Batch sandbox requires SANDBOX_BATCH_JOB_QUEUE and SANDBOX_BATCH_JOB_DEFINITION.');
  const batch = client || new BatchClient({ region: config.awsRegion });

  return {
    async getStatus() {
      try {
        const result = await batch.send(new DescribeJobQueuesCommand({ jobQueues: [jobQueue] }));
        const queue = result.jobQueues?.[0];
        return queue?.status === 'VALID' && queue.state === 'ENABLED'
          ? { status: 'available', provider: 'aws_batch', executionScope: 'isolated_fargate_job' }
          : { status: 'unavailable', provider: 'aws_batch', reason: 'batch_queue_unavailable' };
      } catch { return { status: 'unavailable', provider: 'aws_batch', reason: 'batch_queue_unavailable' }; }
    },
    async run({ fileRef, timeoutMs: requestedTimeout = timeoutMs } = {}) {
      const detected = await identifyFile(fileRef);
      if (detected.format !== 'elf') return unavailable('Configured Batch sandbox executes Linux ELF files only; no execution was attempted.');
      const info = await stat(fileRef);
      if (!info.size || info.size > MAX_FILE_BYTES) return unavailable('Sandbox input is outside the supported size range; no execution was attempted.');
      const id = randomUUID();
      const inputKey = `${id}.bin`, resultKey = `${id}.bin`;
      const maxRuntime = Math.max(1000, Math.min(Number(requestedTimeout) || timeoutMs, 60000));
      let submittedJobId = null, terminal = false;
      try {
        await storage.putSandboxInput(fileRef, inputKey);
        const [inputUrl, resultUrl] = await Promise.all([storage.createPresignedDownload(inputKey, 900), storage.createPresignedUpload(resultKey, 900)]);
        const submitted = await batch.send(new SubmitJobCommand({
          jobName: `trustnofile-${id.slice(0, 8)}`,
          jobQueue,
          jobDefinition,
          timeout: { attemptDurationSeconds: Math.ceil(maxRuntime / 1000) + 45 },
          containerOverrides: { environment: [
            { name: 'TNF_INPUT_URL', value: inputUrl },
            { name: 'TNF_RESULT_URL', value: resultUrl },
            { name: 'TNF_JOB_ID', value: id },
            { name: 'TNF_EXECUTION_TIMEOUT_MS', value: String(maxRuntime) },
          ] },
        }));
        if (!submitted.jobId) throw new Error('AWS Batch did not return a job ID.');
        submittedJobId = submitted.jobId;
        const deadline = Date.now() + maxRuntime + 180000;
        while (Date.now() < deadline) {
          const response = await batch.send(new DescribeJobsCommand({ jobs: [submitted.jobId] }));
          const job = response.jobs?.[0];
          if (!job) throw new Error('AWS Batch job could not be found.');
          if (job.status === 'SUCCEEDED') { terminal = true; return boundedSandboxResult(await storage.getSandboxResult(resultKey)); }
          if (job.status === 'FAILED') { terminal = true; return { status: 'failed', message: 'The isolated Batch sandbox job failed.', behavioralEvidence: null, logs: [], artifacts: [] }; }
          await sleep(1500);
        }
        return { status: 'timeout', message: 'The isolated Batch sandbox job exceeded its execution deadline.', behavioralEvidence: null, logs: [], artifacts: [] };
      } catch {
        return unavailable('AWS Batch sandbox is unavailable; static analysis results are preserved.');
      } finally {
        if (submittedJobId && !terminal) await batch.send(new TerminateJobCommand({ jobId: submittedJobId, reason: 'Sandbox result deadline exceeded.' })).catch(() => {});
        await Promise.allSettled([storage.deleteSandboxObject('sandbox-input', inputKey), storage.deleteSandboxObject('sandbox-results', resultKey)]);
      }
    },
  };
}

function unavailable(message) { return { status: 'unavailable', message, behavioralEvidence: null, logs: [], artifacts: [] }; }
