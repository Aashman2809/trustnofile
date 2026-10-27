# TrustNoFile

Local web application that analyzes untrusted files using signature-based identification, non-executing static analysis, and an explainable deterministic risk report. Optional LLM reasoning and isolated Linux ELF sandboxing are available when configured. Files are never executed on the host.

**Status (v0.6.0):** upload, validation, static analysis, deterministic risk assessment, reports, history, JSON export, optional Gemini development integration, PostgreSQL repositories, and optional isolated Linux ELF sandbox integration are implemented. Gemini and other external services remain optional and report their actual status.

## Requirements
Node.js 22.13 or newer (tested on 24), npm. Optional: the `yara` program and `unzip` for YARA scanning and rule updates. PostgreSQL, Docker Engine, and a Gemini API key are only needed for their respective integrations.

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

## Detection-quality corpus
`cd backend && npm run eval:corpus` runs a safe, generated corpus of benign, suspicious-pattern, malformed, and mislabeled inputs. It reports expected-indicator recall, missed indicators, and false-positive rates on the benign subset. The corpus contains synthetic fixtures, not real malware, so its scores are regression signals and not estimates of real-world detection accuracy.

## CLI scan (no server needed)
`npm run scan -- <path-to-file>` prints the structured evidence as JSON.

## Configuration (backend/.env)
| Variable | Default | Meaning |
|---|---|---|
| PORT | 4000 | API port |
| FRONTEND_ORIGIN | http://localhost:5173 | Only origin allowed by CORS |
| MAX_UPLOAD_MB | 50 | Upload size limit (Supabase Free Storage supports files up to 50 MB) |
| STORAGE_PROVIDER / STORAGE_DIR / DATA_DIR | local / backend/storage/uploads / backend/data | Select local or Supabase object storage; local records remain for development fallback |
| YARA_PATH / YARA_RULES_DIR | yara, backend/rules | Optional YARA scanner and rule folder |
| MODULE_TIMEOUT_MS | 30000 | Per-module analysis timeout |
| LLM_PROVIDER | gemini | Provider-neutral LLM selection (`gemini`, `disabled`; Bedrock is a future adapter) |
| GEMINI_API_KEY / GEMINI_MODEL | unset / unset | Gemini development credentials and configured model; both are needed to enable AI review |
| LLM_TIMEOUT_MS | 15000 | Gemini request timeout in milliseconds, bounded to 1–60 seconds |
| DATABASE_URL / DATABASE_SSL / REQUIRE_DATABASE | unset / false / false | PostgreSQL URL, TLS verification, and optional startup failure instead of local fallback; run `docs/database-schema.sql` first |
| REQUIRE_STORAGE | false | Fail startup when configured object storage is unavailable |
| SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_STORAGE_BUCKET | unset / unset / unset / uploads | Supabase Auth verification and private object storage; service-role key is backend-only |
| AUTH_REQUIRED / AUTH_ALLOWED_USER_ID | false / unset | Require verified Supabase sessions and restrict API access to one configured user UUID |
| SANDBOX_IMAGE / SANDBOX_DOCKER_PATH / SANDBOX_TIMEOUT_MS | unset / docker / 30000 | Optional Docker image, executable path, and time limit |
| RISK_MODERATE / RISK_HIGH / RISK_VERY_HIGH | 25 / 50 / 75 | Score band thresholds (must ascend) |
| LOG_SILENT | unset | Set to silence logs |

YARA rule source is pinned in `backend/rules/ruleset.json` to the YARA Forge `core` package. Install or refresh that version with `cd backend && npm run rules:sync`; pass a different dated release tag with `npm run rules:sync -- YYYYMMDD`. This downloads one source package, records its SHA-256 and release metadata, and requires `unzip`. Rule files are not bundled; the report labels YARA as skipped, unavailable, or incomplete until a complete scan actually runs. Review upstream rule licenses before redistributing downloaded rules.

## Where data lives
Uploaded files: `backend/storage/uploads/<uuid>.bin` in local mode, or the configured private object bucket when `STORAGE_PROVIDER=supabase`. Records and reports use local JSON by default or PostgreSQL when connected. Hosted deployments should set `REQUIRE_DATABASE=true` so a database connection failure cannot silently choose local JSON. Hosted analysis downloads objects to a private temporary file and removes it after processing. Configuring Gemini sends only minimized file size/type, module states, finding codes/severities, and deterministic assessment fields. File bytes, filenames, extracted strings, credentials, and filesystem data are not sent. Gemini is intended for development within applicable API limits; AWS Bedrock is the intended future production provider. Files are not encrypted by application code and are not deleted automatically. Use **Delete file** or **Remove entry** on the History page.

## Supported uploads

Windows PE and Linux ELF executables, PDF, ZIP archives, OpenXML and legacy Office documents, PNG/JPEG/GIF/WebP/BMP/SVG images, HTML/XML, YAML, JSON, TOML, INI/configuration, CSV, Markdown, logs, and common JavaScript/TypeScript, CSS, SQL, shell, Python, and compiled-language source files. Binary formats are identified by content signatures; HTML/XML/SVG use bounded markup heuristics. Other text subtypes use the filename extension only after the content passes UTF-8 validation, and the report labels that basis. Static checks inspect bounded text samples; files are never rendered or executed. Unsupported binary formats are rejected.

## Project layout
`backend/src`: `routes` and `controllers` (thin HTTP), `services` (upload, validation, orchestration, risk, reports, deletion), `analysis` (independent static modules), `repositories` (contracts and local JSON implementations), and `integrations` (provider-neutral LLM contract with Gemini adapter, PostgreSQL, Docker sandbox, and disabled fallback adapters). `frontend/src`: `pages`, `components`, `services/api.js`, `lib`.

## Docs
`docs/API.md` endpoints and schemas - `docs/SECURITY.md` security model and limitations - `docs/INTEGRATION.md` configuration and limits for the LLM, PostgreSQL, and sandbox - `docs/database-schema.sql` PostgreSQL schema.

## Hosted demo deployment
For the Supabase + Render + Vercel deployment sequence, environment variables, owner-only authentication setup, and persistence checks, see `docs/DEPLOYMENT.md`.

## Troubleshooting
- **Vite `ECONNREFUSED /api/...`**: the backend is not running on port 4000.
- **`npm test` says it cannot find module `tests`**: ensure the script is `node --test "tests/**/*.test.js"`.
- **Analysis "rejected: stored file could not be found"**: the file was deleted or quarantined by antivirus after upload.
- **YARA shows unavailable**: install YARA and/or set `YARA_PATH`; put `.yar` files in `backend/rules`.
- **Upload rejected as unsupported**: only the formats listed on the Analyze page are accepted.
