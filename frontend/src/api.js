export const API_URL = (import.meta.env?.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

export async function apiRequest(keycloak, path, options = {}) {
  try {
    if (!keycloak.authenticated) throw new Error('Not authenticated');
    await keycloak.updateToken(30);
    if (!keycloak.token || keycloak.isTokenExpired(0)) throw new Error('Expired token');
  } catch {
    throw new SessionExpiredError();
  }

  const { body, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...rest.headers,
      Authorization: 'Bearer ' + keycloak.token,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    let message = '';
    try {
      const data = await response.json();
      message = typeof data.detail === 'string' ? data.detail : typeof data.message === 'string' ? data.message : '';
    } catch {
      // An API error may not contain JSON.
    }
    throw new Error(message || `Request failed (${response.status} ${response.statusText}).`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export function newIncidents(seen, incidents) {
  const fresh = seen === null ? [] : incidents.filter((incident) => !seen.has(String(incident.id)));
  const next = new Set(seen || []);
  incidents.forEach((incident) => next.add(String(incident.id)));
  return { fresh, seen: next };
}
