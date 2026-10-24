// Structured JSON logs. Never pass file contents or secrets here.
export const log = (level, msg, ctx = {}) => {
  if (process.env.LOG_SILENT) return;
  (level === 'error' ? console.error : console.log)(JSON.stringify({ t: new Date().toISOString(), level, msg, ...ctx }));
};
