import { randomUUID } from 'node:crypto';
export const newId = randomUUID;

// Checks whether a value is a UUID.
export const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
