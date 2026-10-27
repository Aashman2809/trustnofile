import { AppError } from '../middleware/error.middleware.js';

// Creates handlers for report API requests.
export const reportController = ({ load, integrations }) => {

  // Gets report.
  const getReport = async (id) => {
    const a = await load(id);
    if (!a.report) throw new AppError(409, 'REPORT_NOT_AVAILABLE', `No report available (status: ${a.status}).`);
    return a.report;
  };
  return {

    // Parses json operation.
    json: async (req, res, next) => { try { res.json({ report: await getReport(req.params.id) }); } catch (e) { next(e); } },

    // Downloads download operation.
    download: async (req, res, next) => {
      try {
        const report = await getReport(req.params.id);
        res.setHeader('Content-Disposition', `attachment; filename="trustnofile-report-${report.analysis.id}.json"`);
        res.type('application/json').send(JSON.stringify(report, null, 2));
      } catch (e) { next(e); }
    },

    // Handles interactive analyst Q&A about this report.
    chat: async (req, res, next) => {
      try {
        const report = await getReport(req.params.id);
        const { question, history } = req.body || {};
        if (!question || typeof question !== 'string') {
          throw new AppError(400, 'INVALID_REQUEST', 'Question string is required.');
        }
        const llmStatus = await integrations?.llm?.getStatus?.();
        if (llmStatus?.status !== 'configured') {
          throw new AppError(503, 'LLM_NOT_CONFIGURED', 'AI Copilot is not configured or unavailable.');
        }
        const answer = await integrations.llm.chat({ report, question, history });
        res.json(answer);
      } catch (e) { next(e); }
    },
  };
};
