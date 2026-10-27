import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../middleware/error.middleware.js';
import { config } from '../config/env.js';

// Creates the file deletion service.
export function createDeletionService({ fileRepo, analysisRepo, storage = null, storageDir = config.storageDir }) {
  const localStorage = {
    // Removes the object from local filesystem storage.
    async delete(storedName) { await fs.rm(path.join(storageDir, path.basename(storedName)), { force: true }); },
  };
  const objectStorage = storage || localStorage;
  return {

    // Removes a record or its stored file.
    async remove(id, { purge = false } = {}) {
      const file = await fileRepo.getById(id);
      if (!file) throw new AppError(404, 'FILE_NOT_FOUND', 'No file with that ID.');
      if (await analysisRepo.findActiveByFileId(id)) throw new AppError(409, 'ANALYSIS_IN_PROGRESS', 'An analysis is running for this file. Try again when it finishes.');
      if (path.basename(file.storedName) === file.storedName) await objectStorage.delete(file.storedName);
      if (purge) { await analysisRepo.removeByFileId(id); await fileRepo.remove(id); }
      else { await fileRepo.update(id, { fileDeleted: true, deletedAt: new Date().toISOString() }); await analysisRepo.markFileDeleted(id); }
      return { id, fileDeleted: true, purged: purge };
    },
  };
}
