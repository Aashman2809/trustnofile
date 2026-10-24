import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
// Streams the file; never loads it fully into memory. MD5 is for external lookups only, not integrity.
export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const sha256 = createHash('sha256');
    const md5 = createHash('md5');
    createReadStream(filePath)
      .on('data', (c) => { sha256.update(c); md5.update(c); })
      .on('error', reject)
      .on('end', () => resolve({ sha256: sha256.digest('hex'), md5: md5.digest('hex') }));
  });
}
