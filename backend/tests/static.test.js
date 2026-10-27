import test from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createHash, randomBytes } from 'node:crypto';
process.env.YARA_PATH = 'definitely-not-installed-yara';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnf-st-'));

// Creates tmp operation.
const tmp = (buf, name = 'f.bin') => { const p = path.join(dir, name + Math.random().toString(36).slice(2)); fs.writeFileSync(p, buf); return p; };
const { runStaticAnalysis, DEFAULT_MODULES } = await import('../src/analysis/evidence-aggregator.js');
const { entropyModule } = await import('../src/analysis/entropy.js');
const { stringsModule } = await import('../src/analysis/strings.js');
const { archiveModule } = await import('../src/analysis/archive-inspection.js');
const { hashingModule } = await import('../src/analysis/hashing-module.js');
const { yaraModule } = await import('../src/analysis/yara-scanner.js');
const { parsePE } = await import('../src/analysis/pe.js');
const { validateModuleEvidence } = await import('../src/schemas/evidence.schema.js');

// Gets of.
const fileOf = (format, extra = {}) => ({ detected: { format }, extension: format, typeMismatch: false, ...extra });

// Handles zip.
function makeZip(entries) {
  const locals = [], cds = []; let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), data = Buffer.from(e.data ?? ''), crc = zlib.crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(e.compressed ?? data.length, 20); cd.writeUInt32LE(e.declared ?? data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(off, 42);
    locals.push(lh, name, data); cds.push(cd, name); off += 30 + name.length + data.length;
  }
  const cdBuf = Buffer.concat(cds), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

