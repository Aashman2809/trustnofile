import fs from 'node:fs/promises';
import path from 'node:path';

// Development-only JSON store. NOT durable under crashes or safe for concurrent multi-process use.
export async function createLocalFileRepository(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, 'files.json');
  let records = [];
  try { records = JSON.parse(await fs.readFile(file, 'utf8')); } catch { records = []; }
  let chain = Promise.resolve();
  const persist = () => (chain = chain.catch(() => {}).then(async () => { await fs.writeFile(`${file}.tmp`, JSON.stringify(records)); await fs.rename(`${file}.tmp`, file); }));
  return {
    async create(record) { records.push(record); await persist(); return record; },
    async getById(id) { return records.find((r) => r.id === id) || null; },
    async update(id, patch) {
      const i = records.findIndex((r) => r.id === id);
      if (i < 0) throw new Error('File not found');
      records[i] = { ...records[i], ...patch }; await persist(); return records[i];
    },
    async remove(id) { records = records.filter((r) => r.id !== id); await persist(); },
    async findBySha256(sha256) { return records.filter((r) => r.sha256 === sha256).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)); },
    async list({ page = 1, pageSize = 20, search = '' } = {}) {
      const q = search.toLowerCase();
      const all = records.filter((r) => !q || r.originalName.toLowerCase().includes(q) || r.id.includes(q)).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length };
    },
  };
}
