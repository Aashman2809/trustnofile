/**
 * File repository contract (local JSON now; SQL adapter later):
 *   create(record) | getById(id) | update(id, patch) | remove(id)
 *   findBySha256(sha256) -> record[] (newest first)
 *   list({ page, pageSize, search }) -> { items, total }
 */
export const FILE_REPOSITORY_METHODS = ['create', 'getById', 'update', 'remove', 'findBySha256', 'list'];
