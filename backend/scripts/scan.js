// Usage: npm run scan -- <path-to-file>   (read-only static scan; prints JSON evidence)
import fs from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from '../src/analysis/hashing.js';
import { validateType } from '../src/services/validation.service.js';
import { runStaticAnalysis } from '../src/analysis/evidence-aggregator.js';

const p = process.argv[2];
if (!p) { console.error('Usage: npm run scan -- <file>'); process.exit(1); }
const { size } = await fs.stat(p);
const ext = path.extname(p).slice(1).toLowerCase();
const v = await validateType(p, ext, size);
if (!v.accepted) { console.error('Rejected by upload policy:', v.reason); process.exit(2); }
const h = await hashFile(p);
const file = { originalName: path.basename(p), extension: ext, detected: v.detected, typeMismatch: v.mismatch, ...h };
console.log(JSON.stringify(await runStaticAnalysis({ filePath: p, file }), null, 2));
