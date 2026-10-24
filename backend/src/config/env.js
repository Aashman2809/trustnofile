import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const config = {
  version: '0.2.0',
  port: Number(process.env.PORT) || 4000,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 100,
  storageDir: path.resolve(process.env.STORAGE_DIR || path.join(root, 'storage/uploads')),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data')),
};
