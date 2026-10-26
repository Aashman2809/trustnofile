import { Router } from 'express';
import { config } from '../config/env.js';
import { SUPPORTED_CATEGORIES } from '../config/limits.js';
import { yaraAvailability } from '../analysis/yara-scanner.js';

export function createHealthRouter({ integrations, persistence = 'local_json_development_store', databaseStatus = () => integrations.database.getStatus() }) {
  const r = Router();
  r.get('/health', (_q, res) => res.json({ status: 'ok', version: config.version, time: new Date().toISOString() }));
  r.get('/config/capabilities', async (_q, res) => {
    const yara = await yaraAvailability();
    const [database, llm, sandbox] = await Promise.allSettled([databaseStatus(), integrations.llm.getStatus(), integrations.sandbox.getStatus()]);
    res.json({
      version: config.version,
      upload: { maxMb: config.maxUploadMb, categories: SUPPORTED_CATEGORIES, enabled: true },
      persistence,
      modules: { staticAnalysis: 'available', yara: yara.available ? `available (${yara.version})` : 'unavailable' },
      integrations: {
        database: database.status === 'fulfilled' ? database.value : { status: 'unavailable', active: persistence },
        llm: llm.status === 'fulfilled' ? llm.value : { status: 'unavailable' },
        sandbox: sandbox.status === 'fulfilled' ? sandbox.value : { status: 'unavailable' },
      },
    });
  });
  return r;
}
