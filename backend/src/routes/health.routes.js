import { Router } from 'express';
import { config } from '../config/env.js';
import { SUPPORTED_CATEGORIES } from '../config/limits.js';
import { yaraAvailability } from '../analysis/yara-scanner.js';
const r = Router();
r.get('/health', (_q, res) => res.json({ status: 'ok', version: config.version, time: new Date().toISOString() }));
r.get('/config/capabilities', async (_q, res) => {
  const yara = await yaraAvailability();
  res.json({
    version: config.version,
    upload: { maxMb: config.maxUploadMb, categories: SUPPORTED_CATEGORIES, enabled: true },
    persistence: 'local_json_development_store',
    modules: { staticAnalysis: 'available (run via CLI until Milestone 4)', yara: yara.available ? `available (${yara.version})` : 'unavailable' },
    integrations: { database: { status: 'not_configured' }, llm: { status: 'not_configured' }, sandbox: { status: 'unavailable' } },
  });
});
export default r;
