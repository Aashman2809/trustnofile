import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

// Calculates the file SHA-256 digest.
export function hashFile(filePath) {
  return new Promise(/* Handles the callback for this operation. */ (resolve, reject) => {
    const sha256 = createHash('sha256');
    const md5 = createHash('md5');
    createReadStream(filePath)
      .on('data',/* Handles the registered event. */ (c) => { sha256.update(c); md5.update(c); })
      .on('error', reject)
      .on('end',/* Handles the registered event. */ () => resolve({ sha256: sha256.digest('hex'), md5: md5.digest('hex') }));
  });
}
