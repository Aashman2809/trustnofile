import { Router } from 'express';
// Creates analysis router.
export function createAnalysisRouter({ analysisController: a, reportController: r }) {
  const router = Router();
  router.get('/', a.list);
  router.get('/stats', a.stats);
  router.get('/:id', a.get);
  router.get('/:id/evidence', a.evidence);
  router.get('/:id/report', r.json);
  router.get('/:id/report.json', r.download);
  return router;
}
