// No database is connected. Local JSON repositories are used and reported honestly as such.
export const createDisabledDatabase = () => ({
  getStatus: () => ({ status: 'not_configured', active: 'local_json_development_store' }),
  createRepositories: async () => { throw new Error('PostgreSQL is not configured'); },
});
