import { Router } from 'express';
import { singleFileUpload } from '../middleware/upload.middleware.js';
import { uploadController } from '../controllers/upload.controller.js';
import { filesController } from '../controllers/files.controller.js';

export function createFilesRouter({ fileRepo, uploadService, analysisController }) {
  const r = Router();
  const c = filesController(fileRepo);
  r.post('/', singleFileUpload(), uploadController(uploadService));
  r.get('/', c.list);
  r.get('/:id', c.get);
  r.post('/:id/analyze', analysisController.start);
  return r;
}
