export const STATES = ['UPLOADED', 'VALIDATING', 'STATIC_ANALYSIS', 'AGGREGATING_EVIDENCE', 'ASSESSING_RISK', 'GENERATING_REPORT', 'COMPLETED', 'PARTIAL', 'FAILED', 'REJECTED'];
export const TERMINAL = ['COMPLETED', 'PARTIAL', 'FAILED', 'REJECTED'];
export const TRANSITIONS = {
  UPLOADED: ['VALIDATING', 'FAILED'],
  VALIDATING: ['STATIC_ANALYSIS', 'REJECTED', 'FAILED'],
  STATIC_ANALYSIS: ['AGGREGATING_EVIDENCE', 'FAILED'],
  AGGREGATING_EVIDENCE: ['ASSESSING_RISK', 'FAILED'],
  ASSESSING_RISK: ['GENERATING_REPORT', 'FAILED'],
  GENERATING_REPORT: ['COMPLETED', 'PARTIAL', 'FAILED'],
};
export const canTransition = (from, to) => TRANSITIONS[from]?.includes(to) ?? false;

export const STAGES = ['upload', 'validation', 'static_analysis', 'evidence_aggregation', 'risk_assessment', 'report_generation'];
const STATE_STAGE = { VALIDATING: 'validation', STATIC_ANALYSIS: 'static_analysis', AGGREGATING_EVIDENCE: 'evidence_aggregation', ASSESSING_RISK: 'risk_assessment', GENERATING_REPORT: 'report_generation' };
// stage status: pending | active | completed | skipped | failed
export const initialStages = (now) => STAGES.map((name, i) => ({ name, status: i === 0 ? 'completed' : 'pending', startedAt: i === 0 ? now : null, finishedAt: i === 0 ? now : null, note: null }));

export function applyTransition(stages, to, now, note = null) {
  const s = stages.map((x) => ({ ...x }));
  const active = s.find((x) => x.status === 'active');
  if (TERMINAL.includes(to)) {
    const bad = to === 'FAILED' || to === 'REJECTED';
    if (active) Object.assign(active, { status: bad ? 'failed' : 'completed', finishedAt: now, note });
    for (const x of s) if (x.status === 'pending') Object.assign(x, { status: 'skipped', note: bad ? 'Not run because an earlier stage did not succeed.' : null });
    return s;
  }
  if (active) Object.assign(active, { status: 'completed', finishedAt: now });
  const next = s.find((x) => x.name === STATE_STAGE[to]);
  if (next) Object.assign(next, { status: 'active', startedAt: now });
  return s;
}
