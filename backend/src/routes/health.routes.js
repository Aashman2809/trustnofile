import { Router } from 'express';
import { config } from '../config/env.js';
import { SUPPORTED_CATEGORIES } from '../config/limits.js';
import { yaraAvailability } from '../analysis/yara-scanner.js';

// Creates health router.
export function createHealthRouter({ integrations, persistence = 'local_json_development_store', databaseStatus =/* Handles the callback for this operation. */ () => integrations.database.getStatus() }) {
  const r = Router();
  r.get('/health/live', (_q, res) => res.json({ status: 'ok' }));
  r.get('/health/ready', async (_q, res) => {
    const checks = await Promise.allSettled([databaseStatus(), integrations.storage?.getStatus?.() || Promise.resolve({ status: 'available' }), integrations.jobs?.getStatus?.() || Promise.resolve({ status: 'available' })]);
    const required = config.deploymentMode === 'aws' || config.requireDatabase || config.requireStorage;
    const ready = !required || checks.every((check) => check.status === 'fulfilled' && check.value?.status === 'available');
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  });
  r.get('/health',/* Handles the response for this request. */ (_q, res) => res.json({ status: 'ok', version: config.version, time: new Date().toISOString() }));
  r.get('/config/capabilities',/* Handles the response for this request. */ async (_q, res) => {
    const yara = await yaraAvailability();
    const [database, llm, sandbox, storage] = await Promise.allSettled([databaseStatus(), integrations.llm.getStatus(), integrations.sandbox.getStatus(), integrations.storage?.getStatus?.() || Promise.resolve({ status: 'unavailable' })]);
    res.json({
      version: config.version,
      upload: { maxMb: config.maxUploadMb, categories: SUPPORTED_CATEGORIES, enabled: true },
      persistence,
      modules: { staticAnalysis: 'available', yara: yara.available ? `available (${yara.version})` : 'unavailable' },
      integrations: {
        database: database.status === 'fulfilled' ? database.value : { status: 'unavailable', active: persistence },
        llm: llm.status === 'fulfilled' ? llm.value : { status: 'unavailable' },
        sandbox: sandbox.status === 'fulfilled' ? sandbox.value : { status: 'unavailable' },
        storage: storage.status === 'fulfilled' ? storage.value : { status: 'unavailable' },
      },
    });
  });
  return r;
}
