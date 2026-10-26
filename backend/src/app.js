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
  let repositories = null;
  let persistence = 'local_json_development_store';
  let activeDatabaseStatus = null;
  try {
    const dbStatus = await integrations.database.getStatus();
    if (dbStatus.status === 'connected' && typeof integrations.database.createRepositories === 'function') {
      const candidate = await integrations.database.createRepositories();
      const required = { fileRepo: ['create', 'getById', 'update', 'remove', 'findBySha256', 'list'], analysisRepo: ['create', 'getById', 'update', 'list', 'findActiveByFileId', 'findLatestByFileId', 'listNonTerminal', 'removeByFileId', 'markFileDeleted'] };
      for (const [repo, methods] of Object.entries(required)) for (const method of methods) {
        if (typeof candidate?.[repo]?.[method] !== 'function') throw new Error(`Database ${repo} is missing ${method}`);
      }
      repositories = candidate;
      persistence = 'postgresql';
    } else activeDatabaseStatus = dbStatus.status === 'connected' ? { status: 'unavailable', active: 'local_json_development_store' } : dbStatus;
  } catch { activeDatabaseStatus = { status: 'unavailable', active: 'local_json_development_store' }; }
  const fileRepo = repositories?.fileRepo || await createLocalFileRepository(config.dataDir);
  const analysisRepo = repositories?.analysisRepo || await createLocalAnalysisRepository(config.dataDir);
  const jobs = createInProcessJobManager();
  const orchestrator = createOrchestrator({ fileRepo, analysisRepo, jobs, integrations });
  await orchestrator.recoverInterrupted();
  const uploadService = createUploadService({ fileRepo });
  const duplicateService = createDuplicateService({ fileRepo, analysisRepo });
  const deletionService = createDeletionService({ fileRepo, analysisRepo });
  const analysisController = makeAnalysisController({ orchestrator, analysisRepo, persistence });
  const reportController = makeReportController({ load: analysisController.load });

  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.frontendOrigin, methods: ['GET', 'POST', 'DELETE'] }));
  app.use(rateLimit({ windowMs: 60_000, limit: 300 }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createHealthRouter({ integrations, persistence,
    databaseStatus: persistence === 'postgresql' ? () => integrations.database.getStatus() : async () => activeDatabaseStatus || await integrations.database.getStatus() }));
  app.use('/api/files', createFilesRouter({ fileRepo, uploadService, duplicateService, deletionService, analysisController }));
  app.use('/api/analyses', createAnalysisRouter({ analysisController, reportController }));
  app.use(notFound);
  app.use(errorHandler);
  app.locals.jobs = jobs; // exposed for tests
  app.locals.persistence = persistence;
  return app;
}
