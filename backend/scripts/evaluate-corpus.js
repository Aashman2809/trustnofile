import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { identifyFile } from '../src/analysis/file-identification.js';
import { metadataModule } from '../src/analysis/metadata.js';
import { archiveModule } from '../src/analysis/archive-inspection.js';
import { stringsModule } from '../src/analysis/strings.js';
import { identificationModule } from '../src/analysis/identification-module.js';
import { yaraModule } from '../src/analysis/yara-scanner.js';
import { validateType } from '../src/services/validation.service.js';

// Builds a synthetic ZIP archive without extracting or executing its contents.
function makeZip(name, body = 'safe fixture') {
  const fileName = Buffer.from(name), data = Buffer.from(body);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(fileName.length, 28);
  const directory = Buffer.concat([central, fileName]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(local.length + fileName.length + data.length, 16);
  return Buffer.concat([local, fileName, data, directory, end]);
}

// Builds a bounded synthetic PE header with an invalid section pointer.
function makeMalformedPe() {
  const b = Buffer.alloc(0x200);
  b.writeUInt16LE(0x5a4d, 0); b.writeUInt32LE(0x80, 0x3c); b.writeUInt32LE(0x00004550, 0x80);
  b.writeUInt16LE(0x14c, 0x84); b.writeUInt16LE(1, 0x86); b.writeUInt16LE(0xe0, 0x94); b.writeUInt16LE(0x10b, 0x98);
  const section = 0x98 + 0xe0;
  b.writeUInt32LE(0x100, section + 16); b.writeUInt32LE(0x200, section + 20); b.writeUInt32LE(0x20000000, section + 36);
  return b;
}

const corpus = [
  { id: 'benign-text', category: 'benign', name: 'notes.txt', content: Buffer.from('Meeting notes: review the quarterly budget and project milestones.\n') },
  { id: 'benign-pdf', category: 'benign', name: 'notes.pdf', content: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n') },
  { id: 'benign-zip', category: 'benign', name: 'notes.zip', content: makeZip('notes.txt') },
  { id: 'suspicious-text', category: 'suspicious', name: 'script.txt', expected: ['STR_POWERSHELL_ENCODED'], content: Buffer.from('powershell.exe -nop -w hidden -enc QUJDREVGR0g=\n') },
  { id: 'suspicious-pdf', category: 'suspicious', name: 'form.pdf', expected: ['PDF_ACTIVE_CONTENT'], content: Buffer.from('%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert) >> >> endobj\n%%EOF\n') },
  { id: 'suspicious-zip', category: 'suspicious', name: 'bundle.zip', expected: ['ARCHIVE_PATH_TRAVERSAL'], content: makeZip('../outside.txt') },
  { id: 'malformed-pdf', category: 'malformed', name: 'broken.pdf', expected: ['PDF_STRUCTURE_INVALID'], content: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n') },
  { id: 'malformed-zip', category: 'malformed', name: 'broken.zip', expected: ['ARCHIVE_STRUCTURE_INVALID'], content: Buffer.from('PK\x03\x04 truncated central directory') },
  { id: 'malformed-pe', category: 'malformed', name: 'broken.exe', expected: ['PE_STRUCTURE_INVALID'], content: makeMalformedPe() },
  { id: 'malformed-xml', category: 'malformed', name: 'broken.xml', expected: ['XML_STRUCTURE_INVALID'], content: Buffer.from('<?xml version="1.0"?><root><item></root>') },
  { id: 'mislabeled-html', category: 'mislabeled', name: 'page.txt', expected: ['FORMAT_MISMATCH'], expectedFormat: 'html', content: Buffer.from('<!doctype html><html><body>Safe sample page</body></html>') },
];

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trustnofile-corpus-'));
const records = [];
try {
  for (const sample of corpus) {
    const filePath = path.join(tempDir, sample.name);
    await fs.writeFile(filePath, sample.content, { flag: 'wx' });
    const declaredExt = path.extname(sample.name).slice(1);
    const validated = await validateType(filePath, declaredExt, sample.content.length);
    const file = { detected: validated.detected, extension: declaredExt, typeMismatch: validated.mismatch };
    const results = await Promise.all([
      metadataModule({ filePath, file }),
      archiveModule({ filePath, file }),
      stringsModule({ filePath }),
      identificationModule({ file }),
      yaraModule({ filePath }),
    ]);
    const findings = results.flatMap(/* Collects findings from the analysis modules. */ (r) => r.findings || []);
    const codes = [...new Set(findings.map(/* Collects detected indicator codes. */ (f) => f.code))];
    const yara = results[4];
    records.push({ id: sample.id, category: sample.category, detectedFormat: validated.detected?.format || 'unsupported', typeMismatch: !!validated.mismatch,
      expectedFormat: sample.expectedFormat || null, expected: sample.expected || [], detected: codes,
      yaraStatus: yara.status, yaraScanComplete: !!yara.data?.scanComplete, yaraSourceSet: yara.data?.sourceSet || null,
      yaraMatches: findings.filter(/* Selects YARA match findings. */ (f) => f.code === 'YARA_MATCH').map(/* Lists matched YARA rule names. */ (f) => f.evidence?.rule),
      missed: (sample.expected || []).filter(/* Finds expected indicators the analyzer missed. */ (code) => !codes.includes(code)), benignAlerts: sample.category === 'benign' ? findings.filter(/* Finds actionable alerts on benign samples. */ (f) => ['medium', 'high'].includes(f.severity)).map(/* Lists benign-sample alert codes. */ (f) => f.code) : [] });
  }
} finally { await fs.rm(tempDir, { recursive: true, force: true }); }

const labels = [...new Set(corpus.flatMap(/* Collects expected corpus indicators. */ (sample) => sample.expected || []))];
const metrics = Object.fromEntries(labels.map(/* Calculates recall for one expected indicator. */ (label) => {
  const positives = records.filter(/* Selects samples labeled with this indicator. */ (r) => r.expected.includes(label));
  const tp = positives.filter(/* Counts samples where this indicator was detected. */ (r) => r.detected.includes(label)).length;
  return [label, { truePositive: tp, falseNegative: positives.length - tp, samples: positives.length, recall: positives.length ? +(tp / positives.length).toFixed(3) : null }];
}));
const benignCount = records.filter(/* Counts benign corpus samples. */ (r) => r.category === 'benign').length;
const falsePositiveSamples = records.filter(/* Selects benign samples with actionable alerts. */ (r) => r.benignAlerts.length);
const yaraStatuses = Object.fromEntries([...new Set(records.map(/* Collects YARA scan statuses. */ (r) => r.yaraStatus))].map(/* Counts samples per YARA status. */ (status) => [status, records.filter(/* Selects samples with this YARA status. */ (r) => r.yaraStatus === status).length]));
const summary = { samples: records.length, byCategory: Object.fromEntries(['benign', 'suspicious', 'malformed', 'mislabeled'].map(/* Counts samples in each category. */ (category) => [category, records.filter(/* Selects samples in this category. */ (r) => r.category === category).length])),
  expectedIndicatorMetrics: metrics, benignFalsePositiveSamples: falsePositiveSamples.length, benignSamples: benignCount,
  benignFalsePositiveRate: benignCount ? +(falsePositiveSamples.length / benignCount).toFixed(3) : null,
  yara: { statuses: yaraStatuses, completeScans: records.filter(/* Counts complete YARA scans. */ (r) => r.yaraScanComplete).length, matchedRules: [...new Set(records.flatMap(/* Collects matched rules across samples. */ (r) => r.yaraMatches))] },
  misses: records.filter(/* Selects missed indicators and formats. */ (r) => r.missed.length || (r.expectedFormat && r.detectedFormat !== r.expectedFormat)).map(/* Summarizes each corpus miss. */ (r) => ({ id: r.id, missed: r.missed, expectedFormat: r.expectedFormat, detectedFormat: r.detectedFormat })) };
process.stdout.write(`${JSON.stringify({ summary, samples: records }, null, 2)}\n`);
if (summary.misses.length || falsePositiveSamples.length) process.exitCode = 1;
