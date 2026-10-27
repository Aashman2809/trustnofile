import fs from 'node:fs/promises';
import path from 'node:path';
import { runStaticAnalysis } from '../analysis/evidence-aggregator.js';
import { assessRisk } from './risk-assessment.service.js';
import { buildReport } from './report.service.js';
import { canTransition, applyTransition, initialStages, TERMINAL } from './analysis-states.js';
import { AppError } from '../middleware/error.middleware.js';
import { config } from '../config/env.js';
import { newId } from '../utils/ids.js';
import { log } from '../utils/logger.js';
import { validateLlmResult } from '../integrations/llm/llm.interface.js';
import { minimizeEvidence } from '../integrations/llm/evidence.js';

const SEV = { high: 3, medium: 2, low: 1, info: 0 };

// Formats a date as an ISO timestamp.
const iso = () => new Date().toISOString();

// Filters findings to safe behavior data.
function safeBehaviorFindings(value) {
  const mapping = {
    process_created: ['SANDBOX_PROCESS_CREATED', 'Process created in sandbox', 'low'],
    network_attempt: ['SANDBOX_NETWORK_ATTEMPT', 'Network access attempted in restricted sandbox', 'medium'],
    file_written: ['SANDBOX_FILE_WRITTEN', 'File written in sandbox', 'low'],
    persistence_attempt: ['SANDBOX_PERSISTENCE_ATTEMPT', 'Persistence behavior attempted', 'high'],
    execution_error: ['SANDBOX_EXECUTION_ERROR', 'Sandbox execution error', 'info'],
  };
  const events = Array.isArray(value?.events) ? value.events.slice(0, 100) : [];
  return events.flatMap(/* Handles the callback for this operation. */ (e) => {
    if (!e || typeof e !== 'object' || !Object.hasOwn(mapping, e.type)) return [];
    const item = mapping[e?.type];
    const [code, title, severity] = item;
    return [{ module: 'sandbox', code, title, severity, kind: 'observed',
      description: 'The isolated sandbox reported this event; associated names and text are untrusted telemetry.',
      evidence: { type: e.type, detail: typeof e.detail === 'string' ? e.detail.slice(0, 300) : null } }];
  });
}

// Filters analysis data to safe behavior fields.
function safeBehaviorData(value) {
  const allowed = new Set(['process_created', 'network_attempt', 'file_written', 'persistence_attempt', 'execution_error']);
  const events = (Array.isArray(value?.events) ? value.events : []).slice(0, 100).flatMap(/* Handles the callback for this operation. */ (e) => {
    if (!e || typeof e !== 'object' || !allowed.has(e.type)) return [];
    return [{ type: e.type, detail: typeof e.detail === 'string' ? e.detail.slice(0, 300) : null }];
  });
  return { events, exitCode: Number.isInteger(value?.exitCode) && value.exitCode >= -255 && value.exitCode <= 255 ? value.exitCode : null,
    ...(value?.outputMalformed === true ? { outputMalformed: true } : {}) };
}

