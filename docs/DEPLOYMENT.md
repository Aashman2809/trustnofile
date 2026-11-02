# AWS deployment

The AWS deployment uses CloudFront/S3 for the frontend, an ALB and ECS Fargate for the API, S3 for uploaded objects, SQS for durable analysis jobs, an ECS Fargate worker, and AWS Batch/Fargate for optional isolated ELF analysis. PostgreSQL and authentication remain on Supabase. Gemini remains the optional LLM provider.

**Untrusted files must never be executed inside the API container.** The API only accepts files, persists them to S3, creates the analysis record, and publishes an SQS message. The worker performs static analysis and submits eligible ELF files to AWS Batch. Batch jobs receive no application task role or application secrets.

## Local development

Copy `backend/.env.example` to `backend/.env` and use the documented local defaults. Local mode keeps local file/JSON adapters and the existing Docker sandbox. Run the backend with `cd backend && npm ci && npm run dev`; run the frontend with `cd frontend && npm ci && npm run dev`. The Vite development proxy sends `/api` to localhost. No AWS resources are needed for local mode.

## AWS resources and deployment

This repository contains no infrastructure-as-code. Create AWS resources manually through the AWS Console. The application architecture uses a VPC, S3, SQS, ECR, IAM, ECS Fargate, an Application Load Balancer, CloudFront with a frontend S3 bucket, AWS Batch/Fargate for optional sandboxing, and CloudWatch. Configure each resource before enabling the matching application integration. No AWS resources, account IDs, credentials, certificate IDs, domain names, or production secrets are included in the repository.

