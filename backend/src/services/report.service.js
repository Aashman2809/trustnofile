/**
 * Report JSON schema (schemaVersion "1.0"):
 * { schemaVersion, generatedAt, analysis{id,status,startedAt,finishedAt}, file{id,originalName,size,extension,detected,sha256,md5,uploadedAt},
 *   assessment{riskScore|null,riskLevel,confidence,evidenceSufficiency,noIndicatorsDetected,reasons[],limitations[],sandboxRecommended,thresholds},
 *   staticAnalysis{summary,modules[{module,status,reason?,durationMs,errors[]}],findings[]},
 *   ai{status,riskAssessment,reasoning,sandboxRecommended,keyConcerns[],uncertainties[]}, behavioral{status,message},
 *   recommendations[{text,basedOn[]}], disclaimer }
 * Findings are "observed" (facts read from the file) or "heuristic" (interpretations that may be benign).
 */
export function buildRecommendations(findings, assessment) {
  const has = (c) => findings.some((f) => f.code === c);
  const out = [];
  const add = (text, basedOn = []) => out.push({ text, basedOn });
  const notable = findings.filter((f) => f.severity !== 'info');
  if (has('HASH_MISMATCH')) add('Investigate why the stored file changed after upload; treat the stored copy as unreliable.', ['HASH_MISMATCH']);
  if (has('YARA_MATCH')) add('Review the matched YARA rule(s) and their provenance to judge how reliable the match is.', ['YARA_MATCH']);
  if (has('ARCHIVE_PATH_TRAVERSAL')) add('Do not extract this archive with tools that do not sanitize entry paths.', ['ARCHIVE_PATH_TRAVERSAL']);
  if (has('OFFICE_MACROS_PRESENT')) add('Confirm the document source before enabling macros; inspect the VBA project in an isolated viewer.', ['OFFICE_MACROS_PRESENT']);
  if (has('FORMAT_MISMATCH')) add('Confirm with the sender what the file is supposed to be; the extension and content disagree.', ['FORMAT_MISMATCH']);
  if (has('PE_NO_EMBEDDED_SIGNATURE') && notable.length) add('Check the file\'s origin and publisher; it carries no embedded signature (common for legitimate files too).', ['PE_NO_EMBEDDED_SIGNATURE']);
  if (notable.length && out.length < 2) add('Review the listed indicators in context; none is conclusive on its own.', notable.map((f) => f.code));
  if (['moderate', 'high', 'very_high'].includes(assessment.riskLevel)) add('Keep the file quarantined pending further inspection.');
  if (assessment.riskLevel === 'insufficient_evidence') add('Evidence was insufficient; re-run the analysis or submit the file for additional analysis.');
  if (assessment.sandboxRecommended) add('Submit the file for behavioral (sandbox) analysis when that capability becomes available.');
  if (assessment.noIndicatorsDetected) add('No indicators were detected, which is not a safety verdict; apply normal caution to files from unknown sources.');
  return out;
}

export function buildReport({ analysisId, status, startedAt, finishedAt, file, evidence, assessment, now, ai }) {
  const { storedName, ...safeFile } = file;
  return {
    schemaVersion: '1.0', generatedAt: now,
    analysis: { id: analysisId, status, startedAt, finishedAt },
    file: { id: safeFile.id, originalName: safeFile.originalName, size: safeFile.size, extension: safeFile.extension, detected: safeFile.detected, typeMismatch: !!safeFile.typeMismatch, sha256: safeFile.sha256, md5: safeFile.md5, uploadedAt: safeFile.uploadedAt },
    assessment,
    staticAnalysis: {
      summary: evidence.summary,
      modules: evidence.modules.map(({ module, status: s, reason, durationMs, errors }) => ({ module, status: s, reason: reason ?? null, durationMs, errors })),
      findings: evidence.findings,
    },
    ai: { message: null, riskAssessment: null, reasoning: null, sandboxRecommended: null, keyConcerns: [], uncertainties: [], ...(ai || { status: 'not_configured', message: 'LLM integration not configured.' }) },
    behavioral: { status: 'unavailable', message: 'Sandbox analysis is not available in the current version.' },
    recommendations: buildRecommendations(evidence.findings, assessment),
    disclaimer: 'Static analysis only. The score is an application-defined heuristic, not a malware probability, and absence of indicators does not mean a file is safe.',
  };
}

export const toSummary = (a) => ({
  id: a.id, fileId: a.fileId, status: a.status, startedAt: a.startedAt, finishedAt: a.finishedAt, stages: a.stages, error: a.error, file: a.file,
  assessment: a.assessment ? { riskScore: a.assessment.riskScore, riskLevel: a.assessment.riskLevel, confidence: a.assessment.confidence, evidenceSufficiency: a.assessment.evidenceSufficiency } : null,
  findingsCount: a.evidence ? a.evidence.findings.length : null, reportAvailable: !!a.report,
});
