import fs from 'node:fs/promises';
import { fileTypeFromBuffer } from 'file-type';

// Reads head.
async function readHead(filePath, n = 65536) {
  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally { await fh.close(); }
}

// Checks whether the input contains readable text.
function looksLikeText(head) {
  if (head.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(head); return true; } catch { return false; }
}

// Checks whether text contains HTML markup.
function looksLikeHtml(head) {
  if (head.includes(0)) return false;
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(head).replace(/^\uFEFF/, ''); } catch { return false; }

  return /^\s*(?:<\?xml\b[^?]*\?>\s*)?(?:<!--[\s\S]{0,4096}?-->\s*)*(?:<!doctype\s+html\b|<html(?:\s|>)|<(?:head|body|script|style|iframe|div|span|main|section|article|header|footer|nav|form|input|button|img|a|p|ul|ol|li|table|thead|tbody|tr|td|th|h[1-6]|meta|link|title|svg)(?:\s|>|\/))/i.test(text);
}

// Identifies a supported text format from its content.
function identifyTextMarkup(head) {
  if (head.includes(0)) return null;
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(head).replace(/^\uFEFF/, '').trimStart(); } catch { return null; }
  if (/^(?:<\?xml\b[^?]*\?>\s*)?(?:<!--[\s\S]{0,4096}?-->\s*)*<svg(?:\s|>)/i.test(text)) return { format: 'svg', mime: 'image/svg+xml', signature: false, signatureName: 'SVG markup heuristic' };
  if (/^<\?xml\b|^<!doctype\s+(?!html\b)[a-z][\w:.-]*/i.test(text)) return { format: 'xml', mime: 'application/xml', signature: false, signatureName: 'XML markup heuristic' };
  return null;
}

// Identifies a file from its content.
export async function identifyFile(filePath) {
  const head = await readHead(filePath, 4100);
  const ft = await fileTypeFromBuffer(head);
  if (ft?.ext === 'xml') return identifyTextMarkup(head) || { format: 'xml', mime: 'application/xml', signature: false, signatureName: 'XML markup heuristic' };
  if (ft) {

    if (ft.ext === 'zip') {
      const office = await identifyOpenXml(filePath);
      if (office) return { ...office, signature: true, signatureName: 'ZIP/OpenXML container' };
    }
    return { format: ft.ext, mime: ft.mime, signature: true, signatureName: ft.ext };
  }
  if (looksLikeHtml(head)) return { format: 'html', mime: 'text/html', signature: false, signatureName: 'HTML markup heuristic' };
  const markup = identifyTextMarkup(head);
  if (markup) return markup;
  if (looksLikeText(head)) return { format: 'text', mime: 'text/plain', signature: false, signatureName: 'UTF-8 text' };
  return { format: 'unknown', mime: 'application/octet-stream', signature: false };
}

// Identifies the OpenXML document type.
async function identifyOpenXml(filePath) {
  const fh = await fs.open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    if (size < 22) return null;
    const tailSize = Math.min(size, 65557);
    const tail = Buffer.alloc(tailSize);
    await fh.read(tail, 0, tailSize, size - tailSize);
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0 || eocd + 22 > tail.length) return null;
    const count = tail.readUInt16LE(eocd + 10), cdSize = tail.readUInt32LE(eocd + 12), cdOffset = tail.readUInt32LE(eocd + 16);
    if (count > 10000 || cdSize > 8 * 1024 * 1024 || cdOffset + cdSize > size) return null;
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const names = new Set();
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; i++) {
      const n = cd.readUInt16LE(p + 28), x = cd.readUInt16LE(p + 30), c = cd.readUInt16LE(p + 32);
      if (p + 46 + n + x + c > cd.length) return null;
      names.add(cd.toString('utf8', p + 46, p + 46 + n));
      p += 46 + n + x + c;
    }
    if (!names.has('[Content_Types].xml')) return null;
    if (names.has('word/document.xml')) return { format: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    if (names.has('xl/workbook.xml')) return { format: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    if (names.has('ppt/presentation.xml')) return { format: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
    return null;
  } finally { await fh.close(); }
}
