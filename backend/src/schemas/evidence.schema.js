/**
 * Module evidence contract:
 * { module, status, reason?, durationMs, data: object, findings: Finding[], errors: string[] }
 * status: completed | skipped (not applicable / not configured) | unavailable (tool missing) | failed | timeout
 * Finding: { code, title, severity: info|low|medium|high, kind: observed|heuristic, description, evidence: object }
 * "observed" = a fact read from the file. "heuristic" = an interpretation that may be benign.
 * A failed/skipped/unavailable module is NEVER a clean result.
 */
export const SEVERITIES = ['info', 'low', 'medium', 'high'];
export const STATUSES = ['completed', 'skipped', 'unavailable', 'failed', 'timeout'];
export const KINDS = ['observed', 'heuristic'];

export function validateModuleEvidence(ev) {
  const errs = [];
  if (!ev || typeof ev !== 'object') return ['Evidence is not an object'];
  if (typeof ev.module !== 'string') errs.push('module must be a string');
  if (!STATUSES.includes(ev.status)) errs.push(`invalid status: ${ev.status}`);
  if (!Array.isArray(ev.findings)) errs.push('findings must be an array');
  else ev.findings.forEach((f, i) => {
    if (!f.code || !f.title) errs.push(`finding[${i}] needs code and title`);
    if (!SEVERITIES.includes(f.severity)) errs.push(`finding[${i}] invalid severity`);
    if (!KINDS.includes(f.kind)) errs.push(`finding[${i}] invalid kind`);
  });
  if (!Array.isArray(ev.errors)) errs.push('errors must be an array');
  return errs;
}
