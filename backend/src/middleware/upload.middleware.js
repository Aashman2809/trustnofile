import fs from 'node:fs';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { AppError } from './error.middleware.js';

export function singleFileUpload() {
  fs.mkdirSync(config.storageDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: config.storageDir,
      filename: (_req, _file, cb) => cb(null, `${randomUUID()}.bin`), // server-generated; user name never touches disk
    }),
    limits: { fileSize: Math.floor(config.maxUploadMb * 1024 * 1024), files: 1, fields: 5, parts: 10 },
  }).single('file');
  return (req, res, next) => upload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', `File exceeds the ${config.maxUploadMb} MB limit.`));
    if (err instanceof multer.MulterError) return next(new AppError(400, 'BAD_UPLOAD', 'Invalid upload request.'));
    next(err);
  });
}
