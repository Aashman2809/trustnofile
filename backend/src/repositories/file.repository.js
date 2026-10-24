/**
 * File repository contract (implemented by local-file.repository.js; a SQL adapter can follow later).
 *   create(record)                      -> Promise<record>
 *   getById(id)                         -> Promise<record|null>
 *   list({ page, pageSize, search })    -> Promise<{ items, total }>
 */
export const FILE_REPOSITORY_METHODS = ['create', 'getById', 'list'];
