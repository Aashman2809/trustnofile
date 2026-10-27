import fs from 'node:fs/promises';

const LIMITS = { maxEntries: 10000, maxCentralDir: 64 * 1024 * 1024, maxTotalUncompressed: 1024 ** 3, ratio: 100, listedNames: 200, localHeaders: 256 };
const ZIP_FAMILY = ['zip', 'docx', 'xlsx', 'pptx'];
const RISKY_EXT = ['exe', 'dll', 'scr', 'bat', 'cmd', 'ps1', 'vbs', 'js', 'jar', 'lnk', 'msi', 'hta'];
const NESTED_EXT = ['zip', 'rar', '7z', 'gz', 'tar', 'jar'];

// Returns the lowercase file extension.
const extOf = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');

// Inspects module.
export async function archiveModule({ filePath, file }) {
  if (!ZIP_FAMILY.includes(file.detected?.format)) return { status: 'skipped', reason: 'Not a ZIP-based format.', data: {}, findings: [] };
  const fh = await fs.open(filePath, 'r');

  // Handles f operation.
  const f = (code, title, severity, kind, description, evidence) => ({ code, title, severity, kind, description, evidence });
  try {
    const { size } = await fh.stat();
    const tail = Buffer.alloc(Math.min(size, 65557));
    await fh.read(tail, 0, tail.length, size - tail.length);
    const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    let eocd = tail.lastIndexOf(signature);
    while (eocd >= 0 && (eocd + 22 > tail.length || eocd + 22 + tail.readUInt16LE(eocd + 20) !== tail.length)) eocd = tail.lastIndexOf(signature, eocd - 1);
    if (eocd < 0) return { status: 'completed', data: {}, findings: [f('ARCHIVE_STRUCTURE_INVALID', 'ZIP end-of-central-directory record not found', 'medium', 'observed', 'The archive structure is damaged or deliberately malformed.', {})] };
    const disk = tail.readUInt16LE(eocd + 4), cdDisk = tail.readUInt16LE(eocd + 6), diskEntries = tail.readUInt16LE(eocd + 8);
    const total = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOff = tail.readUInt32LE(eocd + 16), commentLen = tail.readUInt16LE(eocd + 20);
    const eocdAbsolute = size - tail.length + eocd;
    if (eocd + 22 + commentLen !== tail.length || disk || cdDisk || diskEntries !== total)
      return { status: 'completed', data: {}, findings: [f('ARCHIVE_STRUCTURE_INVALID', 'ZIP end-of-directory fields are inconsistent', 'medium', 'observed', 'The ZIP comment length, disk fields, or entry counts are inconsistent.', {})] };
    if (total === 0xffff || diskEntries === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) return { status: 'completed', data: { zip64: true }, findings: [f('ARCHIVE_ZIP64_UNSUPPORTED', 'ZIP64 archive not inspected', 'info', 'observed', 'ZIP64 archives are not parsed by this module; contents are unknown.', {})] };
    if (cdSize > LIMITS.maxCentralDir) return { status: 'completed', data: { scanComplete: false, cdSize, limit: LIMITS.maxCentralDir }, findings: [f('ARCHIVE_ANALYSIS_INCOMPLETE', 'ZIP central directory exceeds the inspection limit', 'info', 'observed', 'The archive was not fully inspected because its central directory exceeds the 64 MB safety limit.', { cdSize, limit: LIMITS.maxCentralDir })] };
    const cdStart = eocdAbsolute - cdSize, archiveBase = cdStart - cdOff;
    if (cdStart < 0 || archiveBase < 0) return { status: 'completed', data: {}, findings: [f('ARCHIVE_STRUCTURE_INVALID', 'Central directory size/offset invalid', 'medium', 'observed', 'The declared directory size or offset is out of bounds.', { cdSize, cdOff })] };
    const cd = Buffer.alloc(cdSize);
    const cdRead = await fh.read(cd, 0, cdSize, cdStart);
    if (cdRead.bytesRead !== cdSize) return { status: 'completed', data: {}, findings: [f('ARCHIVE_STRUCTURE_INVALID', 'Central directory is truncated', 'medium', 'observed', 'The central directory could not be read in full.', {})] };

    const entries = []; let p = 0, totalUnc = 0, truncated = total > LIMITS.maxEntries, malformed = null;
    while (p < cd.length && entries.length < Math.min(total, LIMITS.maxEntries)) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) { malformed = 'Central directory entry header is invalid'; break; }
      if (entries.length >= LIMITS.maxEntries) { truncated = true; break; }
      const nLen = cd.readUInt16LE(p + 28), xLen = cd.readUInt16LE(p + 30), cLen = cd.readUInt16LE(p + 32);
      if (p + 46 + nLen + xLen + cLen > cd.length) { malformed = 'Central directory entry exceeds its declared bounds'; break; }
      const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10);
      const e = { name: cd.toString('utf8', p + 46, p + 46 + nLen), flags, method, crc: cd.readUInt32LE(p + 16), encrypted: !!(flags & 1), compressed: cd.readUInt32LE(p + 20), declared: cd.readUInt32LE(p + 24), localOffset: cd.readUInt32LE(p + 42) };
      entries.push(e); totalUnc += e.declared; p += 46 + nLen + xLen + cLen;
    }
    if (!malformed && total <= LIMITS.maxEntries && entries.length !== total) malformed = 'Central directory entry count does not match the end record';
    if (!malformed && total <= LIMITS.maxEntries && p !== cd.length) malformed = 'Central directory contains trailing or unparsed bytes';
    if (malformed) return { status: 'completed', data: { entryCount: entries.length, extracted: false }, findings: [f('ARCHIVE_STRUCTURE_INVALID', 'ZIP central directory is malformed', 'medium', 'observed', malformed, { entriesParsed: entries.length, declaredEntries: total })] };

    let localHeadersChecked = 0, localHeaderIssue = null;
    for (const entry of entries.slice(0, LIMITS.localHeaders)) {
      const localOffset = archiveBase + entry.localOffset;
      if (localOffset + 30 > size) { localHeaderIssue = 'Local file header offset is outside the file'; break; }
      const local = Buffer.alloc(30);
      const got = await fh.read(local, 0, local.length, localOffset);
      if (got.bytesRead !== local.length || local.readUInt32LE(0) !== 0x04034b50) { localHeaderIssue = 'Local file header is missing or truncated'; break; }
      const localFlags = local.readUInt16LE(6), localMethod = local.readUInt16LE(8);
      if (localFlags !== entry.flags || localMethod !== entry.method) { localHeaderIssue = 'Local and central directory flags or compression methods differ'; break; }
      const localNameLen = local.readUInt16LE(26), localExtraLen = local.readUInt16LE(28);
      const localDataStart = localOffset + 30 + localNameLen + localExtraLen;
      if (localDataStart > cdStart || entry.compressed > cdStart - localDataStart) { localHeaderIssue = 'Local file data extends beyond the central directory boundary'; break; }
      if (!(localFlags & 0x0008) && (local.readUInt32LE(14) !== entry.crc || local.readUInt32LE(18) !== entry.compressed || local.readUInt32LE(22) !== entry.declared)) { localHeaderIssue = 'Local and central directory sizes or CRC values differ'; break; }
      const localName = Buffer.alloc(localNameLen);
      const nameRead = await fh.read(localName, 0, localNameLen, localOffset + 30);
      if (nameRead.bytesRead !== localNameLen || localName.toString('utf8') !== entry.name) { localHeaderIssue = 'Local and central directory entry names differ'; break; }
      localHeadersChecked++;
    }
    if (localHeaderIssue) return { status: 'completed', data: { entryCount: entries.length, extracted: false }, findings: [f('ARCHIVE_STRUCTURE_INVALID', 'ZIP local and central headers disagree', 'medium', 'observed', localHeaderIssue, { checkedEntries: localHeadersChecked })] };
    const officeMain = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' }[file.detected?.format];
    const officeMissing = officeMain && (!entries.some(/* Checks for the OpenXML content-types part. */ (e) => e.name === '[Content_Types].xml') || !entries.some(/* Checks for the required Office document part. */ (e) => e.name === officeMain));
    const seenNames = new Set(), duplicateNames = [];
    for (const entry of entries) {
      if (seenNames.has(entry.name)) duplicateNames.push(entry.name.slice(0, 200));
      seenNames.add(entry.name);
    }

    // Creates bad operation.
    const bad = (pred) => entries.filter(pred).map(/* Transforms each item in the collection. */ (e) => e.name.slice(0, 200)).slice(0, 20);
    const traversal = bad(/* Creates the invalid test result. */ (e) => e.name.split(/[\\/]/).includes('..') || /^([\\/]|[a-zA-Z]:)/.test(e.name));
    const risky = bad(/* Creates the invalid test result. */ (e) => RISKY_EXT.includes(extOf(e.name)));
    const dbl = bad(/* Creates the invalid test result. */ (e) => /\.(pdf|docx?|xlsx?|txt|jpg|png)\.(exe|scr|bat|cmd|js|vbs|ps1)$/i.test(e.name));
    const nested = bad(/* Creates the invalid test result. */ (e) => NESTED_EXT.includes(extOf(e.name)));
    const ratio = entries.filter(/* Keeps items that match the condition. */ (e) => e.declared >= 1048576 && e.compressed > 0 && e.declared / e.compressed > LIMITS.ratio).slice(0, 20).map(/* Transforms each item in the collection. */ (e) => ({ name: e.name.slice(0, 200), ratio: Math.round(e.declared / e.compressed) }));
    const localHeadersIncomplete = entries.length > localHeadersChecked;
    const data = { entryCount: entries.length, truncated, scanComplete: !truncated && !localHeadersIncomplete, totalDeclaredUncompressed: totalUnc, limits: LIMITS, extracted: false, localHeadersChecked, localHeadersIncomplete,
      entries: entries.slice(0, LIMITS.listedNames).map(/* Transforms each item in the collection. */ (e) => ({ name: e.name.slice(0, 200), compressedSize: e.compressed, declaredSize: e.declared, encrypted: e.encrypted })),
      note: 'Sizes are declared in the archive headers; entries were not decompressed.' };
    const out = [];
    if (officeMissing) out.push(f('OFFICE_PACKAGE_STRUCTURE_INVALID', 'Office package is missing a required document part', 'medium', 'observed', 'The package central directory is readable, but a required OpenXML content-types or main-document part is missing.', { expectedPart: officeMain }));
    if (duplicateNames.length) out.push(f('ARCHIVE_DUPLICATE_ENTRY_NAMES', 'Archive contains duplicate entry names', 'medium', 'observed', 'Duplicate entry names can be interpreted differently by tools that extract archives; this scanner does not extract them.', { entries: duplicateNames.slice(0, 20) }));
    if (localHeadersIncomplete) out.push(f('ARCHIVE_ANALYSIS_INCOMPLETE', 'Archive local-header checks reached their safety limit', 'info', 'observed', 'Only the first 256 local file headers were compared with the central directory.', { checkedEntries: localHeadersChecked, entryCount: entries.length }));
    if (traversal.length) out.push(f('ARCHIVE_PATH_TRAVERSAL', 'Entry names attempt path traversal', 'high', 'observed', 'Entries use ".." or absolute paths, which can overwrite files if extracted naively.', { entries: traversal }));
    if (ratio.length || totalUnc > LIMITS.maxTotalUncompressed) out.push(f('ARCHIVE_COMPRESSION_ANOMALY', 'Extreme declared compression ratio or size', 'medium', 'heuristic', 'Declared sizes are consistent with a decompression bomb, though they may be benign or forged.', { entries: ratio, totalDeclaredUncompressed: totalUnc }));
    if (dbl.length) out.push(f('ARCHIVE_DOUBLE_EXTENSION', 'Executable disguised with a document-like extension', 'medium', 'heuristic', 'Names such as "file.pdf.exe" are a common disguise technique.', { entries: dbl }));
    if (risky.length) out.push(f('ARCHIVE_EXECUTABLE_CONTENT', 'Archive contains executable or script files', 'low', 'observed', 'Entries have extensions commonly associated with executable content.', { entries: risky }));
    if (nested.length) out.push(f('ARCHIVE_NESTED', 'Nested archives present', 'low', 'observed', 'Nested archives are not recursively inspected.', { entries: nested }));
    if (entries.some(/* Checks whether the item meets the condition. */ (e) => e.encrypted)) out.push(f('ARCHIVE_ENCRYPTED_ENTRIES', 'Encrypted entries present', 'low', 'observed', 'Encrypted content cannot be inspected.', {}));
    if (entries.some(/* Checks whether the item meets the condition. */ (e) => e.name.toLowerCase().endsWith('vbaproject.bin'))) out.push(f('OFFICE_MACROS_PRESENT', 'Office document contains a VBA project', 'medium', 'heuristic', 'Macros are common in legitimate documents but are a frequent malware delivery mechanism.', {}));
    if (truncated) out.push(f('ARCHIVE_ENTRY_LIMIT', 'Entry limit reached', 'info', 'observed', 'Only the first entries were inspected.', { limit: LIMITS.maxEntries }));
    return { status: 'completed', data, findings: out };
  } finally { await fh.close(); }
}
