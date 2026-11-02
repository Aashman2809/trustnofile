import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAuthMiddleware } from '../src/middleware/auth.middleware.js';

test('Supabase auth requires a bearer token and restricts access to the configured owner', async () => {
  const calls = [];
  const middleware = createSupabaseAuthMiddleware({
    required: true,
    allowedUserId: '123e4567-e89b-42d3-a456-426614174000',
    url: 'https://project.supabase.co/',
    anonKey: 'public-test-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { id: '123e4567-e89b-42d3-a456-426614174000' }; } };
    },
  });
  let error;
  await middleware({ get: () => undefined }, {}, (nextError) => { error = nextError; });
  assert.equal(error.status, 401);

  const request = { get: () => 'Bearer test-session-token' };
  await middleware(request, {}, (nextError) => { error = nextError; });
  assert.equal(error, undefined);
  assert.deepEqual(request.user, { id: '123e4567-e89b-42d3-a456-426614174000' });
  assert.equal(calls[0].url, 'https://project.supabase.co/auth/v1/user');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-session-token');

  const restricted = createSupabaseAuthMiddleware({
    required: true,
    allowedUserId: '323e4567-e89b-42d3-a456-426614174000',
    url: 'https://project.supabase.co',
    anonKey: 'public-test-key',
    fetchImpl: async () => ({ ok: true, async json() { return { id: '123e4567-e89b-42d3-a456-426614174000' }; } }),
  });
  error = undefined;
  await restricted({ get: () => 'Bearer test-session-token' }, {}, (nextError) => { error = nextError; });
  assert.equal(error.status, 403);
});
