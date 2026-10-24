import fs from 'node:fs/promises';
import path from 'node:path';

// Development-only JSON store. NOT durable under crashes or safe for concurrent multi-process use.
export async function createLocalFileRepository(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, 'files.json');
  let records = [];
  try { records = JSON.parse(await fs.readFile(file, 'utf8')); } catch { records = []; }
  let chain = Promise.resolve();
  const persist = () => (chain = chain.then(async () => {
    await fs.writeFile(`${file}.tmp`, JSON.stringify(records));
    await fs.rename(`${file}.tmp`, file);
  }));
  return {
    async create(record) { records.push(record); await persist(); return record; },
    async getById(id) { return records.find((r) => r.id === id) || null; },
    async list({ page = 1, pageSize = 20, search = '' } = {}) {
      const q = search.toLowerCase();
      const all = records.filter((r) => !q || r.originalName.toLowerCase().includes(q) || r.id.includes(q))
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length };
    },
  };
}
