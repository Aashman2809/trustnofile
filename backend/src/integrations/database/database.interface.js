/**
 * Database adapter contract (MySQL or PostgreSQL; the app code does not care which):
 *   getStatus() -> { status: 'not_configured' | 'connected', active: string }
 *   createRepositories() -> { fileRepo, analysisRepo }   // must satisfy repositories/file.repository.js and analysis.repository.js
 * Adapters must use parameterized queries only. See docs/INTEGRATION.md and docs/database-schema.sql.
 */
export const DATABASE_METHODS = ['getStatus'];
