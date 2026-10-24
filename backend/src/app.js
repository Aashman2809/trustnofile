import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { requestId } from './middleware/request-id.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import health from './routes/health.routes.js';
import { createFilesRouter } from './routes/files.routes.js';
import { createLocalFileRepository } from './repositories/local-file.repository.js';
import { createUploadService } from './services/upload.service.js';

export async function createApp() {
  const fileRepo = await createLocalFileRepository(config.dataDir);
  const uploadService = createUploadService({ fileRepo });
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.frontendOrigin }));
  app.use(rateLimit({ windowMs: 60_000, limit: 300 }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', health);
  app.use('/api/files', createFilesRouter({ fileRepo, uploadService }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
