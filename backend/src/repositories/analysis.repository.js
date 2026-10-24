/**
 * Analysis repository contract (local JSON now; SQL adapter later):
 *   create(record) | getById(id) | update(id, patch)
 *   list({ page, pageSize, status, risk, search, fileId, sort }) -> { items, total }
 *   findActiveByFileId(fileId) | findLatestByFileId(fileId) | listNonTerminal()
 */
export const ANALYSIS_REPOSITORY_METHODS = ['create', 'getById', 'update', 'list', 'findActiveByFileId', 'findLatestByFileId', 'listNonTerminal'];
