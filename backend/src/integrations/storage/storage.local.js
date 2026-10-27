import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config/env.js';

// Creates local filesystem object storage.
export function createLocalObjectStorage({ storageDir = config.storageDir } = {}) {
  return {
    // Stores an uploaded file under its generated object key.
    async put(localPath, objectKey) {
      const destination = path.join(storageDir, path.basename(objectKey));
      if (path.resolve(localPath) !== path.resolve(destination)) {
        await fs.mkdir(storageDir, { recursive: true });
        await fs.copyFile(localPath, destination);
      }
      return objectKey;
    },
    // Removes the temporary upload when it differs from the stored copy.
    async cleanupUpload(localPath, objectKey) {
      const destination = path.join(storageDir, path.basename(objectKey));
      if (path.resolve(localPath) !== path.resolve(destination)) await fs.rm(localPath, { force: true });
    },
    // Provides a local file path for analysis.
    async materialize(objectKey) {
      return { filePath: path.join(storageDir, path.basename(objectKey)), cleanup:/* Keeps the local stored object in place. */ async () => {} };
    },
    // Removes a stored object.
    async delete(objectKey) {
      await fs.rm(path.join(storageDir, path.basename(objectKey)), { force: true });
    },
    // Reports the selected object storage provider.
    async getStatus() {
      return { status: 'available', provider: 'local' };
    },
  };
}
