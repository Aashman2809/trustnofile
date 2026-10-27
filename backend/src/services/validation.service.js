import fs from 'node:fs/promises';
import { identifyFile } from '../analysis/file-identification.js';
import { FORMATS, TEXT_EXTS, TEXT_FORMATS } from '../config/limits.js';

const MAX_JSON_CHECK = 10 * 1024 * 1024;

// Checks whether the file type is supported.
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
  if (['html', 'xml', 'svg'].includes(id.format)) {
    const policy = TEXT_FORMATS[id.format] || Object.values(TEXT_FORMATS).find(/* Checks whether the item matches the lookup criteria. */ (x) => x.format === id.format);
    const family = id.format === 'html' ? ['html', 'htm', 'xhtml'] : [id.format];
    return { accepted: true, mismatch: !family.includes(declaredExt), detected: { format: id.format, mime: id.mime, category: policy?.category || `${id.format.toUpperCase()} document`, signature: id.signatureName } };
  }
  let detected = { format: 'text', mime: 'text/plain', category: 'Plain text' };
  let mismatch = !TEXT_EXTS.includes(declaredExt);
  if (size <= MAX_JSON_CHECK) {
    let content = '';
    try {
      content = await fs.readFile(filePath, 'utf8');
      if (declaredExt === 'json' || /^\s*[\[{]/.test(content)) {
        JSON.parse(content);
        detected = { format: 'json', mime: 'application/json', category: 'JSON' };
        mismatch = declaredExt !== 'json';
      }
    } catch { if (declaredExt === 'json' || /^\s*[\[{]/.test(content)) mismatch = true; }
  }
  if (detected.format !== 'json' && declaredExt !== 'json' && TEXT_FORMATS[declaredExt]) {
    const hint = TEXT_FORMATS[declaredExt];
    detected = { format: hint.format, mime: hint.mime, category: hint.category, identification: 'UTF-8 text with extension-based format hint' };
    mismatch = false;
  }
  if (detected.format === 'json' && declaredExt === 'json') mismatch = false;
  return { accepted: true, mismatch, detected };
}
