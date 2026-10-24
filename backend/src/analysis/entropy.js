import { createReadStream } from 'node:fs';
const BLOCK = 65536;
const COMPRESSED = ['zip', 'docx', 'xlsx', 'pptx'];

export function shannon(buf) {
  if (!buf.length) return 0;
  const c = new Array(256).fill(0);
  for (const b of buf) c[b]++;
  let h = 0;
  for (const n of c) if (n) { const p = n / buf.length; h -= p * Math.log2(p); }
  return h;
}

export async function entropyModule({ filePath, file }) {
  const counts = new Array(256).fill(0);
  let total = 0, maxBlock = 0, pending = Buffer.alloc(0);
  for await (const chunk of createReadStream(filePath)) {
    for (const b of chunk) counts[b]++;
    total += chunk.length;
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= BLOCK) { maxBlock = Math.max(maxBlock, shannon(pending.subarray(0, BLOCK))); pending = pending.subarray(BLOCK); }
  }
  if (pending.length >= 4096) maxBlock = Math.max(maxBlock, shannon(pending));
  let h = 0;
  for (const n of counts) if (n) { const p = n / total; h -= p * Math.log2(p); }
  const data = { overall: +h.toFixed(4), maxBlock: +maxBlock.toFixed(4), blockSize: BLOCK, bytes: total, method: 'Shannon entropy over all bytes (bits/byte, max 8) plus highest 64 KB block',
    limitations: 'High entropy occurs in compressed, encrypted and ordinary binary data. It is not a malware verdict.' };
  const findings = [];
  if (total >= 1024 && h >= 7.5 && !COMPRESSED.includes(file.detected?.format)) {
    findings.push({ code: 'HIGH_ENTROPY', title: 'High measured entropy', severity: 'low', kind: 'heuristic',
      description: 'The file content has elevated entropy, which may indicate packing, compression or encryption (or normal binary data).',
      evidence: { overall: data.overall, threshold: 7.5 } });
  }
  return { status: 'completed', data, findings };
}
