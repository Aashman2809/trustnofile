import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/env.js';
import { requestId } from './middleware/request-id.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createFilesRouter } from './routes/files.routes.js';
import { createAnalysisRouter } from './routes/analysis.routes.js';
import { createLocalFileRepository } from './repositories/local-file.repository.js';
import { createLocalAnalysisRepository } from './repositories/local-analysis.repository.js';
import { createUploadService } from './services/upload.service.js';
import { createDuplicateService } from './services/duplicate.service.js';
import { createDeletionService } from './services/file-deletion.service.js';
import { createInProcessJobManager } from './services/job-manager.js';
import { createOrchestrator } from './services/analysis-orchestrator.service.js';
import { createIntegrations } from './integrations/index.js';
import { analysisController as makeAnalysisController } from './controllers/analysis.controller.js';
import { reportController as makeReportController } from './controllers/report.controller.js';

export async function createApp({ integrations = createIntegrations() } = {}) {
  const fileRepo = await createLocalFileRepository(config.dataDir);
  const analysisRepo = await createLocalAnalysisRepository(config.dataDir);
  const jobs = createInProcessJobManager();
  const orchestrator = createOrchestrator({ fileRepo, analysisRepo, jobs, integrations });
  await orchestrator.recoverInterrupted();
  const uploadService = createUploadService({ fileRepo });
  const duplicateService = createDuplicateService({ fileRepo, analysisRepo });
  const deletionService = createDeletionService({ fileRepo, analysisRepo });
  const analysisController = makeAnalysisController({ orchestrator, analysisRepo });
  const reportController = makeReportController({ load: analysisController.load });

  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.frontendOrigin, methods: ['GET', 'POST', 'DELETE'] }));
  app.use(rateLimit({ windowMs: 60_000, limit: 300 }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createHealthRouter({ integrations }));
  app.use('/api/files', createFilesRouter({ fileRepo, uploadService, duplicateService, deletionService, analysisController }));
  app.use('/api/analyses', createAnalysisRouter({ analysisController, reportController }));
  app.use(notFound);
  app.use(errorHandler);
  app.locals.jobs = jobs; // exposed for tests
  return app;
}