The deployment requires an AWS region; networking in at least two Availability Zones; frontend and API domains; ACM certificates (CloudFront's certificate must be in `us-east-1`); Supabase URL, anon key, owner UUID, and PostgreSQL connection string; and optionally a Gemini API key/model. Create Secrets Manager secrets for the PostgreSQL connection string and optionally `GEMINI_API_KEY`. ECS task execution roles read those values. ECS and Batch use IAM task roles and the default AWS credential chain; do not set static access keys in the application environment. If a customer-managed KMS key encrypts a secret, grant narrowly scoped `kms:Decrypt` permission to the execution role.

Build images from the `backend` directory:

```sh
docker build -f Dockerfile.api -t <api-image> .
docker build -f Dockerfile.worker -t <worker-image> .
docker build -f src/integrations/sandbox/Dockerfile.batch -t <sandbox-image> src/integrations/sandbox
```

Push the API and worker images before enabling their ECS services. Keep `SANDBOX_PROVIDER=disabled` until the Batch job image, S3 access, network controls, and integration checks have been reviewed. The Batch supervisor obtains short-lived S3 presigned URLs; the untrusted child gets a reduced environment and UID 65534. Batch tasks have S3-only egress and no job IAM role. Fargate does not expose all Docker controls, including a configurable tmpfs/noexec mount; if that isolation control is mandatory, keep sandbox disabled and evaluate an EC2-based isolated worker architecture before enabling it.

The frontend build variables are public and documented in `frontend/.env.example`. The existing frontend uses an empty `VITE_API_BASE_URL` to call same-origin `/api`; CloudFront routes `/api/*` to the ALB and other paths to the private S3 frontend origin. Build with `cd frontend && npm ci && npm run build`, sync `frontend/dist` to the configured frontend bucket, then invalidate CloudFront. Do not put backend credentials, service-role keys, Gemini keys, or AWS credentials in any `VITE_` variable.

## Server configuration

AWS task definitions set the shared configuration. Secrets are loaded via ECS Secrets Manager injection; all other values are task environment configuration. `backend/.env.example` lists the names.

| Name | Use / classification |
|---|---|
| `DEPLOYMENT_MODE=aws`, `AWS_REGION` | Enables strict AWS mode and selects the SDK region. AWS SDK credentials come from task roles. |
| `AWS_S3_BUCKET`, `STORAGE_PROVIDER=s3` | Private upload and temporary sandbox object bucket; object keys are server-generated UUID filenames under fixed prefixes. |
| `ANALYSIS_QUEUE_PROVIDER=sqs`, `ANALYSIS_QUEUE_URL` | Durable job submission/consumption; API role sends, worker role receives/deletes/extends visibility. |
| `DATABASE_URL` | **Secret** in Secrets Manager; Supabase PostgreSQL connection string. |
| `DATABASE_SSL=true`, `DATABASE_SSL_REJECT_UNAUTHORIZED=true`, optional `DATABASE_SSL_CA` | PostgreSQL TLS verification. Do not disable certificate verification in production. |
| `REQUIRE_DATABASE=true`, `REQUIRE_STORAGE=true` | Hosted fail-closed startup settings; AWS mode enforces them. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AUTH_REQUIRED=true`, `AUTH_ALLOWED_USER_ID` | Supabase Auth endpoint, public anon key, and single-owner restriction. |
| `GEMINI_API_KEY` | Optional **secret**; Gemini API key, worker analysis and API report chat. |
| `GEMINI_MODEL`, `LLM_PROVIDER=gemini` | Gemini model configuration. |
| `MAX_UPLOAD_MB`, `SANDBOX_TIMEOUT_MS`, `MODULE_TIMEOUT_MS` | Upload and analysis limits. |
| `SANDBOX_PROVIDER=batch` or `disabled` | Batch job path or explicitly disabled sandbox. API and worker must use matching settings. |
| `SANDBOX_BATCH_JOB_QUEUE`, `SANDBOX_BATCH_JOB_DEFINITION` | AWS Batch resources; no credentials or secret values. |
| `FRONTEND_ORIGIN`, `TRUST_PROXY=true` | Exact browser origin and ALB forwarded-header handling. |

Public frontend build values are `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`. The Supabase anon key is designed to be public. Never expose database credentials, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, sandbox tokens, or AWS credentials to the browser. AWS S3 storage does not use the Supabase service-role key.

## Job reliability and persistence

SQS uses a DLQ and retry redrive policy. The worker extends message visibility and renews a database job claim while processing. PostgreSQL job claims prevent concurrent duplicate message delivery from executing the same analysis at once. API startup requeues unclaimed `UPLOADED` records to recover the small window between database insert and SQS send. Apply [migration 001](migrations/001_analysis_job_claim.sql) to the existing Supabase database before deploying the AWS worker. Review DLQ messages and requeue only after resolving the failure cause.

Analysis state and reports continue to use the existing PostgreSQL schema. Uploaded files are stored in S3; task disk is only used for bounded staging/materialization and temporary work. Temporary sandbox input/results use separate prefixes and are cleaned by the worker, with an S3 lifecycle expiration as a backstop.

## Health, logs, and checks

- ALB liveness path: `GET /api/health/live` (process-only, no dependency detail).
- Readiness path: `GET /api/health/ready` (returns only ready/not-ready; checks required database, storage, and queue dependencies).
- Existing `GET /api/health` and `/api/config/capabilities` remain for compatibility.
- API/worker/sandbox logs are structured JSON and can be sent to CloudWatch Logs. Configure log groups, retention, alarms, and any SNS notifications manually in the AWS Console.

After deployment, verify in order: readiness; Supabase sign-in and owner restriction; upload and S3 object; SQS enqueue; worker static analysis; report persistence/polling; delete behavior; and, only when enabled, Batch ELF execution, timeout, no-egress behavior, and cleanup. Do not use real malware as a smoke-test sample; test with inert fixtures and controlled security validation.

## Rollback

Before cutover, keep the existing Render/Vercel instructions in [DEPLOYMENT-LEGACY.md](DEPLOYMENT-LEGACY.md). Roll back CloudFront to the previous frontend build and ECS to the previous task definition/image. Do not destroy S3, SQS, Batch, or Supabase data as part of application rollback. For a job migration issue, disable worker service scaling and keep queued work for diagnosis; use the SQS DLQ and database state to reconcile before retry. DNS cutover and database/storage migration are separate decisions; this deployment keeps Supabase PostgreSQL/Auth but changes file storage to S3.
