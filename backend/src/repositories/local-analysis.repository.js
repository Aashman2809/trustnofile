import fs from 'node:fs/promises';
import path from 'node:path';
import { TERMINAL } from '../services/analysis-states.js';

// Creates the local analysis repository.
export async function createLocalAnalysisRepository(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, 'analyses.json');
  let records = [];
  try { records = JSON.parse(await fs.readFile(file, 'utf8')); } catch { records = []; }
  let chain = Promise.resolve();

  // Writes the current records to storage.
  const persist = () => (chain = chain.catch(/* Handles the asynchronous error. */ () => {}).then(/* Processes the completed asynchronous result. */ async () => { await fs.writeFile(`${file}.tmp`, JSON.stringify(records)); await fs.rename(`${file}.tmp`, file); }));

  // Sorts records from newest to oldest.
  const newestFirst = (a, b) => b.startedAt.localeCompare(a.startedAt);
  return {

    // Creates a repository record.
    async create(rec) { records.push(rec); await persist(); return rec; },

    // Finds a record by its ID.
    async getById(id) { return records.find(/* Checks whether the item matches the lookup criteria. */ (r) => r.id === id) || null; },

    // Updates a repository record.
    async update(id, patch) {
      const i = records.findIndex(/* Checks whether the item matches the lookup criteria. */ (r) => r.id === id);
      if (i < 0) throw new Error('Analysis not found');
      records[i] = { ...records[i], ...patch }; await persist(); return records[i];
    },

    // Lists matching stored records.
    async list({ page = 1, pageSize = 20, status, risk, search = '', fileId, sort = 'desc' } = {}) {
      const q = search.toLowerCase();
      let all = records.filter(/* Keeps items that match the condition. */ (r) => (!status || r.status === status) && (!risk || r.assessment?.riskLevel === risk) && (!fileId || r.fileId === fileId)
        && (!q || r.file.originalName.toLowerCase().includes(q) || r.id.includes(q) || r.fileId.includes(q)));
      all = all.sort(newestFirst); if (sort === 'asc') all.reverse();
      return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length };
    },

    // Finds the active analysis for a file.
    async findActiveByFileId(fileId) { return records.find(/* Checks whether the item matches the lookup criteria. */ (r) => r.fileId === fileId && !TERMINAL.includes(r.status)) || null; },

    // Finds the latest analysis for a file.
    async findLatestByFileId(fileId) { return records.filter(/* Keeps items that match the condition. */ (r) => r.fileId === fileId).sort(newestFirst)[0] || null; },

    // Removes analyses associated with a file.
    async removeByFileId(fileId) { records = records.filter(/* Keeps items that match the condition. */ (r) => r.fileId !== fileId); await persist(); },

    // Marks the file as deleted in its analysis records.
    async markFileDeleted(fileId) {
      records = records.map(/* Transforms each item in the collection. */ (r) => (r.fileId === fileId ? { ...r, file: { ...r.file, fileDeleted: true } } : r)); await persist();
    },

    // Lists analyses that have not finished.
    async listNonTerminal() { return records.filter(/* Keeps items that match the condition. */ (r) => !TERMINAL.includes(r.status)); },
  };
}
