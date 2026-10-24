import { hashFile } from './hashing.js';
// Re-hashes from disk and compares with the upload-time record (integrity check).
export async function hashingModule({ filePath, file }) {
  const h = await hashFile(filePath);
  const findings = [];
  if (file.sha256 && h.sha256 !== file.sha256) {
    findings.push({ code: 'HASH_MISMATCH', title: 'Stored file hash changed since upload', severity: 'high', kind: 'observed',
      description: 'The SHA-256 computed now differs from the hash recorded at upload.', evidence: { recorded: file.sha256, current: h.sha256 } });
  }
  return { status: 'completed', data: { sha256: h.sha256, md5: h.md5, note: 'SHA-256 is the primary identifier. MD5 is for external lookups only.' }, findings };
}
