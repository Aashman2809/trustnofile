
// Creates disabled sandbox.
export function createDisabledSandbox() {
  return {

    // Returns the current service status.
    getStatus: () => ({ status: 'unavailable' }),

    // Runs the requested analysis operation.
    run: async () => ({ status: 'unavailable', message: 'Sandbox unavailable', behavioralEvidence: null, logs: [], artifacts: [] }),
  };
}
