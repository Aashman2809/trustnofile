import { AppError } from '../middleware/error.middleware.js';
import { isUuid } from '../utils/ids.js';
import { STATES } from '../services/analysis-states.js';
import { RISK_LEVELS } from '../services/risk-assessment.service.js';
import { toSummary } from '../services/report.service.js';
import { computeStats } from '../services/stats.service.js';

// Creates handlers for analysis API requests.
export const analysisController = ({ orchestrator, analysisRepo, persistence = 'local_json_development_store' }) => {

  // Loads load operation.
  const load = async (id) => {
    if (!isUuid(id)) throw new AppError(400, 'INVALID_ID', 'Analysis ID must be a valid UUID.');
    const a = await analysisRepo.getById(id.toLowerCase());
    if (!a) throw new AppError(404, 'ANALYSIS_NOT_FOUND', 'No analysis with that ID.');
    return a;
  };
  return {
    load,

    // Starts the analysis job.
    start: async (req, res, next) => {
      try {
        if (!isUuid(req.params.id)) throw new AppError(400, 'INVALID_ID', 'File ID must be a valid UUID.');
        const r = await orchestrator.start(req.params.id.toLowerCase(), { force: req.body?.force === true });
        res.status(r.created ? 202 : 200).json({ analysis: toSummary(r.analysis), created: r.created, reason: r.reason });
      } catch (e) { next(e); }
    },

    // Lists matching stored records.
    list: async (req, res, next) => {
      try {
        const { status, risk, sort } = req.query;
        if (status && !STATES.includes(status)) throw new AppError(400, 'INVALID_QUERY', `status must be one of: ${STATES.join(', ')}`);
        if (risk && !RISK_LEVELS.includes(risk)) throw new AppError(400, 'INVALID_QUERY', `risk must be one of: ${RISK_LEVELS.join(', ')}`);
        if (sort && !['asc', 'desc'].includes(sort)) throw new AppError(400, 'INVALID_QUERY', 'sort must be asc or desc.');
        if (req.query.fileId && !isUuid(req.query.fileId)) throw new AppError(400, 'INVALID_QUERY', 'fileId must be a valid UUID.');
        const page = Math.max(1, parseInt(req.query.page, 10) || 1), pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
        const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '';
        const { items, total } = await analysisRepo.list({ page, pageSize, status, risk, search, fileId: req.query.fileId, sort });
        res.json({ items: items.map(toSummary), total, page, pageSize });
      } catch (e) { next(e); }
    },

    // Calculates stats operation.
    stats: async (_req, res, next) => {
      try {
        const { items } = await analysisRepo.list({ page: 1, pageSize: Number.MAX_SAFE_INTEGER });
        const s = computeStats(items);
        res.json({ ...s, recent: s.recent.map(toSummary), persistence });
      } catch (e) { next(e); }
    },

    // Gets a stored record by ID.
    get: async (req, res, next) => { try { res.json({ analysis: toSummary(await load(req.params.id)) }); } catch (e) { next(e); } },

    // Builds evidence operation.
    evidence: async (req, res, next) => {
      try {
        const a = await load(req.params.id);
        if (!a.evidence) throw new AppError(409, 'EVIDENCE_NOT_AVAILABLE', `No evidence available (status: ${a.status}).`);
        res.json({ analysisId: a.id, status: a.status, evidence: a.evidence });
      } catch (e) { next(e); }
    },
  };
};
