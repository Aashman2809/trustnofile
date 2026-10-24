/**
 * EXAMPLE ONLY. Not wired in and not functional. Shows the shape a SQL adapter should take.
 *
 * import mysql from 'mysql2/promise';   // or: import pg from 'pg';
 * export async function createSqlAdapter({ url }) {
 *   const pool = mysql.createPool(url);
 *   return {
 *     getStatus: () => ({ status: 'connected', active: 'mysql' }),
 *     createRepositories: () => ({
 *       fileRepo: {
 *         async getById(id) { const [rows] = await pool.execute('SELECT * FROM files WHERE id = ?', [id]); return rows[0] ?? null; },
 *         // create, update, remove, list, findBySha256 ... always with placeholders, never string concatenation
 *       },
 *       analysisRepo: { ... },
 *     }),
 *   };
 * }
 */
export function createSqlAdapter() {
  throw new Error('SQL adapter is not implemented. See docs/INTEGRATION.md.');
}
