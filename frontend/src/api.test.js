import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, newIncidents, SessionExpiredError } from './api.js';

test('baseline incidents are not new and IDs are remembered across polls', () => {
  const baseline = newIncidents(null, [{ id: 1 }]);
  assert.deepEqual(baseline.fresh, []);
  const next = newIncidents(baseline.seen, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(next.fresh, [{ id: 2 }]);
  const removed = newIncidents(next.seen, []);
  assert.deepEqual(newIncidents(removed.seen, [{ id: 2 }]).fresh, []);
});

test('requests refresh the token and send JSON with authorization', async () => {
  const originalFetch = globalThis.fetch;
  let refreshed = false;
  const keycloak = { authenticated: true, token: 'access-token', updateToken: async (seconds) => { assert.equal(seconds, 30); refreshed = true; }, isTokenExpired: () => false };
  globalThis.fetch = async (url, options) => {
    assert.ok(refreshed);
    assert.equal(url, 'http://localhost:8000/api/simulations');
    assert.equal(options.headers.Authorization, 'Bearer ' + 'access-token');
    assert.equal(options.body, JSON.stringify({ status: 'contained' }));
    return new Response(JSON.stringify({ id: 1 }), { status: 200 });
  };
  try {
    assert.deepEqual(await apiRequest(keycloak, '/api/simulations', { method: 'POST', body: { status: 'contained' } }), { id: 1 });
  } finally { globalThis.fetch = originalFetch; }
});

test('expired or unrefreshable sessions never send requests', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('fetch must not run'); };
  try {
    await assert.rejects(apiRequest({ authenticated: true, updateToken: async () => { throw new Error('refresh failed'); } }, '/api/overview'), SessionExpiredError);
    await assert.rejects(apiRequest({ authenticated: true, updateToken: async () => {}, token: 'expired', isTokenExpired: () => true }, '/api/overview'), SessionExpiredError);
    await assert.rejects(apiRequest({ authenticated: false }, '/api/overview'), SessionExpiredError);
  } finally { globalThis.fetch = originalFetch; }
});

test('API errors are surfaced', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Not allowed' }), { status: 403 });
  try {
    await assert.rejects(apiRequest({ authenticated: true, updateToken: async () => {}, token: 'token', isTokenExpired: () => false }, '/api/overview'), /Not allowed/);
  } finally { globalThis.fetch = originalFetch; }
});
