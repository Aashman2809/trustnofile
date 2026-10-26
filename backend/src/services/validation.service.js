import fs from 'node:fs/promises';
import { identifyFile } from '../analysis/file-identification.js';
import { FORMATS, TEXT_EXTS } from '../config/limits.js';

const MAX_JSON_CHECK = 10 * 1024 * 1024;

// Returns { accepted, reason?, detected, mismatch }. Mismatch is flagged, not rejected:
// a mislabeled file is exactly what an analysis tool should accept and report on.
export async function validateType(filePath, declaredExt, size) {
  const id = await identifyFile(filePath);
  if (id.format === 'unknown') {
    return { accepted: false, reason: 'File type could not be identified or is not supported.' };
  }
  if (id.signature) {
    const policy = FORMATS[id.format];
    if (!policy) return { accepted: false, reason: `Detected format "${id.format}" is not supported.` };
    return { accepted: true, mismatch: !policy.family.includes(declaredExt),
      detected: { format: id.format, mime: id.mime, category: policy.category, signature: id.signatureName ?? null } };
  }
  let detected = { format: 'text', mime: 'text/plain', category: 'Plain text' };
  let mismatch = !TEXT_EXTS.includes(declaredExt);
  if (declaredExt === 'json' && size <= MAX_JSON_CHECK) {
    try {
      JSON.parse(await fs.readFile(filePath, 'utf8'));
      detected = { format: 'json', mime: 'application/json', category: 'JSON' };
    } catch { mismatch = true; }
  }
  return { accepted: true, mismatch, detected };
}
