const LEVELS = ['low', 'moderate', 'high', 'very_high', 'insufficient_evidence'];
const token = (value, pattern, fallback) => typeof value === 'string' && pattern.test(value) ? value : fallback;
const SEVERITY = new Set(['info', 'low', 'medium', 'high']);
const MODULE_STATUS = new Set(['completed', 'skipped', 'unavailable', 'failed', 'timeout']);
const MODULES = new Set(['identification', 'hashing', 'metadata', 'strings', 'entropy', 'archive', 'signature', 'yara']);
const CODES = new Set([
  'FORMAT_MISMATCH', 'HASH_MISMATCH', 'PE_STRUCTURE_INVALID', 'PE_HIGH_ENTROPY_SECTION', 'PDF_ACTIVE_CONTENT',
  'PDF_AUTO_ACTION', 'PDF_EMBEDDED_FILE', 'HIGH_ENTROPY', 'PE_SIGNATURE_PRESENT_UNVERIFIED', 'PE_NO_EMBEDDED_SIGNATURE',
  'YARA_MATCH', 'CORRELATED_INDICATORS', 'ARCHIVE_STRUCTURE_INVALID', 'ARCHIVE_ZIP64_UNSUPPORTED', 'ARCHIVE_PATH_TRAVERSAL',
  'ARCHIVE_COMPRESSION_ANOMALY', 'ARCHIVE_DOUBLE_EXTENSION', 'ARCHIVE_EXECUTABLE_CONTENT', 'ARCHIVE_NESTED',
  'ARCHIVE_ENCRYPTED_ENTRIES', 'OFFICE_MACROS_PRESENT', 'ARCHIVE_ENTRY_LIMIT',
  ...['URL', 'IPV4', 'POWERSHELL_ENCODED', 'CMD_EXEC', 'DOWNLOAD_AND_EXECUTE',
    'PROCESS_INJECTION_APIS', 'PERSISTENCE', 'SCRIPT_KEYWORDS', 'BASE64_BLOB'].map((code) => `STR_${code}`),
]);

// Allowlist a small, fixed evidence projection. File-derived strings, names, paths,
// parser messages, and raw extracted content never cross the provider boundary.
export function minimizeEvidence({ fileMetadata = {}, staticEvidence = {}, preliminaryAssessment = {}, context = {} } = {}) {
  return {
    fileMetadata: {
      size: Number.isSafeInteger(fileMetadata.size) && fileMetadata.size >= 0 ? fileMetadata.size : null,
      format: token(fileMetadata.format, /^[A-Za-z0-9.+_-]{1,32}$/, null),
      mime: token(fileMetadata.mime, /^[A-Za-z0-9.+-]{1,64}\/[A-Za-z0-9.+-]{1,64}$/, null),
    },
    staticEvidence: {
      modules: (Array.isArray(staticEvidence.modules) ? staticEvidence.modules : []).slice(0, 32).map((m) => ({
        module: MODULES.has(m.module) ? m.module : 'unknown', status: MODULE_STATUS.has(m.status) ? m.status : 'unknown',
      })),
      findings: (Array.isArray(staticEvidence.findings) ? staticEvidence.findings : []).slice(0, 100).map((f) => ({
        code: CODES.has(f.code) ? f.code : 'UNKNOWN', severity: SEVERITY.has(f.severity) ? f.severity : 'info',
        kind: ['observed', 'heuristic'].includes(f.kind) ? f.kind : 'heuristic', module: MODULES.has(f.module) ? f.module : 'unknown',
      })),
    },
    preliminaryAssessment: {
      riskScore: Number.isFinite(preliminaryAssessment.riskScore) ? preliminaryAssessment.riskScore : null,
      riskLevel: LEVELS.includes(preliminaryAssessment.riskLevel) ? preliminaryAssessment.riskLevel : 'insufficient_evidence',
      confidence: ['low', 'limited', 'medium', 'high'].includes(preliminaryAssessment.confidence) ? preliminaryAssessment.confidence : 'low',
      evidenceSufficiency: ['insufficient', 'partial', 'combined_static_and_behavioral'].includes(preliminaryAssessment.evidenceSufficiency) ? preliminaryAssessment.evidenceSufficiency : 'insufficient',
      reasons: (Array.isArray(preliminaryAssessment.reasons) ? preliminaryAssessment.reasons : []).slice(0, 50).map((r) => ({ code: CODES.has(r.code) ? r.code : 'UNKNOWN' })),
      sandboxRecommended: preliminaryAssessment.sandboxRecommended === true,
    },
    context: { phase: context.phase === 'static_only' ? 'static_only' : 'analysis' },
  };
}
