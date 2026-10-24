import { createDisabledLlm } from './llm/llm.mock.js';
import { createDisabledDatabase } from './database/database.disabled.js';
import { createDisabledSandbox } from './sandbox/sandbox.disabled.js';

const CONTRACTS = { llm: ['getStatus', 'analyzeEvidence'], database: ['getStatus'], sandbox: ['getStatus', 'run'] };
// Every integration is disabled until explicitly replaced. Replacement adapters must satisfy the contract.
export function createIntegrations(overrides = {}) {
  const all = { llm: createDisabledLlm(), database: createDisabledDatabase(), sandbox: createDisabledSandbox(), ...overrides };
  for (const [name, methods] of Object.entries(CONTRACTS)) {
    for (const m of methods) if (typeof all[name]?.[m] !== 'function') throw new Error(`${name} adapter must implement ${m}()`);
  }
  return all;
}
