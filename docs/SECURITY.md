# Security model and known limitations
**Intended use:** a trusted, single-user local development tool. There is **no authentication or authorization**, so it must not be exposed to a network or deployed as a multi-user service.

## Controls in place
- Backend enforces size limits, signature-based type detection, filename sanitization and supported-type policy; the browser and file extension are not trusted.
- Files stored under server-generated UUID names in a private directory that is not served; deletion is confined to that directory.
- Uploaded files are never executed, imported or opened by an interpreter. Archives are inspected by reading directory headers only; nothing is extracted.
- Streaming reads with bounded scan sizes, entry counts and output samples; per-module timeouts; module failure is isolated and reported.
- Optional YARA runs via `execFile` (no shell), timeouts and output limits, rules only from a configured directory.
- Helmet headers, CORS limited to the configured origin, rate limiting, request IDs, centralized errors without stack traces, no secrets or file contents in logs.
- File-derived text is rendered as plain text in the UI (React escaping) and treated as untrusted in any future LLM use.

## Known limitations
- Static analysis cannot see runtime behavior. "No indicators" is not "safe". The risk score is an application-defined heuristic, not a calibrated probability.
- Signature support only reports whether a Windows PE certificate table exists; it does not validate it.
- ZIP64 and nested or encrypted archive contents are not inspected; PDF checks are keyword counts within the first 10 MB.
- Local JSON storage is not durable, not safe for concurrent processes, and not encrypted. In-process jobs are lost on restart (interrupted analyses are marked FAILED at startup).
- Deletion can race with a just-started analysis in rare cases; deletion is refused while an analysis is running.
- Antivirus software may quarantine stored files; the analysis then reports the file as missing.
- Dependencies were installed with `npm audit` warnings that were not triaged; review before any broader use.
