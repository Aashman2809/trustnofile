import fs from 'node:fs/promises';
import path from 'node:path';
import { TERMINAL } from '../services/analysis-states.js';

// Development-only JSON store: not durable across crashes, not safe for concurrent processes.
export async function createLocalAnalysisRepository(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, 'analyses.json');
  let records = [];
  try { records = JSON.parse(await fs.readFile(file, 'utf8')); } catch { records = []; }
  let chain = Promise.resolve();
  const persist = () => (chain = chain.catch(() => {}).then(async () => { await fs.writeFile(`${file}.tmp`, JSON.stringify(records)); await fs.rename(`${file}.tmp`, file); }));
  const newestFirst = (a, b) => b.startedAt.localeCompare(a.startedAt);
  return {
    async create(rec) { records.push(rec); await persist(); return rec; },
    async getById(id) { return records.find((r) => r.id === id) || null; },
    async update(id, patch) {
      const i = records.findIndex((r) => r.id === id);
      if (i < 0) throw new Error('Analysis not found');
      records[i] = { ...records[i], ...patch }; await persist(); return records[i];
    },
    async list({ page = 1, pageSize = 20, status, risk, search = '', fileId, sort = 'desc' } = {}) {
      const q = search.toLowerCase();
      let all = records.filter((r) => (!status || r.status === status) && (!risk || r.assessment?.riskLevel === risk) && (!fileId || r.fileId === fileId)
        && (!q || r.file.originalName.toLowerCase().includes(q) || r.id.includes(q) || r.fileId.includes(q)));
      all = all.sort(newestFirst); if (sort === 'asc') all.reverse();
      return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length };
    },
    async findActiveByFileId(fileId) { return records.find((r) => r.fileId === fileId && !TERMINAL.includes(r.status)) || null; },
    async findLatestByFileId(fileId) { return records.filter((r) => r.fileId === fileId).sort(newestFirst)[0] || null; },
    async removeByFileId(fileId) { records = records.filter((r) => r.fileId !== fileId); await persist(); },
    async markFileDeleted(fileId) {
      records = records.map((r) => (r.fileId === fileId ? { ...r, file: { ...r.file, fileDeleted: true } } : r)); await persist();
    },
    async listNonTerminal() { return records.filter((r) => !TERMINAL.includes(r.status)); },
  };
}
