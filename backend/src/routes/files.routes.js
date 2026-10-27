import { Router } from 'express';
import { singleFileUpload } from '../middleware/upload.middleware.js';
import { uploadController } from '../controllers/upload.controller.js';
import { filesController } from '../controllers/files.controller.js';

// Creates files router.
export function createFilesRouter({ fileRepo, uploadService, duplicateService, deletionService, analysisController }) {
  const r = Router();
  const c = filesController(fileRepo, deletionService);
  r.post('/', singleFileUpload(), uploadController(uploadService, duplicateService));
  r.get('/', c.list);
  r.get('/:id', c.get);
  r.delete('/:id', c.remove);
  r.post('/:id/analyze', analysisController.start);
  return r;
}
