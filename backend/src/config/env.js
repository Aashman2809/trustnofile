import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const config = {
  deploymentMode: (process.env.DEPLOYMENT_MODE || 'local').trim().toLowerCase(),
  awsRegion: process.env.AWS_REGION || '',
  awsStorageBucket: process.env.AWS_S3_BUCKET || '',
  analysisQueueUrl: process.env.ANALYSIS_QUEUE_URL || '',
  analysisQueueProvider: (process.env.ANALYSIS_QUEUE_PROVIDER || 'memory').trim().toLowerCase(),
  sandboxProvider: (process.env.SANDBOX_PROVIDER || 'docker').trim().toLowerCase(),
  batchJobQueue: process.env.SANDBOX_BATCH_JOB_QUEUE || '',
  batchJobDefinition: process.env.SANDBOX_BATCH_JOB_DEFINITION || '',
  version: '0.6.0',
  port: Number(process.env.PORT) || 4000,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 100,
  storageDir: path.resolve(process.env.STORAGE_DIR || path.join(root, 'storage/uploads')),
  storageProvider: (process.env.STORAGE_PROVIDER || 'local').trim().toLowerCase(),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'uploads',
  authRequired: process.env.AUTH_REQUIRED === 'true',
  authAllowedUserId: process.env.AUTH_ALLOWED_USER_ID || '',
  requireDatabase: process.env.REQUIRE_DATABASE === 'true',
  requireStorage: process.env.REQUIRE_STORAGE === 'true',
  hosted: process.env.DEPLOYMENT_MODE === 'aws' || process.env.NODE_ENV === 'production',
  trustProxy: process.env.TRUST_PROXY === 'true',
  dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data')),
  yaraPath: process.env.YARA_PATH || 'yara',
  yaraRulesDir: path.resolve(process.env.YARA_RULES_DIR || path.join(root, 'rules')),
  moduleTimeoutMs: Number(process.env.MODULE_TIMEOUT_MS) || 30000,
  sandboxTimeoutMs: Number(process.env.SANDBOX_TIMEOUT_MS) || 30000,
  sandboxWorkerUrl: (process.env.SANDBOX_WORKER_URL || '').trim().replace(/\/$/, ''),
  sandboxWorkerToken: process.env.SANDBOX_WORKER_TOKEN || '',
  sandboxWorkerPort: Number(process.env.SANDBOX_WORKER_PORT) || 4100,
  llm: {
    provider: (process.env.LLM_PROVIDER || 'gemini').trim().toLowerCase(),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || '',
    timeoutMs: !process.env.LLM_TIMEOUT_MS?.trim() ? 15000 : Number(process.env.LLM_TIMEOUT_MS),
    timeoutValid: !process.env.LLM_TIMEOUT_MS?.trim()
      || (/^\d+$/.test(process.env.LLM_TIMEOUT_MS) && Number(process.env.LLM_TIMEOUT_MS) >= 1000 && Number(process.env.LLM_TIMEOUT_MS) <= 60000),
  },
};

export function validateRuntimeConfig() {
  if (!['local', 'aws'].includes(config.deploymentMode)) throw new Error('DEPLOYMENT_MODE must be local or aws.');
  if (config.deploymentMode === 'aws') {
    const missing = [];
    if (!config.awsRegion) missing.push('AWS_REGION');
    if (!config.awsStorageBucket) missing.push('AWS_S3_BUCKET');
    if (!config.analysisQueueUrl) missing.push('ANALYSIS_QUEUE_URL');
    if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
    if (process.env.DATABASE_SSL !== 'true') missing.push('DATABASE_SSL=true');
    if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') missing.push('DATABASE_SSL_REJECT_UNAUTHORIZED must not be false');
    if (!config.supabaseUrl || !config.supabaseAnonKey) missing.push('SUPABASE_URL/SUPABASE_ANON_KEY');
    if (!config.authRequired) missing.push('AUTH_REQUIRED=true');
    if (!config.authAllowedUserId) missing.push('AUTH_ALLOWED_USER_ID');
    if (!process.env.FRONTEND_ORIGIN || /localhost|127\.0\.0\.1/.test(config.frontendOrigin)) missing.push('FRONTEND_ORIGIN');
    if (!config.trustProxy) missing.push('TRUST_PROXY=true');
    if (!config.requireDatabase) missing.push('REQUIRE_DATABASE=true');
    if (!config.requireStorage) missing.push('REQUIRE_STORAGE=true');
    if (config.storageProvider !== 's3') missing.push('STORAGE_PROVIDER=s3');
    if (config.analysisQueueProvider !== 'sqs') missing.push('ANALYSIS_QUEUE_PROVIDER=sqs');
    if (!['batch', 'disabled'].includes(config.sandboxProvider)) missing.push('SANDBOX_PROVIDER=batch (or disabled)');
    if (config.sandboxProvider === 'batch' && (!config.batchJobQueue || !config.batchJobDefinition)) missing.push('SANDBOX_BATCH_JOB_QUEUE/SANDBOX_BATCH_JOB_DEFINITION');
    if (missing.length) throw new Error(`AWS deployment configuration is incomplete: ${missing.join(', ')}.`);
  }
}
