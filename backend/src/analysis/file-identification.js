import fs from 'node:fs/promises';
import { fileTypeFromFile } from 'file-type';

async function readHead(filePath, n = 65536) {
  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally { await fh.close(); }
}

function looksLikeText(head) {
  if (head.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(head); return true; } catch { return false; }
}

// Signature-based identification. Never trusts the browser MIME type or extension.
export async function identifyFile(filePath) {
  const ft = await fileTypeFromFile(filePath);
  if (ft) return { format: ft.ext, mime: ft.mime, signature: true };
  const head = await readHead(filePath);
  if (looksLikeText(head)) return { format: 'text', mime: 'text/plain', signature: false };
  return { format: 'unknown', mime: 'application/octet-stream', signature: false };
}
