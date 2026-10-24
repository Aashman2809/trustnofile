import fs from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from '../analysis/hashing.js';
import { validateType } from './validation.service.js';
import { AppError } from '../middleware/error.middleware.js';

export function sanitizeFilename(raw) {
  // Multer decodes names as latin1; recover UTF-8, drop paths, control chars and reserved chars.
  const name = path.basename(Buffer.from(String(raw || ''), 'latin1').toString('utf8').replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/^\.+/, '').trim().slice(0, 200);
  return name || 'unnamed';
}

export const toPublic = ({ storedName, ...rest }) => rest; // never expose storage internals

export function createUploadService({ fileRepo }) {
  return {
    async process(file) {
      try {
        if (!file) throw new AppError(400, 'NO_FILE', 'No file was provided in the "file" field.');
        if (file.size === 0) throw new AppError(400, 'EMPTY_FILE', 'The uploaded file is empty.');
        const originalName = sanitizeFilename(file.originalname);
        const declaredExt = path.extname(originalName).slice(1).toLowerCase();
        const [hashes, verdict] = await Promise.all([hashFile(file.path), validateType(file.path, declaredExt, file.size)]);
        if (!verdict.accepted) throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', verdict.reason);
        const record = {
          id: path.basename(file.filename, '.bin'), storedName: file.filename, originalName,
          size: file.size, extension: declaredExt, declaredMime: file.mimetype || null,
          detected: verdict.detected, typeMismatch: verdict.mismatch,
          sha256: hashes.sha256, md5: hashes.md5,
          status: 'UPLOADED', uploadedAt: new Date().toISOString(),
        };
        await fileRepo.create(record);
        return toPublic(record);
      } catch (err) {
        if (file?.path) await fs.rm(file.path, { force: true }); // no orphaned uploads
        throw err;
      }
    },
  };
}
