import fs from 'node:fs/promises';

const LIMITS = { maxEntries: 10000, maxCentralDir: 64 * 1024 * 1024, maxTotalUncompressed: 1024 ** 3, ratio: 100, listedNames: 200 };
const ZIP_FAMILY = ['zip', 'docx', 'xlsx', 'pptx'];
const RISKY_EXT = ['exe', 'dll', 'scr', 'bat', 'cmd', 'ps1', 'vbs', 'js', 'jar', 'lnk', 'msi', 'hta'];
const NESTED_EXT = ['zip', 'rar', '7z', 'gz', 'tar', 'jar'];
const extOf = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');

// Reads ONLY the ZIP central directory. Nothing is decompressed or extracted.
export async function archiveModule({ filePath, file }) {
  if (!ZIP_FAMILY.includes(file.detected?.format)) return { status: 'skipped', reason: 'Not a ZIP-based format.', data: {}, findings: [] };
  const fh = await fs.open(filePath, 'r');
  const f = (code, title, severity, kind, description, evidence) => ({ code, title, severity, kind, description, evidence });
  try {
    const { size } = await fh.stat();
    const tail = Buffer.alloc(Math.min(size, 65557));
    await fh.read(tail, 0, tail.length, size - tail.length);
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) return { status: 'completed', data: {}, findings: [f('ARCHIVE_STRUCTURE_INVALID', 'ZIP end-of-central-directory record not found', 'medium', 'observed', 'The archive structure is damaged or deliberately malformed.', {})] };
    const total = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16);
    if (total === 0xffff || cdOff === 0xffffffff) return { status: 'completed', data: { zip64: true }, findings: [f('ARCHIVE_ZIP64_UNSUPPORTED', 'ZIP64 archive not inspected', 'info', 'observed', 'ZIP64 archives are not parsed by this module; contents are unknown.', {})] };
    if (cdSize > LIMITS.maxCentralDir || cdOff + cdSize > size) return { status: 'completed', data: {}, findings: [f('ARCHIVE_STRUCTURE_INVALID', 'Central directory size/offset invalid', 'medium', 'observed', 'The declared directory size or offset is out of bounds.', { cdSize, cdOff })] };
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOff);

    const entries = []; let p = 0, totalUnc = 0, truncated = false;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      if (entries.length >= LIMITS.maxEntries) { truncated = true; break; }
      const nLen = cd.readUInt16LE(p + 28), xLen = cd.readUInt16LE(p + 30), cLen = cd.readUInt16LE(p + 32);
      const e = { name: cd.toString('utf8', p + 46, p + 46 + nLen), encrypted: !!(cd.readUInt16LE(p + 8) & 1), compressed: cd.readUInt32LE(p + 20), declared: cd.readUInt32LE(p + 24) };
      entries.push(e); totalUnc += e.declared; p += 46 + nLen + xLen + cLen;
    }
    const bad = (pred) => entries.filter(pred).map((e) => e.name.slice(0, 200)).slice(0, 20);
    const traversal = bad((e) => e.name.split(/[\\/]/).includes('..') || /^([\\/]|[a-zA-Z]:)/.test(e.name));
    const risky = bad((e) => RISKY_EXT.includes(extOf(e.name)));
    const dbl = bad((e) => /\.(pdf|docx?|xlsx?|txt|jpg|png)\.(exe|scr|bat|cmd|js|vbs|ps1)$/i.test(e.name));
    const nested = bad((e) => NESTED_EXT.includes(extOf(e.name)));
    const ratio = entries.filter((e) => e.declared >= 1048576 && e.compressed > 0 && e.declared / e.compressed > LIMITS.ratio).slice(0, 20).map((e) => ({ name: e.name.slice(0, 200), ratio: Math.round(e.declared / e.compressed) }));
    const data = { entryCount: entries.length, truncated, totalDeclaredUncompressed: totalUnc, limits: LIMITS, extracted: false,
      entries: entries.slice(0, LIMITS.listedNames).map((e) => ({ name: e.name.slice(0, 200), compressedSize: e.compressed, declaredSize: e.declared, encrypted: e.encrypted })),
      note: 'Sizes are declared in the archive headers; entries were not decompressed.' };
    const out = [];
    if (traversal.length) out.push(f('ARCHIVE_PATH_TRAVERSAL', 'Entry names attempt path traversal', 'high', 'observed', 'Entries use ".." or absolute paths, which can overwrite files if extracted naively.', { entries: traversal }));
    if (ratio.length || totalUnc > LIMITS.maxTotalUncompressed) out.push(f('ARCHIVE_COMPRESSION_ANOMALY', 'Extreme declared compression ratio or size', 'medium', 'heuristic', 'Declared sizes are consistent with a decompression bomb, though they may be benign or forged.', { entries: ratio, totalDeclaredUncompressed: totalUnc }));
    if (dbl.length) out.push(f('ARCHIVE_DOUBLE_EXTENSION', 'Executable disguised with a document-like extension', 'medium', 'heuristic', 'Names such as "file.pdf.exe" are a common disguise technique.', { entries: dbl }));
    if (risky.length) out.push(f('ARCHIVE_EXECUTABLE_CONTENT', 'Archive contains executable or script files', 'low', 'observed', 'Entries have extensions commonly associated with executable content.', { entries: risky }));
    if (nested.length) out.push(f('ARCHIVE_NESTED', 'Nested archives present', 'low', 'observed', 'Nested archives are not recursively inspected.', { entries: nested }));
    if (entries.some((e) => e.encrypted)) out.push(f('ARCHIVE_ENCRYPTED_ENTRIES', 'Encrypted entries present', 'low', 'observed', 'Encrypted content cannot be inspected.', {}));
    if (entries.some((e) => e.name.toLowerCase().endsWith('vbaproject.bin'))) out.push(f('OFFICE_MACROS_PRESENT', 'Office document contains a VBA project', 'medium', 'heuristic', 'Macros are common in legitimate documents but are a frequent malware delivery mechanism.', {}));
    if (truncated) out.push(f('ARCHIVE_ENTRY_LIMIT', 'Entry limit reached', 'info', 'observed', 'Only the first entries were inspected.', { limit: LIMITS.maxEntries }));
    return { status: 'completed', data, findings: out };
  } finally { await fh.close(); }
}
