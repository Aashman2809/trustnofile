import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
const run = promisify(execFile);

// Checks whether YARA is available.
export async function yaraAvailability() {
  try { const { stdout } = await run(config.yaraPath, ['--version'], { timeout: 5000, windowsHide: true }); return { available: true, version: stdout.trim() }; }
  catch { return { available: false, version: null }; }
}

// Scans the file with YARA rules.
export async function yaraModule({ filePath }) {
  let sourceSet = null;
  try {
    const raw = JSON.parse(await fs.readFile(path.join(config.yaraRulesDir, 'ruleset.json'), 'utf8'));
    if (typeof raw.source === 'string' && typeof raw.package === 'string' && typeof raw.release === 'string') sourceSet = { source: raw.source, package: raw.package, release: raw.release };
  } catch {}
  const av = await yaraAvailability();
  if (!av.available) return { status: 'unavailable', reason: 'YARA executable not found; no signature scan was performed.', data: { available: false, scanComplete: false, sourceSet }, findings: [] };
  let allRuleFiles = [];
  try { allRuleFiles = (await fs.readdir(config.yaraRulesDir)).filter(/* Keeps YARA source files. */ (n) => /\.(yar|yara)$/i.test(n)).sort(); } catch {}
  const rules = allRuleFiles.slice(0, 20);
  if (!rules.length) return { status: 'skipped', reason: 'No YARA rule files are installed; the signature scan was not performed.', data: { available: true, scanComplete: false, version: av.version, ruleFiles: 0, sourceSet }, findings: [] };
  const findings = [], errors = [];
  let stdout = '';
  try {
    const args = ['-w', ...rules.map(/* Assigns each rule file its own YARA namespace. */ (r, i) => `local${i}:${path.join(config.yaraRulesDir, r)}`), filePath];
    try { ({ stdout } = await run(config.yaraPath, args, { timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })); }
    catch (e) {
      if (e.code === 1) stdout = e.stdout || '';
      else throw e;
    }
    for (const line of stdout.split('\n').map(/* Trims YARA output lines. */ (l) => l.trim()).filter(Boolean).slice(0, 200)) {
      const identity = line.split(/\s+/)[0];
      const separator = identity.indexOf(':');
      const namespace = separator > 0 ? identity.slice(0, separator).replace(/[^\w.-]/g, '').slice(0, 80) : null;
      const rule = (separator > 0 ? identity.slice(separator + 1) : identity).replace(/[^\w.-]/g, '').slice(0, 100);
      findings.push({ code: 'YARA_MATCH', title: `YARA rule matched: ${rule}`, severity: 'medium', kind: 'observed',
        description: 'A configured YARA rule matched. Rule severity depends on the rule set; review the source rule.', evidence: { rule, namespace, sourceSet } });
    }
  } catch (e) { errors.push(String(e.message).split('\n')[0].slice(0, 200)); }
  const limited = allRuleFiles.length > rules.length;
  if (limited) errors.push(`Rule file limit reached: scanned ${rules.length} of ${allRuleFiles.length} files.`);
  const complete = errors.length === 0;
  return { status: complete ? 'completed' : 'failed', ...(complete ? {} : { reason: 'The YARA scan failed or was incomplete; it must not be treated as a clean scan.' }),
    data: { available: true, scanComplete: complete, version: av.version, ruleFiles: rules.length, totalRuleFiles: allRuleFiles.length, sourceSet }, findings, errors };
}
