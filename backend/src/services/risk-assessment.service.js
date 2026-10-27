import { riskConfig } from '../config/risk.js';
const CORE = ['identification', 'hashing', 'metadata', 'strings', 'entropy'];
const SEV = { high: 3, medium: 2, low: 1, info: 0 };
export const RISK_LEVELS = ['low', 'moderate', 'high', 'very_high', 'insufficient_evidence'];

// Determines for.
export const levelFor = (score, t) => (score >= t.veryHigh ? 'very_high' : score >= t.high ? 'high' : score >= t.moderate ? 'moderate' : 'low');

// Calculates the file risk assessment.
export function assessRisk({ findings = [], modules = [], file = {} }, cfg = riskConfig) {
  const byName = Object.fromEntries(modules.map(/* Transforms each item in the collection. */ (m) => [m.module, m]));
  const limitations = [
    'Behavioral (sandbox) analysis was not performed; static analysis cannot observe runtime behavior.',
    'LLM-assisted interpretation was not performed.',
    'The score is an application-defined heuristic, not a calibrated malware probability.',
  ];
  for (const m of modules) {
    if ((['unavailable', 'failed', 'timeout'].includes(m.status) && !(m.module === 'signature' && m.status === 'unavailable' && file.detected?.format !== 'exe')) || (m.status === 'skipped' && m.module === 'yara')) {
      const detail = String(m.reason || m.errors?.[0] || '').replace(/[.\s]+$/, '');
      limitations.push(`Module "${m.module}" ${m.status}${detail ? ` (${detail})` : ''}.`);
    }
  }
  const degraded = modules.some(/* Checks whether the item meets the condition. */ (m) => ['failed', 'timeout'].includes(m.status));
  const coreDone = CORE.filter(/* Keeps items that match the condition. */ (n) => byName[n]?.status === 'completed').length;
  if (coreDone < cfg.minCoreModules) {
    return { riskScore: null, riskLevel: 'insufficient_evidence', confidence: 'low', evidenceSufficiency: 'insufficient', noIndicatorsDetected: false,
      reasons: [], limitations: [...limitations, 'Too few core analysis modules completed to produce a meaningful score.'], sandboxRecommended: true, thresholds: cfg.thresholds };
  }
  const seen = new Set(), reasons = [];
  let total = 0;
  for (const f of [...findings].sort(/* Compares two items for sorting. */ (a, b) => SEV[b.severity] - SEV[a.severity])) {
    if (seen.has(f.code)) continue;
    seen.add(f.code);
    const points = cfg.codeWeights[f.code] ?? cfg.severityWeights[f.severity] ?? 0;
    if (points > 0) { total += points; reasons.push({ code: f.code, title: f.title, module: f.module ?? null, severity: f.severity, kind: f.kind, points }); }
  }
  const mods = new Set(reasons.map(/* Transforms each item in the collection. */ (r) => r.module));
  if (reasons.length >= cfg.correlation.minFindings && mods.size >= cfg.correlation.minModules) {
    total += cfg.correlation.bonus;
    reasons.push({ code: 'CORRELATED_INDICATORS', title: 'Several indicators from different modules', module: null, severity: 'info', kind: 'heuristic', points: cfg.correlation.bonus });
  }
  const riskScore = Math.min(100, Math.round(total));
  const riskLevel = levelFor(riskScore, cfg.thresholds);
  const noIndicatorsDetected = reasons.length === 0;
  if (noIndicatorsDetected) limitations.push('No suspicious indicators were detected by the available modules. This does not mean the file is safe.');
  return {
    riskScore, riskLevel, confidence: degraded ? 'low' : 'limited', evidenceSufficiency: 'partial', noIndicatorsDetected, reasons, limitations,
    sandboxRecommended: riskLevel !== 'low' || ['exe', 'elf'].includes(file.detected?.format) || degraded, thresholds: cfg.thresholds,
  };
}