// Creates the analysis workflow coordinator.
export function createOrchestrator({ fileRepo, analysisRepo, jobs, runStatic = runStaticAnalysis, storageDir = config.storageDir, integrations = null }) {
  const locks = new Map();

  // Runs lock.
  const withLock = (key, fn) => {
    const next = (locks.get(key) || Promise.resolve()).catch(/* Handles the asynchronous error. */ () => {}).then(fn);
    locks.set(key, next);
    next.finally(/* Runs cleanup after the asynchronous operation. */ () => { if (locks.get(key) === next) locks.delete(key); }).catch(/* Handles the asynchronous error. */ () => {});
    return next;
  };

  // Executes execute operation.
  async function execute(id) {
    let a = await analysisRepo.getById(id);
    const t0 = Date.now();

    // Runs step operation.
    const step = async (to, note = null, patch = {}) => {
      if (!canTransition(a.status, to)) throw new Error(`Invalid transition ${a.status} -> ${to}`);
      const now = iso();
      a = await analysisRepo.update(id, { status: to, stages: applyTransition(a.stages, to, now, note), ...(TERMINAL.includes(to) ? { finishedAt: now } : {}), ...patch });
      log('info', 'analysis_state', { analysisId: id, state: to, elapsedMs: Date.now() - t0 });
    };
    try {
      await step('VALIDATING');
      const file = await fileRepo.getById(a.fileId);
      let reject = null, filePath = null;
      if (!file || path.basename(file.storedName) !== file.storedName) reject = 'The uploaded file record is missing.';
      else {
        filePath = path.join(storageDir, file.storedName);
        try { const st = await fs.stat(filePath); if (st.size !== file.size) reject = 'Stored file size differs from the upload record.'; }
        catch { reject = 'The stored file could not be found.'; }
      }
      if (reject) return await step('REJECTED', reject, { error: { code: 'VALIDATION_FAILED', message: reject } });

      await step('STATIC_ANALYSIS');
      const result = await runStatic({ filePath, file });

      let evidence = { modules: result.modules, findings: [...result.findings].sort(/* Compares two items for sorting. */ (x, y) => SEV[y.severity] - SEV[x.severity]), summary: result.summary };
      await step('AGGREGATING_EVIDENCE', null, { evidence });

      await step('ASSESSING_RISK');
      const assessment = assessRisk({ findings: evidence.findings, modules: evidence.modules, file });

      await step('AI_DECISION', null, { assessment });
      let ai = { status: 'not_configured', message: 'LLM integration not configured.', riskAssessment: null, reasoning: null, sandboxRecommended: null, keyConcerns: [], uncertainties: [] };
      try {
        const llmStatus = await integrations?.llm?.getStatus?.();
        if (llmStatus?.status === 'configured') {
          const raw = await integrations.llm.analyzeEvidence(minimizeEvidence({
            fileMetadata: { size: file.size, format: file.detected?.format, mime: file.detected?.mime, sha256: file.sha256 },
            staticEvidence: evidence, preliminaryAssessment: assessment, context: { phase: 'static_only' },
          }));
          const v = validateLlmResult(raw);
          if (!v.ok || raw.status !== 'completed') throw new Error('invalid LLM response');
          ai = { ...v.value, message: null };
        } else if (llmStatus?.status === 'unavailable') {
          ai = { ...ai, status: 'error', message: 'The configured LLM provider is unavailable; deterministic results are unaffected.' };
        }
      } catch (err) {

        log('error', 'llm_failed', { analysisId: id, error: 'provider_request_failed' });
        ai = { status: 'error', message: 'LLM analysis failed or returned invalid output; deterministic results are unaffected.', riskAssessment: null, reasoning: null, sandboxRecommended: null, keyConcerns: [], uncertainties: [] };
      }

      const aiWarrantsSandbox = ai.sandboxRecommended === true && (assessment.riskLevel !== 'low' || assessment.confidence === 'low'
        || ['moderate', 'high', 'very_high', 'insufficient_evidence'].includes(ai.riskAssessment));
      const sandboxPolicy = assessment.sandboxRecommended || aiWarrantsSandbox;
      let behavioral = { status: 'not_required', message: 'Policy did not require sandbox analysis.' };
      let finalAssessment = assessment;
      if (sandboxPolicy) {
        await step('SANDBOX_ANALYSIS');
        try {
          if ((await integrations?.sandbox?.getStatus?.())?.status === 'available') {
            const raw = await integrations.sandbox.run({ fileRef: filePath, timeoutMs: config.sandboxTimeoutMs || 30000 });
            if (raw && ['completed', 'timeout', 'failed', 'unavailable'].includes(raw.status)) {
              const behaviorData = safeBehaviorData(raw.behavioralEvidence);
              behavioral = { status: raw.status, message: typeof raw.message === 'string' ? raw.message.slice(0, 300) : null, behavioralEvidence: behaviorData,
                logs: Array.isArray(raw.logs) ? raw.logs.slice(0, 100).map(/* Transforms each item in the collection. */ (x) => String(x).slice(0, 2000)) : [],
                artifacts: Array.isArray(raw.artifacts) ? raw.artifacts.slice(0, 20).flatMap(/* Handles the callback for this operation. */ (x) => x && typeof x === 'object' && typeof x.name === 'string'
                  ? [{ name: x.name.slice(0, 200), size: Number.isSafeInteger(x.size) ? Math.max(0, Math.min(x.size, 10 * 1024 * 1024)) : null }] : []) : [] };
              const ev = raw.status === 'completed' ? safeBehaviorFindings(behaviorData) : [];
              if (raw.status === 'completed') {
                behavioral.findings = ev;
                evidence = { ...evidence, behavioralFindings: ev };
                finalAssessment = assessRisk({ findings: [...evidence.findings, ...ev], modules: evidence.modules, file });
                finalAssessment.limitations = finalAssessment.limitations.filter(/* Keeps items that match the condition. */ (x) => !x.startsWith('Behavioral (sandbox) analysis was not performed'));
                finalAssessment.evidenceSufficiency = 'combined_static_and_behavioral';
              }
            }
          } else behavioral = { status: 'unavailable', message: 'Sandbox integration is unavailable; no file was executed.' };
        } catch (err) {
          log('error', 'sandbox_failed', { analysisId: id, error: String(err.message).slice(0, 120) });
          behavioral = { status: 'failed', message: 'Sandbox analysis failed; no host execution was attempted.' };
        }
      } else {

        const stage = a.stages.find(/* Checks whether the item matches the lookup criteria. */ (s) => s.name === 'sandbox_analysis');
        if (stage) { stage.status = 'skipped'; stage.note = 'Policy did not require sandbox analysis.'; }
        a = await analysisRepo.update(id, { stages: a.stages });
      }
      await step('GENERATING_REPORT', null, { assessment: finalAssessment });
      const partial = evidence.summary.failed + evidence.summary.timeout > 0;
      const status = partial ? 'PARTIAL' : 'COMPLETED', now = iso();
      const report = buildReport({ analysisId: id, status, startedAt: a.startedAt, finishedAt: now, file, evidence, assessment: finalAssessment, now, ai, behavioral });
      await step(status, partial ? 'One or more modules failed; results are partial.' : null, { report });
    } catch (err) {
      log('error', 'analysis_failed', { analysisId: id, state: a.status, error: String(err.message).slice(0, 200) });
      if (!TERMINAL.includes(a.status)) {
        try { await step('FAILED', `Unexpected error during ${a.status}.`, { error: { code: 'ANALYSIS_ERROR', message: 'The analysis failed unexpectedly. You can retry it.' } }); }
        catch (e2) { log('error', 'analysis_fail_transition_failed', { analysisId: id, error: String(e2.message).slice(0, 200) }); }
      }
    }
  }

  return {

    // Starts the analysis job.
    start(fileId, { force = false } = {}) {
      return withLock(fileId,/* Handles the callback for this operation. */ async () => {
        const file = await fileRepo.getById(fileId);
        if (!file) throw new AppError(404, 'FILE_NOT_FOUND', 'No file with that ID.');
        if (file.fileDeleted) throw new AppError(409, 'FILE_DELETED', 'The stored file was deleted, so it cannot be analyzed.');
        const active = await analysisRepo.findActiveByFileId(fileId);
        if (active) return { analysis: active, created: false, reason: 'already_running' };
        if (!force) {
          const last = await analysisRepo.findLatestByFileId(fileId);
          if (last && ['COMPLETED', 'PARTIAL'].includes(last.status)) return { analysis: last, created: false, reason: 'already_completed' };
        }
        const now = iso();
        const analysis = await analysisRepo.create({
          id: newId(), fileId, status: 'UPLOADED', startedAt: now, finishedAt: null, stages: initialStages(now), error: null,
          file: { id: file.id, originalName: file.originalName, size: file.size, detected: file.detected, sha256: file.sha256, uploadedAt: file.uploadedAt },
          evidence: null, assessment: null, report: null,
        });
        jobs.enqueue(/* Handles the callback for this operation. */ () => execute(analysis.id));
        return { analysis, created: true, reason: null };
      });
    },

    // Recovers analyses interrupted by a previous run.
    async recoverInterrupted() {
      for (const a of await analysisRepo.listNonTerminal()) {
        const now = iso();
        await analysisRepo.update(a.id, { status: 'FAILED', finishedAt: now, stages: applyTransition(a.stages, 'FAILED', now, 'Backend restarted during analysis.'),
          error: { code: 'INTERRUPTED', message: 'The backend restarted during analysis. You can retry it.' } });
      }
    },
  };
}
