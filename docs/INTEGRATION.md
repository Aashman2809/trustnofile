# Adding future integrations
All integrations are behind contracts in `backend/src/integrations`. `createIntegrations(overrides)` validates that a replacement implements the contract, and `createApp({ integrations })` injects it. Upload controllers and static-analysis modules do not change.

## LLM (`integrations/llm`)
1. Implement `getStatus()` (return `{status:'configured'}` only when keys are present) and `analyzeEvidence({fileMetadata, staticEvidence, preliminaryAssessment, context})` returning `{status:'completed', riskAssessment, reasoning, sandboxRecommended, keyConcerns[], uncertainties[]}`.
2. Pass it via `createIntegrations({ llm })`. The orchestrator already calls it after the deterministic assessment, validates the output with `validateLlmResult`, and downgrades any failure to `ai.status = "error"` without failing the analysis.
3. Requirements: treat strings, metadata and filenames as untrusted data kept separate from system instructions; send only the minimized structured evidence the orchestrator provides (no full files, no filenames); give the model no tools; request schema-constrained output; handle refusals, timeouts and malformed output; enforce policy in code, never by prompt alone. Keep keys in environment variables, never in Git.

## Database (`integrations/database`, `repositories`)
1. Choose MySQL (`mysql2`) or PostgreSQL (`pg`). Create the schema from `docs/database-schema.sql` (notes on dialect differences are inside).
2. Implement `fileRepo` per `repositories/file.repository.js` and `analysisRepo` per `repositories/analysis.repository.js` using **parameterized queries only**; see `integrations/database/sql.adapter.example.js`.
3. Return them from the adapter's `createRepositories()` and use them in `createApp` in place of the local JSON repositories (a small change in `app.js`). Update the capabilities status to `connected`.
4. Replace the in-process job manager with a durable queue if analyses must survive restarts.

## Sandbox (`integrations/sandbox`)
Implement `getStatus()` and `run({fileRef, timeoutMs})` returning `{status, behavioralEvidence, logs[], artifacts[]}`, then call it from the orchestrator after static analysis (a new stage) and add the evidence to the report's `behavioral` section. Minimum security requirements: disposable isolated environments per run; no privileged containers; no Docker socket access from untrusted workloads; no sensitive host mounts; restricted or no network; CPU, memory, process and time limits; controlled read-only input and write-only output directories; safe telemetry collection (treat all output as untrusted); guaranteed cleanup after completion or timeout.
