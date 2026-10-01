// The backend: REST routes and the /ws/study websocket
export const API_URL = import.meta.env.VITE_MEDIAPIPE_API_URL || 'http://localhost:8001';

// The JWT from /signup or /login (backend/routes_auth.py). Kept in memory too, so signing in still works for this
// page load when storage is unavailable
const TOKEN_KEY = 'focusagent.token';

let token = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();

export function getToken() {
  return token;
}

export function saveToken(value: string) {
  token = value;
  try {
    localStorage.setItem(TOKEN_KEY, value);
  } catch {
    // Storage unavailable: signed in until the page is reloaded
  }
}

export function clearToken() {
  token = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable: nothing was stored
  }
}

// fetch against the backend, with the stored token attached and JSON bodies labeled. A 401 on a request that sent
// a token means the token is no longer good (expired, or its user is gone), so it's dropped: the route guard then
// sends the user to /login on their next navigation
export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const sent = token;
  if (sent) headers.set('Authorization', `Bearer ${sent}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && sent && token === sent) clearToken();
  return res;
}

// The message in an error response's "detail" (FastAPI's HTTPException), or `fallback` when there's none, as for a
// validation error, whose detail is a list
export async function errorDetail(res: Response, fallback: string) {
  try {
    const body = await res.json();
    return typeof body?.detail === 'string' ? body.detail : fallback;
  } catch {
    return fallback;
  }
}
