

const LEVELS = ['low', 'moderate', 'high', 'very_high', 'insufficient_evidence'];

// Handles list.
const strList = (v, max) => Array.isArray(v) && v.length <= max && v.every(/* Checks whether the item meets the condition. */ (s) => typeof s === 'string' && s.length <= 300);

// Checks the language model result against its schema.
export function validateLlmResult(r) {
  const ok = r && typeof r === 'object'
    && ['completed', 'not_configured'].includes(r.status)
    && (r.riskAssessment === null || LEVELS.includes(r.riskAssessment))
    && (r.reasoning === null || (typeof r.reasoning === 'string' && r.reasoning.length <= 4000))
    && (r.sandboxRecommended === null || typeof r.sandboxRecommended === 'boolean')
    && strList(r.keyConcerns, 20) && strList(r.uncertainties, 20);
  if (!ok) return { ok: false, value: null };
  const { status, riskAssessment, reasoning, sandboxRecommended, keyConcerns, uncertainties } = r;
  return { ok: true, value: { status, riskAssessment, reasoning, sandboxRecommended, keyConcerns, uncertainties } };
}
