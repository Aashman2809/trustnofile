// Disabled LLM adapter: the default. Never fabricates reasoning.
export function createDisabledLlm() {
  return {
    getStatus: () => ({ status: 'not_configured' }),
    analyzeEvidence: async () => ({ status: 'not_configured', riskAssessment: null, reasoning: null, sandboxRecommended: null, keyConcerns: [], uncertainties: [] }),
  };
}
