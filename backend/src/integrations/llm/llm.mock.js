
// Creates disabled llm.
export function createDisabledLlm() {
  return {

    // Returns the current service status.
    getStatus: () => ({ status: 'not_configured' }),

    // Analyzes the collected evidence.
    analyzeEvidence: async () => ({ status: 'not_configured', riskAssessment: null, reasoning: null, sandboxRecommended: null, keyConcerns: [], uncertainties: [] }),
  };
}
