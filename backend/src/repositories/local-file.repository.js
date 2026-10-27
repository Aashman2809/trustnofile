import fs from 'node:fs/promises';
import path from 'node:path';

// Creates the local file repository.
export async function createLocalFileRepository(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, 'files.json');
  let records = [];
  try { records = JSON.parse(await fs.readFile(file, 'utf8')); } catch { records = []; }
  let chain = Promise.resolve();

  // Writes the current records to storage.
  const persist = () => (chain = chain.catch(/* Handles the asynchronous error. */ () => {}).then(/* Processes the completed asynchronous result. */ async () => { await fs.writeFile(`${file}.tmp`, JSON.stringify(records)); await fs.rename(`${file}.tmp`, file); }));
  return {

    // Creates a repository record.
    async create(record) { records.push(record); await persist(); return record; },

    // Finds a record by its ID.
    async getById(id) { return records.find(/* Checks whether the item matches the lookup criteria. */ (r) => r.id === id) || null; },

    // Updates a repository record.
    async update(id, patch) {
      const i = records.findIndex(/* Checks whether the item matches the lookup criteria. */ (r) => r.id === id);
      if (i < 0) throw new Error('File not found');
      records[i] = { ...records[i], ...patch }; await persist(); return records[i];
    },

    // Removes a record or its stored file.
    async remove(id) { records = records.filter(/* Keeps items that match the condition. */ (r) => r.id !== id); await persist(); },

    // Finds records with the matching SHA-256 digest.
    async findBySha256(sha256) { return records.filter(/* Keeps items that match the condition. */ (r) => r.sha256 === sha256).sort(/* Compares two items for sorting. */ (a, b) => b.uploadedAt.localeCompare(a.uploadedAt)); },

    // Lists matching stored records.
    async list({ page = 1, pageSize = 20, search = '' } = {}) {
      const q = search.toLowerCase();
      const all = records.filter(/* Keeps items that match the condition. */ (r) => !q || r.originalName.toLowerCase().includes(q) || r.id.includes(q)).sort(/* Compares two items for sorting. */ (a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length };
    },
  };
}
