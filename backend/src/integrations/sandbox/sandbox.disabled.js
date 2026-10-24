// Nothing is ever executed. Always reports "Sandbox unavailable".
export function createDisabledSandbox() {
  return {
    getStatus: () => ({ status: 'unavailable' }),
    run: async () => ({ status: 'unavailable', message: 'Sandbox unavailable', behavioralEvidence: null, logs: [], artifacts: [] }),
  };
}
