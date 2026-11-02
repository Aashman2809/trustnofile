import { setTimeout as delay } from 'node:timers/promises';
import { createIntegrations } from './integrations/index.js';
import { config, validateRuntimeConfig } from './config/env.js';
import { createOrchestrator } from './services/analysis-orchestrator.service.js';
import { log } from './utils/logger.js';
import { fileURLToPath } from 'node:url';

export async function createAnalysisWorker({ integrations = createIntegrations(), pollDelayMs = 1000 } = {}) {
  validateRuntimeConfig();
  if (!integrations.jobs?.receive || !integrations.jobs?.acknowledge) throw new Error('Analysis worker requires the SQS queue provider.');
  const database = await integrations.database.getStatus();
  if (database.status !== 'connected') throw new Error('Analysis worker requires PostgreSQL.');
  const { fileRepo, analysisRepo } = await integrations.database.createRepositories();
  const orchestrator = createOrchestrator({ fileRepo, analysisRepo, jobs: integrations.jobs, integrations });
  let stopping = false;
  return {
    async stop() { stopping = true; },
    async run() {
      try { while (!stopping) {
        try {
          const messages = await integrations.jobs.receive();
          for (const message of messages) {
            let job;
            try { job = JSON.parse(message.body); } catch {
              log('error', 'analysis_job_invalid', { operation: 'consume', category: 'invalid_json' });
              await integrations.jobs.acknowledge(message.receiptHandle);
              continue;
            }
            if (job?.version !== 1 || !isUuid(job.analysisId) || !isUuid(job.fileId)) {
              log('error', 'analysis_job_invalid', { operation: 'consume', category: 'invalid_payload' });
              await integrations.jobs.acknowledge(message.receiptHandle);
              continue;
            }
            const visibilityHeartbeat = setInterval(() => {
              void integrations.jobs.extendVisibility(message.receiptHandle, 900).catch((error) => log('error', 'analysis_visibility_renewal_failed', { analysisId: job.analysisId, operation: 'extend_visibility', category: error?.name || 'queue_error' }));
            }, 60_000);
            try {
              const analysis = await analysisRepo.getById(job.analysisId);
              if (!analysis || analysis.fileId !== job.fileId) {
                await integrations.jobs.acknowledge(message.receiptHandle);
                continue;
              }
              const result = await orchestrator.processJob(job.analysisId, { onClaimed: () => analysisRepo.renewJobClaim?.(job.analysisId) });
              if (result.outcome !== 'claimed_elsewhere') await integrations.jobs.acknowledge(message.receiptHandle);
              log('info', 'analysis_job_processed', { analysisId: job.analysisId, fileId: job.fileId, operation: 'consume', status: result.outcome });
            } catch (error) {
              log('error', 'analysis_job_failed', { analysisId: job.analysisId, fileId: job.fileId, operation: 'consume', category: error?.code || 'processing_error' });
            } finally { clearInterval(visibilityHeartbeat); }
          }
        } catch (error) {
          log('error', 'analysis_queue_poll_failed', { operation: 'receive', category: error?.name || 'queue_error' });
          await delay(pollDelayMs);
        }
      } } finally { await integrations.database.close?.(); }
    },
  };
}

function isUuid(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (config.deploymentMode !== 'aws') throw new Error('The standalone analysis worker requires DEPLOYMENT_MODE=aws.');
  const worker = await createAnalysisWorker();
  process.once('SIGTERM', () => { void worker.stop(); });
  process.once('SIGINT', () => { void worker.stop(); });
  await worker.run();
}
