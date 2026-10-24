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

const SEV = { high: 3, medium: 2, low: 1, info: 0 };
const iso = () => new Date().toISOString();

export function createOrchestrator({ fileRepo, analysisRepo, jobs, runStatic = runStaticAnalysis, storageDir = config.storageDir }) {
  const locks = new Map();
  const withLock = (key, fn) => {
    const next = (locks.get(key) || Promise.resolve()).catch(() => {}).then(fn);
    locks.set(key, next);
    next.finally(() => { if (locks.get(key) === next) locks.delete(key); }).catch(() => {});
    return next;
  };

  async function execute(id) {
    let a = await analysisRepo.getById(id);
    const t0 = Date.now();
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

      const evidence = { modules: result.modules, findings: [...result.findings].sort((x, y) => SEV[y.severity] - SEV[x.severity]), summary: result.summary };
      await step('AGGREGATING_EVIDENCE', null, { evidence });

      await step('ASSESSING_RISK');
      const assessment = assessRisk({ findings: evidence.findings, modules: evidence.modules, file });

      await step('GENERATING_REPORT', null, { assessment });
      const partial = evidence.summary.failed + evidence.summary.timeout > 0;
      const status = partial ? 'PARTIAL' : 'COMPLETED', now = iso();
      const report = buildReport({ analysisId: id, status, startedAt: a.startedAt, finishedAt: now, file, evidence, assessment, now });
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
    // Returns the existing analysis instead of duplicating work, unless force is set.
    start(fileId, { force = false } = {}) {
      return withLock(fileId, async () => {
        const file = await fileRepo.getById(fileId);
        if (!file) throw new AppError(404, 'FILE_NOT_FOUND', 'No file with that ID.');
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
        jobs.enqueue(() => execute(analysis.id));
        return { analysis, created: true, reason: null };
      });
    },
    // In-process jobs die with the process; mark anything left mid-flight as failed on startup.
    async recoverInterrupted() {
      for (const a of await analysisRepo.listNonTerminal()) {
        const now = iso();
        await analysisRepo.update(a.id, { status: 'FAILED', finishedAt: now, stages: applyTransition(a.stages, 'FAILED', now, 'Backend restarted during analysis.'),
          error: { code: 'INTERRUPTED', message: 'The backend restarted during analysis. You can retry it.' } });
      }
    },
  };
}
