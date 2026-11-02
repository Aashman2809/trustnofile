

const secretKey = /(^error$|authorization|password|secret|token|credential|api.?key|service.?role.?key|database.?url)/i;
const scrub = (value, key = '') => {
  if (secretKey.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => scrub(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, k)]));
  if (typeof value === 'string') return value
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/(?:AKIA|ASIA)[A-Z0-9]{16}/g, '[REDACTED_AWS_KEY]')
    .replace(/(postgres(?:ql)?:\/\/[^:/\s]+:)[^@\s]+@/gi, '$1[REDACTED]@');
  return value;
};

// Emits structured CloudWatch-compatible logs without secret-bearing context fields.
export const log = (level, msg, ctx = {}) => {
  if (process.env.LOG_SILENT) return;
  (level === 'error' ? console.error : console.log)(JSON.stringify(scrub({ t: new Date().toISOString(), level, msg, ...ctx })));
};
