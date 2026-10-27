import { identificationModule } from './identification-module.js';
import { hashingModule } from './hashing-module.js';
import { metadataModule } from './metadata.js';
import { stringsModule } from './strings.js';
import { entropyModule } from './entropy.js';
import { archiveModule } from './archive-inspection.js';
import { signatureModule } from './signature-verification.js';
import { yaraModule } from './yara-scanner.js';
import { validateModuleEvidence } from '../schemas/evidence.schema.js';
import { config } from '../config/env.js';

export const DEFAULT_MODULES = [
  { name: 'identification', run: identificationModule }, { name: 'hashing', run: hashingModule },
  { name: 'metadata', run: metadataModule }, { name: 'strings', run: stringsModule },
  { name: 'entropy', run: entropyModule }, { name: 'archive', run: archiveModule },
  { name: 'signature', run: signatureModule }, { name: 'yara', run: yaraModule },
];

// Runs an analysis module and captures its result.
async function runModule(mod, ctx, timeoutMs) {
  const start = Date.now();
  let timer;
  const base = { module: mod.name, data: {}, findings: [], errors: [] };
  try {
    const result = await Promise.race([
      mod.run(ctx),
      new Promise(/* Handles the callback for this operation. */ (_, rej) => { timer = setTimeout(/* Runs the scheduled callback. */ () => rej(Object.assign(new Error('Module timed out'), { timeout: true })), timeoutMs); }),
    ]);
    const ev = { ...base, errors: [], ...result, module: mod.name, durationMs: Date.now() - start };
    const problems = validateModuleEvidence(ev);
    if (problems.length) return { ...base, status: 'failed', errors: ['Invalid module output: ' + problems.join('; ')], durationMs: Date.now() - start };
    return ev;
  } catch (err) {
    return { ...base, status: err.timeout ? 'timeout' : 'failed', errors: [String(err.message).slice(0, 300)], durationMs: Date.now() - start };
  } finally { clearTimeout(timer); }
}

// Runs the static file analysis modules.
export async function runStaticAnalysis(ctx, { modules = DEFAULT_MODULES, timeoutMs = config.moduleTimeoutMs } = {}) {
  const results = await Promise.all(modules.map(/* Transforms each item in the collection. */ (m) => runModule(m, ctx, timeoutMs)));

  // Counts matching records.
  const count = (s) => results.filter(/* Keeps items that match the condition. */ (r) => r.status === s).length;
  return {
    modules: results,
    findings: results.flatMap(/* Handles the callback for this operation. */ (r) => r.findings.map(/* Transforms each item in the collection. */ (f) => ({ ...f, module: r.module }))),
    summary: { completed: count('completed'), skipped: count('skipped'), unavailable: count('unavailable'), failed: count('failed'), timeout: count('timeout') },
  };
}
