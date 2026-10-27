import fs from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from '../analysis/hashing.js';
import { validateType } from './validation.service.js';
import { AppError } from '../middleware/error.middleware.js';

// Normalizes an uploaded filename.
export function sanitizeFilename(raw) {

  const name = path.basename(Buffer.from(String(raw || ''), 'latin1').toString('utf8').replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/^\.+/, '').trim().slice(0, 200);
  return name || 'unnamed';
}

// Converts a stored file record to its public representation.
export const toPublic = ({ storedName, ...rest }) => rest;

// Creates the file upload service.
export function createUploadService({ fileRepo, storage = { put:/* Stores an object key for tests without configured storage. */ async (_path, key) => key } }) {
  return {

    // Processes process operation.
    async process(file) {
      try {
        if (!file) throw new AppError(400, 'NO_FILE', 'No file was provided in the "file" field.');
        if (file.size === 0) throw new AppError(400, 'EMPTY_FILE', 'The uploaded file is empty.');
        const originalName = sanitizeFilename(file.originalname);
        const basename = path.basename(originalName).toLowerCase();
        const dotfileTypes = { '.env': 'env', '.bashrc': 'bash', '.zshrc': 'zsh', '.profile': 'shell', '.gitignore': 'config', '.npmrc': 'config', '.editorconfig': 'ini' };
        const declaredExt = path.extname(originalName).slice(1).toLowerCase() || dotfileTypes[basename] || '';
        const [hashes, verdict] = await Promise.all([hashFile(file.path), validateType(file.path, declaredExt, file.size)]);
        if (!verdict.accepted) throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', verdict.reason);
        const record = {
          id: path.basename(file.filename, '.bin'), storedName: file.filename, originalName,
          size: file.size, extension: declaredExt, declaredMime: file.mimetype || null,
          detected: verdict.detected, typeMismatch: verdict.mismatch,
          sha256: hashes.sha256, md5: hashes.md5,
          status: 'UPLOADED', uploadedAt: new Date().toISOString(),
        };
        await storage.put(file.path, record.storedName, file.mimetype || 'application/octet-stream');
        try { await fileRepo.create(record); }
        catch (error) { await storage.delete?.(record.storedName).catch(/* Ignores cleanup failure while preserving the database error. */ () => {}); throw error; }
        await storage.cleanupUpload?.(file.path, record.storedName).catch(/* Keeps a successful object upload successful if temp cleanup fails. */ () => {});
        return toPublic(record);
      } catch (err) {
        if (file?.path) await fs.rm(file.path, { force: true });
        throw err;
      }
    },
  };
}
