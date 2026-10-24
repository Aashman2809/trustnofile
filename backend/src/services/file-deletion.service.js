import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../middleware/error.middleware.js';
import { config } from '../config/env.js';

// Default: delete the stored bytes, keep the records (flagged "file deleted"). purge: remove records too.
export function createDeletionService({ fileRepo, analysisRepo, storageDir = config.storageDir }) {
  return {
    async remove(id, { purge = false } = {}) {
      const file = await fileRepo.getById(id);
      if (!file) throw new AppError(404, 'FILE_NOT_FOUND', 'No file with that ID.');
      if (await analysisRepo.findActiveByFileId(id)) throw new AppError(409, 'ANALYSIS_IN_PROGRESS', 'An analysis is running for this file. Try again when it finishes.');
      if (path.basename(file.storedName) === file.storedName) await fs.rm(path.join(storageDir, file.storedName), { force: true });
      if (purge) { await analysisRepo.removeByFileId(id); await fileRepo.remove(id); }
      else { await fileRepo.update(id, { fileDeleted: true, deletedAt: new Date().toISOString() }); await analysisRepo.markFileDeleted(id); }
      return { id, fileDeleted: true, purged: purge };
    },
  };
}
