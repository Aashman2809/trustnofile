import fs from 'node:fs/promises';
import { shannon } from './entropy.js';

// Parses pe.
export async function parsePE(filePath) {
  const fh = await fs.open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    const head = Buffer.alloc(65536);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    const b = head.subarray(0, bytesRead);
    if (b.length < 64 || b.readUInt16LE(0) !== 0x5a4d) return { valid: false, reason: 'Missing DOS (MZ) header' };
    const pe = b.readUInt32LE(0x3c);
    if (pe < 64 || pe + 24 > b.length || pe + 24 > size || b.readUInt32LE(pe) !== 0x00004550) return { valid: false, reason: 'PE header not found at the offset given by e_lfanew' };
    const nSec = b.readUInt16LE(pe + 6), ts = b.readUInt32LE(pe + 8), optSize = b.readUInt16LE(pe + 20);
    const opt = pe + 24;
    if (opt + optSize > b.length || opt + optSize > size || optSize < 2) return { valid: false, reason: 'Truncated optional header' };
    const magic = b.readUInt16LE(opt);
    if (magic !== 0x10b && magic !== 0x20b) return { valid: false, reason: 'Unsupported PE optional-header format' };
    const plus = magic === 0x20b;
    const minOptSize = plus ? 112 : 96;
    if (optSize < minOptSize) return { valid: false, reason: 'Optional header is shorter than its declared PE format' };
    const sectionTable = opt + optSize;
    if (sectionTable + nSec * 40 > size) return { valid: false, reason: 'Section table extends beyond the file' };
    if (sectionTable + Math.min(nSec, 96) * 40 > b.length) return { valid: false, reason: 'Section table extends beyond the inspected header limit' };
    const info = { valid: true, complete: nSec <= 96, machine: '0x' + b.readUInt16LE(pe + 4).toString(16), format: plus ? 'PE32+' : 'PE32',
      timestamp: ts ? new Date(ts * 1000).toISOString() : null, subsystem: optSize >= 70 ? b.readUInt16LE(opt + 68) : null,
      certificateTableSize: 0, sections: [], sectionLimit: 96 };
    const dd = opt + (plus ? 112 : 96);
    const nDirs = b.readUInt32LE(opt + (plus ? 108 : 92));
    if (nDirs > 4) {
      if (dd + 40 > opt + optSize) return { valid: false, reason: 'Certificate directory is outside the optional header' };
      const certOffset = b.readUInt32LE(dd + 32);
      info.certificateTableSize = b.readUInt32LE(dd + 36);
      if (info.certificateTableSize && (certOffset > size || info.certificateTableSize > size - certOffset)) return { valid: false, reason: 'Certificate table extends beyond the file' };
    }
    let s = sectionTable;
    for (let i = 0; i < Math.min(nSec, 96) && s + 40 <= b.length; i++, s += 40) {
      const name = b.toString('latin1', s, s + 8).replace(/\0.*$/, '').replace(/[^\x20-\x7e]/g, '?');
      const raw = b.readUInt32LE(s + 16), ptr = b.readUInt32LE(s + 20), chars = b.readUInt32LE(s + 36);
      if (raw && (ptr > size || raw > size - ptr)) return { valid: false, reason: `Section ${i} raw data extends beyond the file` };
      let entropy = null;
      if (raw > 0) {
        const buf = Buffer.alloc(Math.min(raw, 1048576));
        const r = await fh.read(buf, 0, buf.length, ptr);
        if (r.bytesRead) entropy = +shannon(buf.subarray(0, r.bytesRead)).toFixed(3);
      }
      info.sections.push({ name, rawSize: raw, executable: !!(chars & 0x20000000), entropy });
    }
    return info;
  } finally { await fh.close(); }
}
