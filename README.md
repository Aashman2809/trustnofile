# TrustNoFile

Local web application that analyzes untrusted files using signature-based identification, non-executing static analysis, and an explainable deterministic risk report. Optional LLM reasoning and isolated Linux ELF sandboxing are available when configured. Files are never executed on the host.

**Status (v0.6.0):** upload, validation, static analysis, deterministic risk assessment, reports, history, JSON export, optional Gemini development integration, PostgreSQL repositories, and optional isolated Linux ELF sandbox integration are implemented. Gemini and other external services remain optional and report their actual status.

## Requirements
Node.js 22.13 or newer (tested on 24), npm. Optional: the `yara` program for YARA scanning. PostgreSQL, Docker Engine, and a Gemini API key are only needed for their respective integrations.

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
Backend tests use only synthetic fixtures (no malware). There are currently **no automated frontend tests**; the frontend production build is verified with `npm run build`.

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
| LLM_PROVIDER | gemini | Provider-neutral LLM selection (`gemini`, `disabled`; Bedrock is a future adapter) |
| GEMINI_API_KEY / GEMINI_MODEL | unset / unset | Gemini development credentials and configured model; both are needed to enable AI review |
| LLM_TIMEOUT_MS | 15000 | Gemini request timeout in milliseconds, bounded to 1–60 seconds |
| DATABASE_URL / DATABASE_SSL | unset / false | Optional PostgreSQL URL and TLS verification; run `docs/database-schema.sql` first |
| SANDBOX_IMAGE / SANDBOX_DOCKER_PATH / SANDBOX_TIMEOUT_MS | unset / docker / 30000 | Optional Docker image, executable path, and time limit |
| RISK_MODERATE / RISK_HIGH / RISK_VERY_HIGH | 25 / 50 / 75 | Score band thresholds (must ascend) |
| LOG_SILENT | unset | Set to silence logs |

## Where data lives
Uploaded files: `backend/storage/uploads/<uuid>.bin`. By default, records and reports live in `backend/data/*.json`; when PostgreSQL is connected, its repositories are selected instead. Configuring Gemini sends only minimized file size/type, module states, finding codes/severities, and deterministic assessment fields. File bytes, filenames, extracted strings, credentials, and filesystem data are not sent. Gemini is intended for development within applicable API limits; AWS Bedrock is the intended future production provider. Files are not encrypted and are not deleted automatically. Use **Delete file** or **Remove entry** on the History page.

## Supported uploads

Windows PE and Linux ELF executables, PDF, ZIP archives, OpenXML and legacy Office documents, PNG/JPEG/GIF/WebP/BMP images, and UTF-8 text/JSON. Content signatures determine the detected type; extensions and browser MIME are recorded as untrusted metadata. Unsupported binary formats are rejected.

## Project layout
`backend/src`: `routes` and `controllers` (thin HTTP), `services` (upload, validation, orchestration, risk, reports, deletion), `analysis` (independent static modules), `repositories` (contracts and local JSON implementations), and `integrations` (provider-neutral LLM contract with Gemini adapter, PostgreSQL, Docker sandbox, and disabled fallback adapters). `frontend/src`: `pages`, `components`, `services/api.js`, `lib`.

## Docs
`docs/API.md` endpoints and schemas - `docs/SECURITY.md` security model and limitations - `docs/INTEGRATION.md` configuration and limits for the LLM, PostgreSQL, and sandbox - `docs/database-schema.sql` PostgreSQL schema.

## Troubleshooting
- **Vite `ECONNREFUSED /api/...`**: the backend is not running on port 4000.
- **`npm test` says it cannot find module `tests`**: ensure the script is `node --test "tests/**/*.test.js"`.
- **Analysis "rejected: stored file could not be found"**: the file was deleted or quarantined by antivirus after upload.
- **YARA shows unavailable**: install YARA and/or set `YARA_PATH`; put `.yar` files in `backend/rules`.
- **Upload rejected as unsupported**: only the formats listed on the Analyze page are accepted.
