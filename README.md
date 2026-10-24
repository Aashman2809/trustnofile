# TrustNoFile

Local web application that analyzes untrusted files with **static analysis only** and produces an explainable, heuristic risk report. Uploaded files are **never executed**.

**Status (v0.6.0):** upload, validation, static analysis, deterministic risk assessment, reports, history, JSON export are implemented. LLM, database and sandbox integrations are **not configured**; disabled adapters and documented interfaces are in place (see `docs/INTEGRATION.md`).

## Requirements
Node.js 22 or newer (tested on 22 and 24), npm. Optional: the `yara` program for YARA scanning.

## Run
```
cd backend
copy .env.example .env        # macOS/Linux: cp .env.example .env
npm install
npm run dev                   # API on http://localhost:4000
```
```
cd frontend
npm install
npm run dev                   # UI on http://localhost:5173 (proxies /api to the backend)
```

## Test
```
cd backend
npm test
```
Backend tests use only synthetic fixtures (no malware). There are currently **no automated frontend tests**; the UI has been verified manually.

## CLI scan (no server needed)
`npm run scan -- <path-to-file>` prints the structured evidence as JSON.

## Configuration (backend/.env)
| Variable | Default | Meaning |
|---|---|---|
| PORT | 4000 | API port |
| FRONTEND_ORIGIN | http://localhost:5173 | Only origin allowed by CORS |
| MAX_UPLOAD_MB | 100 | Upload size limit |
| STORAGE_DIR / DATA_DIR | backend/storage/uploads, backend/data | Where files and JSON records live |
| YARA_PATH / YARA_RULES_DIR | yara, backend/rules | Optional YARA scanner and rule folder |
| MODULE_TIMEOUT_MS | 30000 | Per-module analysis timeout |
| RISK_MODERATE / RISK_HIGH / RISK_VERY_HIGH | 25 / 50 / 75 | Score band thresholds (must ascend) |
| LOG_SILENT | unset | Set to silence logs |

## Where data lives
Uploaded files: `backend/storage/uploads/<uuid>.bin`. Records and reports: `backend/data/*.json`. Everything stays on this machine; nothing is sent to external services. Files are not encrypted and are not deleted automatically. Use **Delete file** or **Remove entry** on the History page.

## Project layout
`backend/src`: `routes` and `controllers` (thin HTTP), `services` (business logic: upload, validation, orchestration, risk, reports, deletion), `analysis` (independent static modules), `repositories` (persistence contracts and local JSON implementations), `integrations` (disabled LLM, database, sandbox adapters), `schemas`, `middleware`, `utils`. `frontend/src`: `pages`, `components`, `services/api.js`, `lib`.

## Docs
`docs/API.md` endpoints and schemas - `docs/SECURITY.md` security model and limitations - `docs/INTEGRATION.md` adding an LLM, SQL database, or sandbox - `docs/database-schema.sql` proposed relational schema.

## Troubleshooting
- **Vite `ECONNREFUSED /api/...`**: the backend is not running on port 4000.
- **`npm test` says it cannot find module `tests`**: ensure the script is `node --test "tests/**/*.test.js"`.
- **Analysis "rejected: stored file could not be found"**: the file was deleted or quarantined by antivirus after upload.
- **YARA shows unavailable**: install YARA and/or set `YARA_PATH`; put `.yar` files in `backend/rules`.
- **Upload rejected as unsupported**: only the formats listed on the Analyze page are accepted.
