const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const sessionKey = 'trustnofile.supabase.session';
let refreshingSession = null;

export const authConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function readSession() {
  try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { return null; }
}

function saveSession(session) {
  localStorage.setItem(sessionKey, JSON.stringify(session));
  window.dispatchEvent(new Event('trustnofile-session'));
}

function clearSession() {
  localStorage.removeItem(sessionKey);
  window.dispatchEvent(new Event('trustnofile-session'));
}

function authHeaders() {
  return { apikey: supabaseAnonKey, 'Content-Type': 'application/json' };
}

export async function restoreSession() {
  const session = readSession();
  if (!session?.refresh_token) return null;
  if (session.expires_at && session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  if (!refreshingSession) refreshingSession = refreshSession(session).finally(() => { refreshingSession = null; });
  return refreshingSession;
}

async function refreshSession(session) {
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!response.ok) throw new Error('Session expired. Sign in again.');
    const refreshed = await response.json();
    const next = { ...refreshed, expires_at: Math.floor(Date.now() / 1000) + Number(refreshed.expires_in || 3600) };
    saveSession(next);
    return next;
  } catch {
    clearSession();
    return null;
  }
}

export async function getAccessToken() {
  const session = await restoreSession();
  return session?.access_token || null;
}

export async function signIn(email, password) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.msg || body.message || body.error_description || 'Sign-in failed. Check the email and password.');
  const session = { ...body, expires_at: Math.floor(Date.now() / 1000) + Number(body.expires_in || 3600) };
  saveSession(session);
  return session;
}

export async function signOut() {
  const session = readSession();
  if (session?.access_token && authConfigured) {
    await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/logout`, {
      method: 'POST', headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }
  clearSession();
}
