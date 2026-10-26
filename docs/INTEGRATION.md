# Optional integrations

Integrations are selected in `createIntegrations()` and consumed through provider-neutral contracts. Their public status is available from `GET /api/config/capabilities`. No external service is required for the deterministic local analysis pipeline.

## LLM provider boundary

The application-facing LLM contract is `getStatus()` and `analyzeEvidence({ fileMetadata, staticEvidence, preliminaryAssessment, context })`. The orchestrator uses only that contract and validates every result with `validateLlmResult()`. Evidence minimization is a provider-neutral allowlist. Provider errors, timeouts, invalid configuration, and malformed responses do not stop deterministic analysis.

```text
TrustNoFile → LLM Interface → Gemini Adapter → Gemini API
```

The development provider is Gemini because it can be used through its free API tier within applicable limits. It is optional; it is enabled only when both an API key and a model are configured. Create a key in [Google AI Studio](https://aistudio.google.com/app/apikey), then set these values in `backend/.env` (never in frontend configuration):

```dotenv
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=your-configured-model
LLM_TIMEOUT_MS=15000
```

There is no model-name default in application code. Choose a model supported by the Gemini API and set it in `GEMINI_MODEL`. The timeout must be between 1000 and 60000 milliseconds; calls use a bounded request deadline and one SDK attempt. Empty credentials/model leave the provider `not_configured`; invalid timeout or an unsupported provider reports `unavailable`. API errors, rate limits, invalid keys, unavailable models, empty output, and invalid structured output become an AI error in the report while deterministic analysis continues. The application does not log provider exception details.

The Gemini adapter uses schema-constrained JSON output and no tools. Application-side validation remains mandatory. Model output is only a second opinion: it cannot lower deterministic risk, and application policy alone decides whether optional sandboxing is allowed.

### Evidence and security boundary

The provider receives only a bounded projection of file size, detected format/MIME, static module names/statuses, finding codes/severities/kinds/modules, and deterministic score/level/confidence/reason codes. File-derived values are untrusted data separated from system instructions.

The provider does **not** receive file bytes, complete files, filenames, filesystem paths, SHA hashes, extracted strings or arbitrary file contents, parser messages, module errors, logs, secrets, environment variables, credentials, or application instructions supplied by a user. No tools are enabled. Output is schema-validated and never directly triggers execution.

## AWS Bedrock migration (future)

AWS Bedrock is the intended production provider. It is not implemented here. The future adapter should implement the same LLM contract, use the shared evidence projection and result validation, and authenticate through standard AWS SDK credential providers (IAM roles, task/instance roles, or environment-provided credentials). Do not store AWS access keys in source code.

```text
TrustNoFile → LLM Interface → Bedrock Adapter → AWS Bedrock
```

Migration should require adding a Bedrock adapter and AWS SDK dependency, selecting `LLM_PROVIDER=bedrock`, and providing IAM/region/model configuration. Upload, static analysis, deterministic assessment, sandbox policy, report schema, routes, frontend, and orchestration behavior should not change. `bedrock` currently reports unavailable rather than pretending a provider exists.

## PostgreSQL

Set `DATABASE_URL` to a PostgreSQL connection string and apply `docs/database-schema.sql` to an empty database. Optionally set `DATABASE_SSL=true` to require verified TLS. The adapter checks the live connection with `SELECT 1`, then `createApp()` selects the database repositories. If the configured database cannot connect during startup, the app uses the existing local JSON store and reports that active store. If PostgreSQL becomes unavailable after startup, affected operations fail; they are not reported as persisted.

All repository SQL uses positional parameters. Business logic continues to use `file.repository.js` and `analysis.repository.js`. The JSON repositories remain the default when no database URL is configured and remain useful in tests and development. The SQL schema persists complete analysis evidence and reports in JSONB alongside normalized lookup columns. The existing job manager remains in process; an interrupted analysis is marked failed on restart and can be retried.

## Docker sandbox

Build the trusted runner image from `backend/src/integrations/sandbox/Dockerfile`, then set `SANDBOX_IMAGE` to its local tag. `SANDBOX_DOCKER_PATH` selects the Docker CLI (default `docker`); `SANDBOX_TIMEOUT_MS` sets the execution time limit (default 30000, bounded to 1–60 seconds). Status is available only when the configured image exists and the Docker daemon responds.

The current runner executes Linux ELF files only. PDFs, Office files, images, archives, PE files, and other supported types remain static-only. Each eligible execution uses a disposable container with no network, read-only root and input, bounded no-execute temporary storage, no added capabilities, no-new-privileges, a non-root UID, memory/CPU/PID/file-size limits, bounded log output, and a timeout. The container is removed on success, failure, or timeout, and host temporary directories are deleted in `finally` cleanup. No artifact files are collected yet. The uploaded file is never executed on the host. If Docker is unavailable, sandbox is skipped and static/AI results are preserved.

Build and run commands (from the repository root):

```sh
docker build -t trustnofile-runner:local backend/src/integrations/sandbox
```

Configure `SANDBOX_IMAGE=trustnofile-runner:local` in `backend/.env`. Never mount the Docker socket or host-sensitive directories into the workload. The backend needs access to the Docker daemon to launch containers; do not expose that daemon to untrusted clients.

All sandbox telemetry, names, logs, and artifacts are untrusted. The orchestrator accepts only known event codes for deterministic behavioral findings and never sends sandbox output back to the LLM.
