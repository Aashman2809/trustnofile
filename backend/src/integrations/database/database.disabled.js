

// Creates disabled database.
export const createDisabledDatabase = () => ({

  // Returns the current service status.
  getStatus: () => ({ status: 'not_configured', active: 'local_json_development_store' }),

  // Creates the configured repositories.
  createRepositories: async () => { throw new Error('PostgreSQL is not configured'); },
});
