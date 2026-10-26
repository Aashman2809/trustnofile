import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { identifyFile } from '../src/analysis/file-identification.js';
import { validateType } from '../src/services/validation.service.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tnf-ident-'));
const save = async (name, bytes) => { const p = path.join(root, name); await fs.writeFile(p, bytes); return p; };

function zip(entries) {
  const locals = [], central = []; let offset = 0;
  for (const [name, bodyText] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name), body = Buffer.from(bodyText), local = Buffer.alloc(30 + nameBytes.length + body.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30); body.copy(local, 30 + nameBytes.length); locals.push(local);
    const cd = Buffer.alloc(46 + nameBytes.length); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10); cd.writeUInt32LE(0, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(body.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28); cd.writeUInt32LE(offset, 42); nameBytes.copy(cd, 46); central.push(cd); offset += local.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22), count = Object.keys(entries).length; end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('identifies signature-backed PE, PDF, ZIP, OpenXML and image formats', async () => {
  const pe = Buffer.alloc(320); pe.write('MZ'); pe.writeUInt32LE(64, 0x3c); pe.writeUInt32LE(0x00004550, 64); pe.writeUInt16LE(0x14c, 68); pe.writeUInt16LE(224, 84);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', 'base64');
  const cases = [
    ['sample.exe', pe, 'exe'], ['sample.pdf', pdf, 'pdf'], ['sample.zip', zip({ 'readme.txt': 'hello' }), 'zip'],
    ['sample.docx', zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': '<doc/>' }), 'docx'],
    ['sample.png', png, 'png'],
  ];
  for (const [name, bytes, format] of cases) {
    const id = await identifyFile(await save(name, bytes));
    assert.equal(id.format, format, name);
    const verdict = await validateType(await save(`again-${name}`, bytes), name.split('.').pop(), bytes.length);
    assert.equal(verdict.accepted, true, name);
    assert.equal(verdict.mismatch, false, name);
  }
});

test('extension mismatch is recorded from content signature, not filename or MIME', async () => {
  const pdf = Buffer.from('%PDF-1.4\n');
  const p = await save('invoice.txt', pdf);
  const verdict = await validateType(p, 'txt', pdf.length);
  assert.equal(verdict.detected.format, 'pdf');
  assert.equal(verdict.mismatch, true);
});

test('malformed and unsupported binary input is rejected; ordinary text remains supported', async () => {
  const malformed = Buffer.from([0, 1, 2, 3, 250, 251, 252, 0, 9, 9]);
  const invalid = await validateType(await save('bad.dat', malformed), 'dat', malformed.length);
  assert.equal(invalid.accepted, false);
  const text = Buffer.from('ordinary UTF-8 notes');
  const valid = await validateType(await save('notes.txt', text), 'txt', text.length);
  assert.equal(valid.accepted, true);
  assert.equal(valid.detected.format, 'text');
});
