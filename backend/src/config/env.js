import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const config = {
  version: '0.6.0',
  port: Number(process.env.PORT) || 4000,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 100,
  storageDir: path.resolve(process.env.STORAGE_DIR || path.join(root, 'storage/uploads')),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data')),
  yaraPath: process.env.YARA_PATH || 'yara',
  yaraRulesDir: path.resolve(process.env.YARA_RULES_DIR || path.join(root, 'rules')),
  moduleTimeoutMs: Number(process.env.MODULE_TIMEOUT_MS) || 30000,
  sandboxTimeoutMs: Number(process.env.SANDBOX_TIMEOUT_MS) || 30000,
  llm: {
    provider: (process.env.LLM_PROVIDER || 'gemini').trim().toLowerCase(),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || '',
    timeoutMs: !process.env.LLM_TIMEOUT_MS?.trim() ? 15000 : Number(process.env.LLM_TIMEOUT_MS),
    timeoutValid: !process.env.LLM_TIMEOUT_MS?.trim()
      || (/^\d+$/.test(process.env.LLM_TIMEOUT_MS) && Number(process.env.LLM_TIMEOUT_MS) >= 1000 && Number(process.env.LLM_TIMEOUT_MS) <= 60000),
  },
};
