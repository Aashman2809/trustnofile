# Security model and known limitations

**Intended use:** a trusted, single-user local development tool. There is no authentication or authorization; do not expose it to a network or deploy it as a multi-user service.

## Controls in place

- The upload path ignores browser MIME and extension for type identification. It reads file signatures, inspects ZIP central-directory names to distinguish OpenXML types, and records extension/content mismatches. Supported signatures include PE, PDF, ZIP/OpenXML, common images, and text/JSON.
- Files use server-generated UUID names in a private storage directory. User filenames are sanitized and never become disk paths. Delete operations are confined to the storage directory.
- Static analysis never executes, imports, extracts, or decompresses uploaded content. Archive headers are bounded; PDF keyword checks inspect at most 10 MB.
- Streaming reads, bounded samples, module timeouts, and isolated module failures keep analysis resource use constrained. YARA is invoked with `execFile` and a fixed argument array.
- Gemini receives only a minimized structured evidence projection. It has no tools; no files, filenames, extracted strings, secrets, filesystem state, or environment variables are sent. Provider output is schema-validated and cannot override deterministic assessment.
- Optional PostgreSQL access is behind repository contracts and uses parameterized queries. A database is reported connected only after a real query succeeds. Startup connection failure falls back to local JSON; later operation failures are returned as errors.
- The optional sandbox uses a disposable Docker container with no network, no elevated privileges, no sensitive host mounts, read-only input/root, resource limits, bounded output, timeout, and cleanup. The configured runner supports Linux ELF only. Workloads do not receive the Docker socket. Container output is untrusted and is never reintroduced as LLM instructions.
- Helmet headers, CORS limited to the configured origin, rate limiting, request IDs, centralized errors without stack traces, and logging that omits file contents and credentials.
- File-derived text and sandbox telemetry are displayed as plain text through React rendering.

## Known limitations

- The score is an application-defined heuristic, not a calibrated malware probability. No indicators does not mean safe. The LLM is a second opinion, not an authority.
- The Docker sandbox is a container boundary, not a virtual machine. It depends on a trusted Docker daemon and a trusted locally built runner image. The current runner executes Linux ELF only; PE, PDF, Office, images, archives, and other types are not dynamically executed.
- Sandbox availability depends on daemon permissions and the configured image. In this environment Docker and Podman were installed but their daemons were inaccessible, so live execution could not be verified.
- Gemini is an optional development integration. When configured, minimized metadata and indicator codes are sent to Google; no uploaded bytes or raw file-derived text are sent. AWS Bedrock is a future production provider and has not been implemented or verified.
- Database use requires a PostgreSQL service and manual schema setup. The app uses local JSON when the service cannot connect at startup. Local JSON is not durable across crashes, is unsafe for concurrent processes, and is not encrypted.
- Analysis jobs remain in process. Jobs interrupted by a restart are marked failed, not resumed.
- ZIP64 and nested/encrypted archive contents are not inspected. File signatures are best-effort type hints, not proof that a file is structurally valid. PDF checks are simple keyword counts in the first 10 MB. PE certificate-table presence is reported but not cryptographically validated.
- Deletion can race with a just-started analysis in rare cases; deletion is refused while a job is observed running. Antivirus software may quarantine stored files.
- At implementation time, `npm audit` reported no known vulnerabilities in either the backend or frontend dependency trees. Re-run the audit before deployment because advisories change over time.
