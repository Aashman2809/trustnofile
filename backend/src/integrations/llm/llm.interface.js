/**
 * LLM adapter contract:
 *   getStatus() -> { status: 'not_configured' | 'configured' }
 *   analyzeEvidence({ fileMetadata, staticEvidence, preliminaryAssessment, context }) -> result (below)
 *
 * result = { status, riskAssessment, reasoning, sandboxRecommended, keyConcerns[], uncertainties[] }
 * Everything derived from the uploaded file (strings, metadata, names) is UNTRUSTED data. Adapters must keep it
 * separate from system instructions, expose no tools to the model, minimize what is sent, and never let model
 * output change trusted policy. Output is re-validated here in application code before it reaches a report.
 */
const LEVELS = ['low', 'moderate', 'high', 'very_high', 'insufficient_evidence'];
const strList = (v, max) => Array.isArray(v) && v.length <= max && v.every((s) => typeof s === 'string' && s.length <= 300);

export function validateLlmResult(r) {
  const ok = r && typeof r === 'object'
    && ['completed', 'not_configured'].includes(r.status)
    && (r.riskAssessment === null || LEVELS.includes(r.riskAssessment))
    && (r.reasoning === null || (typeof r.reasoning === 'string' && r.reasoning.length <= 4000))
    && (r.sandboxRecommended === null || typeof r.sandboxRecommended === 'boolean')
    && strList(r.keyConcerns, 20) && strList(r.uncertainties, 20);
  if (!ok) return { ok: false, value: null };
  const { status, riskAssessment, reasoning, sandboxRecommended, keyConcerns, uncertainties } = r; // drop unknown fields
  return { ok: true, value: { status, riskAssessment, reasoning, sandboxRecommended, keyConcerns, uncertainties } };
}
