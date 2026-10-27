import { config } from '../config/env.js';
import { AppError } from './error.middleware.js';

// Creates middleware that validates Supabase access tokens.
export function createSupabaseAuthMiddleware({ required = config.authRequired, allowedUserId = config.authAllowedUserId, url = config.supabaseUrl, anonKey = config.supabaseAnonKey, fetchImpl = fetch } = {}) {
  // Validates the incoming bearer token for each protected request.
  return async (req, res, next) => {
    if (!required) return next();
    if (!url || !anonKey) return next(new AppError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured.'));
    const token = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')?.[1];
    if (!token) return next(new AppError(401, 'AUTH_REQUIRED', 'Sign in to use this service.'));
    try {
      const response = await fetchImpl(`${url.replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return next(new AppError(401, 'INVALID_SESSION', 'Your session is invalid or expired. Sign in again.'));
      const user = await response.json();
      if (!user?.id) return next(new AppError(401, 'INVALID_SESSION', 'Your session is invalid or expired. Sign in again.'));
      if (allowedUserId && user.id !== allowedUserId) return next(new AppError(403, 'USER_NOT_ALLOWED', 'This account is not allowed to use this service.'));
      req.user = { id: user.id };
      next();
    } catch {
      next(new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication could not be verified. Try again.'));
    }
  };
}
