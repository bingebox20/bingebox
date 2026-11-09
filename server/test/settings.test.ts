import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { setEnvValue } from '../src/env-file.js';

test('dotenv updates preserve other settings, collapse duplicates, and serialize atomic writes', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bingebox-dotenv-'));
  const file = path.join(dir, '.env');
  try {
    writeFileSync(file, '# Owner settings\r\nPORT=8787\r\nexport ANIMEDOC_API_KEY=old # replace\r\nANIMEDOC_API_KEY=duplicate\r\nADMIN_PASSWORD="leave this alone"\r\n');
    await Promise.all([setEnvValue(file, 'ANIMEDOC_API_KEY', 'ad_live_first'), setEnvValue(file, 'ANIMEDOC_API_KEY', 'ad_live_second')]);
    assert.equal(readFileSync(file, 'utf8'), '# Owner settings\r\nPORT=8787\r\nANIMEDOC_API_KEY=ad_live_second\r\nADMIN_PASSWORD="leave this alone"\r\n');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const fresh = path.join(dir, 'fresh.env');
    await setEnvValue(fresh, 'ANIMEDOC_API_KEY', 'ad_live_first');
    assert.equal(readFileSync(fresh, 'utf8'), 'ANIMEDOC_API_KEY=ad_live_first\n');
    await assert.rejects(setEnvValue(file, 'ANIMEDOC_API_KEY', 'ad_live_test\nADMIN_PASSWORD=bad'));
    await assert.rejects(setEnvValue(path.join(dir, 'missing', '.env'), 'ANIMEDOC_API_KEY', 'ad_live_test'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('only admins with CSRF protection can persist and rotate the AnimeDoc key', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bingebox-settings-'));
  Object.assign(process.env, { DATABASE_FILE: path.join(dir, 'settings.db'), DATA_DIR: dir, UPLOADS_DIR: path.join(dir, 'uploads'),
    NODE_ENV: 'test', ANIMEDOC_API_KEY: 'isolated-original', ADMIN_EMAIL: 'admin@settings.local', ADMIN_PASSWORD: 'SettingsAdmin!2026' });
  const { config } = await import('../src/config.js');
  const originalRoot = config.root; config.root = dir;
  const { db, migrate } = await import('../src/db.js');
  const { initializeApp } = await import('../src/seed.js');
  const { authRouter, loadSession, requireAppHeader } = await import('../src/auth.js');
  const { adminRouter } = await import('../src/admin.js');
  const { errorHandler } = await import('../src/http.js');
  const { searchMovies } = await import('../src/animedoc.js');
  migrate(); initializeApp();
  const file = path.join(dir, '.env'); writeFileSync(file, 'PORT=8787\n# preserved\nANIMEDOC_API_KEY=isolated-original\n');
  const app = express(); app.use(cookieParser(), express.json(), loadSession, requireAppHeader);
  app.use('/auth', authRouter); app.use('/admin', adminRouter); app.use(errorHandler);
  const server = app.listen(0); await new Promise<void>((r) => server.once('listening', r));
  const base = `http://localhost:${(server.address() as { port: number }).port}`;
  const originalFetch = globalThis.fetch;
  function client() { let cookie = ''; return { async request(url: string, method = 'GET', body?: unknown, csrf = true) {
    const r = await originalFetch(base + url, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(csrf ? { 'X-BingeBox-Client': 'web' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0];
    return { status: r.status, data: await r.json() };
  } }; }
  const guest = client(), viewer = client(), admin = client();
  const endpoint = '/admin/settings/animedoc';
  try {
    assert.equal((await guest.request(endpoint, 'PUT', { apiKey: 'ad_live_valid-format' })).status, 401);
    await viewer.request('/auth/signup', 'POST', { email: 'viewer@settings.local', name: 'Viewer', password: 'SettingsViewer!2026' });
    assert.equal((await viewer.request(endpoint, 'PUT', { apiKey: 'ad_live_valid-format' })).status, 403);
    assert.equal((await admin.request('/auth/login', 'POST', { email: 'admin@settings.local', password: 'SettingsAdmin!2026' })).status, 200);
    assert.equal((await admin.request(endpoint, 'PUT', { apiKey: 'ad_live_valid-format' }, false)).status, 403);
    for (const apiKey of ['', 'wrong_prefix', 'ad_live_', 'ad_live_bad\nPORT=9999', 'ad_live_bad"', 'ad_live_' + 'x'.repeat(260)]) {
      assert.equal((await admin.request(endpoint, 'PUT', { apiKey })).status, 400);
    }
    assert.equal(readFileSync(file, 'utf8'), 'PORT=8787\n# preserved\nANIMEDOC_API_KEY=isolated-original\n');
    db.prepare("INSERT INTO catalog_feeds (id,payload,updated_at) VALUES ('movies','{}',0)").run();
    const saved = await admin.request(endpoint, 'PUT', { apiKey: '  ad_live_settings-key_123  ' });
    assert.equal(saved.status, 200); assert.deepEqual(saved.data, { ok: true, configured: true });
    assert.equal(readFileSync(file, 'utf8'), 'PORT=8787\n# preserved\nANIMEDOC_API_KEY=ad_live_settings-key_123\n');
    assert.equal(config.animedocApiKey, 'ad_live_settings-key_123');
    assert.equal(process.env.ANIMEDOC_API_KEY, 'ad_live_settings-key_123');
    assert.equal(db.prepare('SELECT COUNT(*) FROM catalog_feeds').pluck().get(), 0);
    assert.deepEqual((await admin.request(endpoint)).data, { configured: true });
    let usedKey = '';
    globalThis.fetch = (async (_url, init) => { usedKey = new Headers(init?.headers).get('X-API-Key') ?? ''; return Response.json({ code: 0, data: { items: [] } }); }) as typeof fetch;
    await searchMovies('verify new credential'); assert.equal(usedKey, 'ad_live_settings-key_123');
    config.root = path.join(dir, 'missing');
    const failed = await admin.request(endpoint, 'PUT', { apiKey: 'ad_live_should-not-apply' });
    assert.equal(failed.status, 503); assert(!JSON.stringify(failed.data).includes('ad_live_should-not-apply'));
    assert.equal(config.animedocApiKey, 'ad_live_settings-key_123', 'Failed disk writes must not alter the running key');
  } finally {
    config.root = originalRoot; globalThis.fetch = originalFetch;
    await new Promise<void>((r) => server.close(() => r())); db.close(); rmSync(dir, { recursive: true, force: true });
  }
});
