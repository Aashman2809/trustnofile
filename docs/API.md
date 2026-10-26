# API reference (v0.6.0)
Base URL `http://localhost:4000/api`. JSON everywhere. Errors: `{ "error": { "code", "message", "requestId" } }` with no stack traces.

| Method & path | Purpose | Success | Errors |
|---|---|---|---|
| GET `/health` | Health and version | 200 `{status, version, time}` | |
| GET `/config/capabilities` | Public limits, module and integration status | 200 | |
| POST `/files` (multipart, field `file`) | Upload and validate | 201 `{file, priorAnalysis}` | 400 empty/no file, 413 too large, 415 unsupported |
| GET `/files?page&pageSize&search` | List file records | 200 `{items,total,page,pageSize}` | |
| GET `/files/:id` | File metadata | 200 `{file}` | 400 bad id, 404 |
| DELETE `/files/:id[?purge=true]` | Delete stored bytes (keep history) or purge everything | 200 `{id,fileDeleted,purged}` | 400, 404, 409 analysis running |
| POST `/files/:id/analyze` body `{force?:true}` | Start analysis | 202 new, 200 existing (`reason`: `already_running` / `already_completed`) | 400, 404, 409 file deleted |
| GET `/analyses?status&risk&search&fileId&sort&page&pageSize` | List analyses | 200 | 400 invalid filter |
| GET `/analyses/stats` | Dashboard statistics | 200 | |
| GET `/analyses/:id` | Status, stages, summary | 200 `{analysis}` | 400, 404 |
| GET `/analyses/:id/evidence` | Raw module evidence | 200 | 409 not available |
| GET `/analyses/:id/report` | Full report | 200 `{report}` | 409 not available |
| GET `/analyses/:id/report.json` | Report as a file download | 200 attachment | 409 |

`file`: `{id, originalName, size, extension, declaredMime, detected{format,mime,category,signature?}, typeMismatch, sha256, md5, status, uploadedAt, fileDeleted?}`. Storage paths and stored names are never returned.

**Analysis states:** UPLOADED, VALIDATING, STATIC_ANALYSIS, AGGREGATING_EVIDENCE, ASSESSING_RISK, AI_DECISION, optional SANDBOX_ANALYSIS, GENERATING_REPORT, then terminal COMPLETED, PARTIAL, FAILED, REJECTED. Stage status: pending, active, completed, skipped, failed.

**Module evidence:** `{module, status: completed|skipped|unavailable|failed|timeout, reason?, durationMs, data, findings[], errors[]}`. Finding: `{code, title, severity: info|low|medium|high, kind: observed|heuristic, description, evidence}`. A non-completed module is never a clean result.

**Report (schemaVersion "1.0"):** `analysis`, `file`, `assessment {riskScore|null, riskLevel: low|moderate|high|very_high|insufficient_evidence, confidence, evidenceSufficiency, noIndicatorsDetected, reasons[], limitations[], sandboxRecommended, thresholds}`, `staticAnalysis {summary, modules[], findings[]}`, `ai {status, message, riskAssessment, reasoning, sandboxRecommended, keyConcerns[], uncertainties[]}`, `behavioral {status, message, behavioralEvidence?, findings?, logs?, artifacts?}`, `recommendations[]`, `disclaimer`. Behavioral status may be `not_required`, `unavailable`, `failed`, `timeout`, or `completed`; returned telemetry is untrusted evidence. The deterministic assessment remains authoritative over AI output.

The public capabilities response reports the selected LLM provider and one of `not_configured`, `configured`, or `unavailable`; it never includes credentials. Report AI status is `not_configured`, `completed`, or `error`. Provider failures and invalid AI output leave the deterministic assessment and report available.
