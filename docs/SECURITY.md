# Security model and known limitations

**Intended use:** a single-user development tool. Local development has no authentication by default. A hosted single-user demo can enable Supabase token verification with `AUTH_REQUIRED=true` and restrict the API to one `AUTH_ALLOWED_USER_ID`. The data model is shared and has no per-user ownership; disable public sign-ups and do not deploy as a multi-user service.

## Controls in place

- The upload path ignores browser MIME for type identification. It reads binary signatures and ZIP central-directory names, recognizes HTML/XML/SVG with bounded UTF-8 markup heuristics, and uses extensions only as labeled hints for other UTF-8 text subtypes. Extension/content mismatches are recorded.
- Files use server-generated UUID names in a private storage directory. User filenames are sanitized and never become disk paths. Delete operations are confined to the storage directory.
- Static analysis never executes, imports, renders, extracts, or decompresses uploaded content. HTML, XML, and text-source checks inspect at most 2 MB; PDF keyword checks inspect at most 10 MB; ZIP central directories are capped at 64 MB and local-header checks at 256 entries; PE section inspection is capped at 96 sections.
- Streaming reads, bounded samples, module timeouts, and isolated module failures keep analysis resource use constrained. YARA is invoked with `execFile` and a fixed argument array. A pinned YARA Forge core release can be installed with the rule sync script; the report records its release and marks missing or incomplete scans explicitly.
- `npm run eval:corpus` runs generated benign, suspicious-pattern, malformed, and mislabeled fixtures and reports false positives and missed indicators. These inert samples exercise regression behavior and do not estimate real-world malware detection rates.
- Gemini receives only a minimized structured evidence projection. It has no tools; no files, filenames, extracted strings, secrets, filesystem state, or environment variables are sent. Provider output is schema-validated and cannot override deterministic assessment.
- Optional PostgreSQL access is behind repository contracts and uses parameterized queries. A database is reported connected only after a real query succeeds. Startup connection failure falls back to local JSON; later operation failures are returned as errors.
- The optional sandbox uses a disposable Docker container with no network, no elevated privileges, no sensitive host mounts, read-only input/root, resource limits, bounded output, timeout, and cleanup. The configured runner supports Linux ELF only. Workloads do not receive the Docker socket. Container output is untrusted and is never reintroduced as LLM instructions.
- Helmet headers, CORS limited to the configured origin, rate limiting, request IDs, centralized errors without stack traces, and logging that omits file contents and credentials.
- Hosted file and analysis routes can require a Supabase Auth access token that the backend verifies with Supabase, then restrict requests to the configured owner user UUID. Supabase Storage uses a private bucket through a backend-only service-role credential; the frontend receives only the public anon/publishable key.
- File-derived text and sandbox telemetry are displayed as plain text through React rendering.

## Known limitations

- The score is an application-defined heuristic, not a calibrated malware probability. No indicators does not mean safe. The LLM is a second opinion, not an authority.
- The Docker sandbox is a container boundary, not a virtual machine. It depends on a trusted Docker daemon and a trusted locally built runner image. The current runner executes Linux ELF only; PE, PDF, Office, images, archives, and other types are not dynamically executed.
- Sandbox availability depends on daemon permissions and the configured image. In this environment Docker and Podman were installed but their daemons were inaccessible, so live execution could not be verified.
- Gemini is an optional development integration. When configured, minimized metadata and indicator codes are sent to Google; no uploaded bytes or raw file-derived text are sent. AWS Bedrock is a future production provider and has not been implemented or verified.
- Database use requires a PostgreSQL service and manual schema setup. The app uses local JSON when the service cannot connect at startup. Local JSON is not durable across crashes, is unsafe for concurrent processes, and is not encrypted.
- Hosted storage uses Supabase Storage only when explicitly configured. A Render Free filesystem is temporary; local mode there loses uploaded files on restart, deploy, or spin-down. Supabase Free quotas and inactivity pausing also limit this to a demo.
- Analysis jobs remain in process. Jobs interrupted by a restart are marked failed, not resumed.
- ZIP64 and nested/encrypted archive contents are not inspected. OpenXML parts are not extracted or deeply parsed. XML structure checks only compare bounded tag nesting; they are not a full XML validator and never resolve entities. PDF checks verify a header/end marker and count keywords in the first 10 MB; they do not validate the complete object graph. PE certificate-table presence is reported but not cryptographically validated. These limits are reported as findings when they prevent complete inspection.
- The generated evaluation corpus is deliberately small and contains no real malware. Its recall and false-positive measures only describe those fixtures; broader claims require a larger, reviewed corpus with representative benign and threat samples.
- Deletion can race with a just-started analysis in rare cases; deletion is refused while a job is observed running. Antivirus software may quarantine stored files.
- At implementation time, `npm audit` reported no known vulnerabilities in either the backend or frontend dependency trees. Re-run the audit before deployment because advisories change over time.
