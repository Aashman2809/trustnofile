import fs from 'node:fs/promises';
import { parsePE } from './pe.js';

async function head(filePath, n) {
  const fh = await fs.open(filePath, 'r');
  try { const buf = Buffer.alloc(n); const r = await fh.read(buf, 0, n, 0); return buf.subarray(0, r.bytesRead); } finally { await fh.close(); }
}

async function elfInfo(filePath) {
  const b = await head(filePath, 64);
  if (b.length < 20) return { valid: false };
  const le = b[5] === 1;
  const type = le ? b.readUInt16LE(16) : b.readUInt16BE(16), machine = le ? b.readUInt16LE(18) : b.readUInt16BE(18);
  return { valid: true, class: b[4] === 2 ? '64-bit' : '32-bit', endianness: le ? 'little' : 'big', type: { 1: 'relocatable', 2: 'executable', 3: 'shared/PIE', 4: 'core' }[type] || String(type), machine: '0x' + machine.toString(16) };
}

async function pdfInfo(filePath) {
  const fh = await fs.open(filePath, 'r');
  let text;
  try { const buf = Buffer.alloc(10 * 1024 * 1024); const r = await fh.read(buf, 0, buf.length, 0); text = buf.toString('latin1', 0, r.bytesRead); } finally { await fh.close(); }
  const count = (re) => (text.match(re) || []).length;
  const counts = { javascript: count(/\/(JavaScript|JS)\b/g), openAction: count(/\/OpenAction\b/g), launch: count(/\/Launch\b/g),
    embeddedFiles: count(/\/EmbeddedFile\b/g), additionalActions: count(/\/AA\b/g), richMedia: count(/\/RichMedia\b/g) };
  return { version: (text.match(/^%PDF-(\d\.\d)/) || [])[1] || null, pages: count(/\/Type\s*\/Page\b/g), encrypted: /\/Encrypt\b/.test(text), scannedBytesLimit: '10 MB', counts };
}

export async function metadataModule({ filePath, file }) {
  const st = await fs.stat(filePath);
  const data = { size: st.size, storedFileTimestamps: { modified: st.mtime.toISOString() },
    note: 'Filesystem timestamps reflect server storage, not the original file. Metadata is context, not proof of malicious intent.' };
  const findings = [];
  const fmt = file.detected?.format;
  if (fmt === 'exe') {
    data.pe = await parsePE(filePath);
    if (!data.pe.valid) findings.push({ code: 'PE_STRUCTURE_INVALID', title: 'Executable header could not be parsed as valid PE', severity: 'medium', kind: 'observed',
      description: 'The file starts like a Windows executable but its PE structure is invalid or truncated. This may be a DOS program, damaged, or deliberately malformed.', evidence: { reason: data.pe.reason } });
    else for (const s of data.pe.sections) if (s.executable && s.entropy >= 7.2)
      findings.push({ code: 'PE_HIGH_ENTROPY_SECTION', title: `Executable section "${s.name}" has high entropy`, severity: 'low', kind: 'heuristic',
        description: 'High-entropy code sections are common in packed executables but also in some legitimate software.', evidence: { section: s.name, entropy: s.entropy } });
  } else if (fmt === 'elf') data.elf = await elfInfo(filePath);
  else if (fmt === 'pdf') {
    data.pdf = await pdfInfo(filePath);
    const c = data.pdf.counts;
    if (c.javascript || c.launch)
      findings.push({ code: 'PDF_ACTIVE_CONTENT', title: 'PDF contains script or launch actions', severity: 'medium', kind: 'heuristic',
        description: 'JavaScript or Launch actions can be used maliciously but also appear in legitimate forms.', evidence: { javascript: c.javascript, launch: c.launch } });
    else if (c.openAction || c.additionalActions)
      findings.push({ code: 'PDF_AUTO_ACTION', title: 'PDF defines automatic actions', severity: 'low', kind: 'heuristic',
        description: 'The document defines actions triggered on open or on events.', evidence: { openAction: c.openAction, additionalActions: c.additionalActions } });
    if (c.embeddedFiles) findings.push({ code: 'PDF_EMBEDDED_FILE', title: 'PDF contains embedded files', severity: 'low', kind: 'observed',
      description: 'Embedded files were referenced in the document structure.', evidence: { count: c.embeddedFiles } });
  }
  return { status: 'completed', data, findings };
}
