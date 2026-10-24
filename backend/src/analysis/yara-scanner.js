import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
const run = promisify(execFile);

export async function yaraAvailability() {
  try { const { stdout } = await run(config.yaraPath, ['--version'], { timeout: 5000, windowsHide: true }); return { available: true, version: stdout.trim() }; }
  catch { return { available: false, version: null }; }
}

// No shell: execFile with an argument array. Rules come only from the configured directory.
export async function yaraModule({ filePath }) {
  const av = await yaraAvailability();
  if (!av.available) return { status: 'unavailable', reason: 'YARA executable not found. This is NOT a clean scan.', data: { available: false }, findings: [] };
  let rules = [];
  try { rules = (await fs.readdir(config.yaraRulesDir)).filter((n) => /\.(yar|yara)$/i.test(n)).slice(0, 20); } catch { /* none */ }
  if (!rules.length) return { status: 'skipped', reason: 'No YARA rule files configured.', data: { available: true, version: av.version, ruleFiles: 0 }, findings: [] };
  const findings = [], errors = [];
  for (const r of rules) {
    try {
      const { stdout } = await run(config.yaraPath, ['-w', path.join(config.yaraRulesDir, r), filePath], { timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true });
      for (const line of stdout.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 50)) {
        const rule = line.split(/\s+/)[0].replace(/[^\w.-]/g, '').slice(0, 100);
        findings.push({ code: 'YARA_MATCH', title: `YARA rule matched: ${rule}`, severity: 'medium', kind: 'observed',
          description: 'A configured YARA rule matched. Rule severity depends on the rule set; review the rule.', evidence: { rule, ruleFile: r } });
      }
    } catch (e) { errors.push(`${r}: ${String(e.message).split('\n')[0].slice(0, 200)}`); }
  }
  return { status: errors.length === rules.length ? 'failed' : 'completed', data: { available: true, version: av.version, ruleFiles: rules.length }, findings, errors };
}
