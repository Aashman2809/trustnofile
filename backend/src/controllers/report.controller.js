import { AppError } from '../middleware/error.middleware.js';

// Creates handlers for report API requests.
export const reportController = ({ load }) => {

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
  };
};