test('entropy: zeros ~0, random ~8, no finding for low entropy',/* Runs the test case: entropy: zeros ~0, random ~8, no finding for low entropy. */ async () => {
  const lo = await entropyModule({ filePath: tmp(Buffer.alloc(5000)), file: fileOf('exe') });
  assert.equal(lo.data.overall, 0); assert.equal(lo.findings.length, 0);
  const hi = await entropyModule({ filePath: tmp(randomBytes(70000)), file: fileOf('exe') });
  assert.ok(hi.data.overall > 7.9); assert.equal(hi.findings[0].code, 'HIGH_ENTROPY');
});
test('entropy: no high-entropy finding for compressed formats',/* Runs the test case: entropy: no high-entropy finding for compressed formats. */ async () => {
  const r = await entropyModule({ filePath: tmp(randomBytes(70000)), file: fileOf('zip') });
  assert.equal(r.findings.length, 0);
});
test('hashing module detects tampering and matches correct SHA-256',/* Runs the test case: hashing module detects tampering and matches correct SHA-256. */ async () => {
  const buf = Buffer.from('hello world'), p = tmp(buf);
  const sha = createHash('sha256').update(buf).digest('hex');
  assert.equal((await hashingModule({ filePath: p, file: { sha256: sha } })).findings.length, 0);
  assert.equal((await hashingModule({ filePath: p, file: { sha256: 'a'.repeat(64) } })).findings[0].code, 'HASH_MISMATCH');
});
test('strings: indicators found, samples bounded, secrets redacted',/* Runs the test case: strings: indicators found, samples bounded, secrets redacted. */ async () => {
  const lines = Array.from({ length: 50 },/* Converts each input value. */ (_, i) => `see http://example.test/p${i} now`).join('\n');
  const body = lines + '\npowershell -nop -enc AAAA\npassword=hunter2 http://x.test/a\n';
  const r = await stringsModule({ filePath: tmp(body) });
  const url = r.findings.find(/* Checks whether the item matches the lookup criteria. */ (f) => f.code === 'STR_URL');
  assert.equal(url.evidence.matches, 51); assert.ok(url.evidence.samples.length <= 5);
  assert.ok(r.findings.some(/* Checks whether the item meets the condition. */ (f) => f.code === 'STR_POWERSHELL_ENCODED'));
  assert.ok(!JSON.stringify(r).includes('hunter2'));
});
test('strings: clean text yields no findings (not a safety verdict)',/* Runs the test case: strings: clean text yields no findings (not a safety verdict). */ async () => {
  assert.equal((await stringsModule({ filePath: tmp('nothing interesting here at all') })).findings.length, 0);
});
test('archive: traversal, double extension, ratio anomaly found without extraction',/* Runs the test case: archive: traversal, double extension, ratio anomaly found without extraction. */ async () => {
  const zip = makeZip([{ name: '../evil.txt', data: 'x' }, { name: 'invoice.pdf.exe', data: 'y' }, { name: 'bomb.bin', data: 'z', compressed: 100, declared: 500 * 1024 * 1024 }]);
  const r = await archiveModule({ filePath: tmp(zip), file: fileOf('zip') });
  const codes = r.findings.map(/* Transforms each item in the collection. */ (f) => f.code);
  for (const c of ['ARCHIVE_PATH_TRAVERSAL', 'ARCHIVE_DOUBLE_EXTENSION', 'ARCHIVE_COMPRESSION_ANOMALY']) assert.ok(codes.includes(c), c);
  assert.equal(r.data.entryCount, 3); assert.equal(r.data.extracted, false);
});
test('archive: benign zip has no findings; non-zip is skipped; garbage is flagged',/* Runs the test case: archive: benign zip has no findings; non-zip is skipped; garbage is flagged. */ async () => {
  assert.equal((await archiveModule({ filePath: tmp(makeZip([{ name: 'a.txt', data: 'hi' }])), file: fileOf('zip') })).findings.length, 0);
  assert.equal((await archiveModule({ filePath: tmp('x'), file: fileOf('pdf') })).status, 'skipped');
  assert.equal((await archiveModule({ filePath: tmp(randomBytes(300)), file: fileOf('zip') })).findings[0].code, 'ARCHIVE_STRUCTURE_INVALID');
});
test('yara unavailable is reported as unavailable, never a clean scan',/* Runs the test case: yara unavailable is reported as unavailable, never a clean scan. */ async () => {
  const r = await yaraModule({ filePath: tmp('x') });
  assert.equal(r.status, 'unavailable'); assert.equal(r.data.scanComplete, false); assert.equal(r.findings.length, 0);
});
test('PE parser reads a synthetic header',/* Runs the test case: PE parser reads a synthetic header. */ async () => {
  const b = Buffer.alloc(0x400); b.writeUInt16LE(0x5a4d, 0); b.writeUInt32LE(0x80, 0x3c); b.writeUInt32LE(0x4550, 0x80);
  b.writeUInt16LE(0x14c, 0x84); b.writeUInt16LE(1, 0x86); b.writeUInt16LE(0xe0, 0x94); b.writeUInt16LE(0x10b, 0x98);
  b.write('.text', 0x98 + 0xe0); b.writeUInt32LE(0x20000000, 0x98 + 0xe0 + 36);
  const pe = await parsePE(tmp(b));
  assert.equal(pe.valid, true); assert.equal(pe.format, 'PE32'); assert.equal(pe.sections[0].name, '.text');
  assert.equal((await parsePE(tmp(Buffer.from('MZ' + 'x'.repeat(100))))).valid, false);
});
test('aggregator: failed and slow modules are isolated, others kept',/* Runs the test case: aggregator: failed and slow modules are isolated, others kept. */ async () => {
  const mods = [
    // Runs the requested analysis operation.
    { name: 'ok', run:async () => ({ status: 'completed', data: {}, findings: [] }) },
    // Runs the requested analysis operation.
    { name: 'boom', run:async () => { throw new Error('kaput'); } },
    // Runs the requested analysis operation.
    { name: 'slow', run:() => new Promise(/* Handles the callback for this operation. */ () => {}) },
    // Runs the requested analysis operation.
    { name: 'badshape', run:async () => ({ status: 'nonsense', findings: [] }) },
  ];
  const r = await runStaticAnalysis({ filePath: tmp('x'), file: fileOf('zip') }, { modules: mods, timeoutMs: 100 });
  const s = Object.fromEntries(r.modules.map(/* Transforms each item in the collection. */ (m) => [m.module, m.status]));
  assert.deepEqual(s, { ok: 'completed', boom: 'failed', slow: 'timeout', badshape: 'failed' });
});
test('full run on a text file: every module output validates against the schema',/* Runs the test case: full run on a text file: every module output validates against the schema. */ async () => {
  const p = tmp('plain text with http://example.test inside');
  const r = await runStaticAnalysis({ filePath: p, file: { ...fileOf('text'), sha256: createHash('sha256').update(fs.readFileSync(p)).digest('hex') } });
  assert.equal(r.modules.length, DEFAULT_MODULES.length);
  for (const m of r.modules) assert.deepEqual(validateModuleEvidence(m), [], m.module);
  assert.equal(r.summary.failed, 0);
});
