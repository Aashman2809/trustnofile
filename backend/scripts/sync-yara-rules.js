import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config/env.js';

const exec = promisify(execFile);
const sourceManifestPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../rules/ruleset.json');
const manifestPath = path.join(config.yaraRulesDir, 'ruleset.json');
const current = JSON.parse(await fs.readFile(sourceManifestPath, 'utf8'));
const release = process.argv[2] || current.release;
if (!/^\d{8}$/.test(release)) throw new Error('Provide a YARA Forge release tag in YYYYMMDD format.');
const asset = `yara-forge-rules-${current.package}.zip`;
const url = `https://github.com/YARAHQ/yara-forge/releases/download/${release}/${asset}`;
const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'follow' });
if (!response.ok || !['github.com', 'release-assets.githubusercontent.com'].includes(new URL(response.url).hostname))
  throw new Error(`Could not fetch the pinned YARA Forge asset (HTTP ${response.status}).`);
const declaredLength = Number(response.headers.get('content-length') || 0);
if (declaredLength > 100 * 1024 * 1024) throw new Error('Rule archive exceeds the 100 MB download limit.');
const archive = Buffer.from(await response.arrayBuffer());
if (!archive.length || archive.length > 100 * 1024 * 1024) throw new Error('Rule archive is empty or exceeds the 100 MB download limit.');
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trustnofile-rules-'));
const archivePath = path.join(tempDir, 'rules.zip');
try {
  await fs.writeFile(archivePath, archive, { flag: 'wx' });
  const listing = await exec('unzip', ['-Z1', archivePath], { timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true });
  const entries = listing.stdout.split(/\r?\n/).filter(/* Selects YARA source files from the package. */ (entry) => entry && entry.toLowerCase().endsWith('.yar'));
  if (entries.length !== 1 || !/^[\w./-]+\.yar$/i.test(entries[0]) || entries[0].startsWith('/') || entries[0].startsWith('-') || entries[0].split(/[\\/]/).includes('..'))
    throw new Error('The release archive did not contain exactly one safe .yar source file.');
  const extracted = await exec('unzip', ['-p', archivePath, entries[0]], { timeout: 20000, maxBuffer: 128 * 1024 * 1024, windowsHide: true, encoding: 'buffer' });
  const rules = Buffer.from(extracted.stdout);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(rules);
  const ruleCount = [...source.matchAll(/\brule\s+[A-Za-z_][A-Za-z0-9_]*/g)].length;
  if (!rules.length || rules.length > 120 * 1024 * 1024 || !ruleCount) throw new Error('The downloaded rule source was empty, oversized, or invalid.');
  await fs.mkdir(config.yaraRulesDir, { recursive: true });
  const target = path.join(config.yaraRulesDir, `yara-forge-core-${release}.yar`);
  const staged = `${target}.tmp`;
  await fs.writeFile(staged, rules, { flag: 'w' });
  await fs.rename(staged, target);
  const next = { source: 'YARA Forge', sourceUrl: current.sourceUrl, package: current.package, release, ruleCount,
    asset, sha256: createHash('sha256').update(archive).digest('hex'), syncedAt: new Date().toISOString() };
  const manifestTemp = `${manifestPath}.tmp`;
  await fs.writeFile(manifestTemp, `${JSON.stringify(next, null, 2)}\n`, { flag: 'w' });
  await fs.rename(manifestTemp, manifestPath);
  for (const name of await fs.readdir(config.yaraRulesDir))
    if (/^yara-forge-core-\d{8}\.yar$/.test(name) && name !== path.basename(target)) await fs.rm(path.join(config.yaraRulesDir, name), { force: true });
  process.stdout.write(`Installed YARA Forge ${release} core rules (${ruleCount} rules, SHA-256 ${next.sha256}).\n`);
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
