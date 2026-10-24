import { AppError } from '../middleware/error.middleware.js';
import { toPublic } from '../services/upload.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const filesController = (fileRepo) => ({
  list: async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
      const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '';
      const { items, total } = await fileRepo.list({ page, pageSize, search });
      res.json({ items: items.map(toPublic), total, page, pageSize });
    } catch (e) { next(e); }
  },
  get: async (req, res, next) => {
    try {
      if (!UUID.test(req.params.id)) throw new AppError(400, 'INVALID_ID', 'File ID must be a valid UUID.');
      const rec = await fileRepo.getById(req.params.id.toLowerCase());
      if (!rec) throw new AppError(404, 'FILE_NOT_FOUND', 'No file with that ID.');
      res.json({ file: toPublic(rec) });
    } catch (e) { next(e); }
  },
});
