import { config } from '../config/env.js';
import { createGeminiLlm, createUnavailableLlm } from './llm/llm.gemini.js';
import { createDisabledLlm } from './llm/llm.mock.js';
import { createDisabledDatabase } from './database/database.disabled.js';
import { createPostgresAdapter } from './database/postgres.adapter.js';
import { createDockerSandbox } from './sandbox/sandbox.docker.js';
import { createRemoteSandbox } from './sandbox/sandbox.remote.js';
import { createLocalObjectStorage } from './storage/storage.local.js';
import { createSupabaseObjectStorage } from './storage/storage.supabase.js';

const CONTRACTS = { llm: ['getStatus', 'analyzeEvidence'], database: ['getStatus', 'createRepositories'], sandbox: ['getStatus', 'run'], storage: ['getStatus', 'put', 'materialize', 'delete'] };

// Creates llm provider.
export function createLlmProvider(settings = config.llm) {
  if (settings.provider === 'disabled') return createDisabledLlm();
  if (settings.provider === 'gemini') {
    if (settings.timeoutValid === false) return createUnavailableLlm('gemini', 'invalid_timeout');
    return createGeminiLlm({ apiKey: settings.geminiApiKey, model: settings.geminiModel, timeoutMs: settings.timeoutMs });
  }

  return createUnavailableLlm(settings.provider);
}

// Creates the configured integration adapters.
export function createIntegrations(overrides = {}, settings = config.llm) {
  const database = process.env.DATABASE_URL ? createPostgresAdapter() : createDisabledDatabase();
  if (!['local', 'supabase'].includes(config.storageProvider)) throw new Error('STORAGE_PROVIDER must be local or supabase.');
  const storage = config.storageProvider === 'supabase' ? createSupabaseObjectStorage() : createLocalObjectStorage();
  const sandbox = config.sandboxWorkerUrl || config.sandboxWorkerToken
    ? createRemoteSandbox({ url: config.sandboxWorkerUrl, token: config.sandboxWorkerToken })
    : createDockerSandbox();
  const all = { llm: createLlmProvider(settings), database, sandbox, storage, ...overrides };
  for (const [name, methods] of Object.entries(CONTRACTS)) {
    for (const m of methods) if (typeof all[name]?.[m] !== 'function') throw new Error(`${name} adapter must implement ${m}()`);
  }
  return all;
}
