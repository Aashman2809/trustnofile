

const LEVELS = ['low', 'moderate', 'high', 'very_high', 'insufficient_evidence'];

// Handles list.
const strList = (v, max) => Array.isArray(v) && v.length <= max && v.every(/* Checks whether the item meets the condition. */ (s) => typeof s === 'string' && s.length <= 300);

// Validates MITRE ATT&CK items
function validateMitre(items) {
  if (!Array.isArray(items) || items.length > 20) return false;
  return items.every((m) => m && typeof m === 'object'
    && typeof m.techniqueId === 'string' && /^T\d{4}(\.\d{3})?$/.test(m.techniqueId)
    && typeof m.techniqueName === 'string' && m.techniqueName.length <= 100
    && typeof m.tactic === 'string' && m.tactic.length <= 50
    && (!m.confidence || ['inferred', 'confirmed'].includes(m.confidence))
  );
}

// Checks the language model result against its schema.
export function validateLlmResult(r) {
  const ok = r && typeof r === 'object'
    && ['completed', 'not_configured'].includes(r.status)
    && (r.riskAssessment === null || LEVELS.includes(r.riskAssessment))
    && (r.reasoning === null || (typeof r.reasoning === 'string' && r.reasoning.length <= 4000))
    && (r.sandboxRecommended === null || typeof r.sandboxRecommended === 'boolean')
    && strList(r.keyConcerns, 20) && strList(r.uncertainties, 20)
    && (r.mitreAttAndCk === undefined || r.mitreAttAndCk === null || validateMitre(r.mitreAttAndCk))
    && (r.narrative === undefined || r.narrative === null || (typeof r.narrative === 'string' && r.narrative.length <= 2000));
  if (!ok) return { ok: false, value: null };
  const { status, riskAssessment, reasoning, sandboxRecommended, keyConcerns, uncertainties, mitreAttAndCk, narrative } = r;
  return {
    ok: true,
    value: {
      status,
      riskAssessment,
      reasoning,
      sandboxRecommended,
      keyConcerns,
      uncertainties,
      mitreAttAndCk: Array.isArray(mitreAttAndCk) ? mitreAttAndCk : [],
      narrative: typeof narrative === 'string' ? narrative : null,
    },
  };
}
