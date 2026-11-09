import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';

test('admin movies upload, publish, appear publicly, play, track progress and unpublish independently of AnimeDoc', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bingebox-studio-'));
  Object.assign(process.env, { DATABASE_FILE: path.join(dir, 'studio.db'), DATA_DIR: dir, UPLOADS_DIR: path.join(dir, 'uploads'),
    NODE_ENV: 'test', ANIMEDOC_API_KEY: '', ADMIN_EMAIL: 'admin@studio.local', ADMIN_PASSWORD: 'StudioAdmin!2026' });
  const { db, migrate } = await import('../src/db.js');
  const { config } = await import('../src/config.js'); config.animedocApiKey = '';
  const { initializeApp } = await import('../src/seed.js');
  const { authRouter, loadSession, requireAppHeader } = await import('../src/auth.js');
  const { adminRouter } = await import('../src/admin.js');
  const { catalogRouter } = await import('../src/catalog.js');
  const { meRouter } = await import('../src/me.js');
  const { errorHandler } = await import('../src/http.js');
  const { refreshMovies } = await import('../src/animedoc.js');
  migrate(); initializeApp();
  const app = express(); app.use(cookieParser(), express.json(), loadSession, requireAppHeader);
  app.use('/auth', authRouter); app.use('/admin', adminRouter); app.use('/me', meRouter); app.use('/catalog', catalogRouter);
  app.use('/uploads', express.static(config.uploadsDir)); app.use(errorHandler);
  const server = app.listen(0); await new Promise<void>((r) => server.once('listening', r));
  const base = `http://localhost:${(server.address() as { port: number }).port}`;
  const originalFetch = globalThis.fetch; let upstreamCalls = 0; let upstreamOffline = true;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname !== 'api.animedoc.cloud') return originalFetch(input, init);
    upstreamCalls++;
    if (upstreamOffline) throw new Error('Isolated upstream outage');
    return Response.json({ code: 0, data: url.pathname.endsWith('/section/') ? { featured: [], rows: [] } : { items: [] } });
  }) as typeof fetch;
  function client() { let cookie = ''; return { async request(url: string, method = 'GET', body?: unknown) {
    const form = body instanceof FormData;
    const r = await originalFetch(base + url, { method, headers: { Cookie: cookie, 'X-BingeBox-Client': 'web', ...(!form && body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
    const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0];
    return { status: r.status, data: await r.json() };
  } }; }
  const admin = client(), viewer = client(), guest = client();
  const videoForm = (bytes: Uint8Array) => { const form = new FormData(); form.append('file', new Blob([bytes], { type: 'video/mp4' }), 'my-movie.mp4'); return form; };
  try {
    assert.equal((await guest.request('/admin/uploads/video', 'POST', videoForm(new Uint8Array([1])))).status, 401);
    assert.equal((await viewer.request('/auth/signup', 'POST', { name: 'Studio Viewer', email: 'viewer@studio.local', password: 'StudioViewer!2026' })).status, 201);
    assert.equal((await viewer.request('/admin/uploads/video', 'POST', videoForm(new Uint8Array([1])))).status, 403);
    assert.equal((await admin.request('/auth/login', 'POST', { email: 'admin@studio.local', password: 'StudioAdmin!2026' })).status, 200);
    assert.equal((await admin.request('/admin/uploads/video', 'POST', videoForm(new Uint8Array([1, 2, 3])))).status, 400);
    assert.equal(readdirSync(path.join(config.uploadsDir, 'videos')).length, 0, 'Invalid uploads must be removed');
    const bytes = Buffer.alloc(80); bytes.writeUInt32BE(24, 0); bytes.write('ftypisom', 4);
    const uploaded = await admin.request('/admin/uploads/video', 'POST', videoForm(bytes));
    assert.equal(uploaded.status, 201); assert.match(uploaded.data.url, /^\/uploads\/videos\/.+\.mp4$/); assert.equal(uploaded.data.size, 80);
    const picture = new FormData(); picture.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZVQAAAAASUVORK5CYII=', 'base64')]), 'poster.png');
    const poster = await admin.request('/admin/uploads/image', 'POST', picture); assert.equal(poster.status, 201);
    const body = { type: 'movie', title: 'Independent Studio Release', synopsis: 'An original movie published by the studio administrator.', genres: ['comedy'], posterUrl: poster.data.url,
      year: 2024, runtimeMin: 1, status: 'draft', featured: true, rightsKind: 'licensed', rightsLicense: 'Studio-owned content', sources: [{ url: uploaded.data.url, kind: 'mp4', quality: 'Original', primary: true }] };
    assert.equal((await viewer.request('/admin/titles', 'POST', body)).status, 403);
    const draft = await admin.request('/admin/titles', 'POST', body); assert.equal(draft.status, 201);
    const title = draft.data.title;
    assert.equal((await guest.request('/catalog/titles/' + title.slug)).status, 404);
    assert.equal((await guest.request('/catalog/search?q=Independent')).data.items.length, 0);
    const invalid = await admin.request('/admin/titles', 'POST', { ...body, title: 'Private incomplete draft', posterUrl: '', genres: [] }); assert.equal(invalid.status, 201);
    assert.equal((await admin.request('/admin/titles/' + invalid.data.title.id, 'PATCH', { status: 'published' })).status, 400, 'Quick toggles must also validate publication');
    const publish = await admin.request('/admin/titles/' + title.id, 'PUT', { ...title, status: 'published' }); assert.equal(publish.status, 200);
    assert.match(String(db.prepare('SELECT external_key FROM titles WHERE id=?').pluck().get(title.id)), /^studio:/);
    const home = await guest.request('/catalog/home'); assert.equal(home.status, 200); assert.equal(home.data.hero[0].id, title.id); assert(home.data.rows.find((r: { id: string }) => r.id === 'studio').items.some((t: { id: number }) => t.id === title.id));
    assert.equal((await guest.request('/catalog/browse/movie')).data.hero[0].id, title.id);
    const movies = await guest.request('/catalog/titles?genre=comedy&year=2024&type=movie'); assert.equal(movies.status, 200); assert.equal(movies.data.items[0].id, title.id);
    assert.equal((await guest.request('/catalog/titles?genre=horror')).data.items.length, 0);
    assert.equal((await guest.request('/catalog/search?q=Independent')).data.items[0].id, title.id);
    assert.equal((await guest.request('/catalog/titles/' + title.slug)).status, 200);
    assert.equal((await guest.request('/me/play/' + title.slug)).status, 401);
    const play = await viewer.request('/me/play/' + title.slug); assert.equal(play.status, 200); assert.equal(play.data.sources[0].url, uploaded.data.url);
    const range = await originalFetch(base + play.data.sources[0].url, { headers: { Range: 'bytes=0-15' } }); assert.equal(range.status, 206); assert.equal(range.headers.get('content-range'), 'bytes 0-15/80'); assert.equal((await range.arrayBuffer()).byteLength, 16);
    assert.equal(upstreamCalls, 0, 'Custom movies should not need an AnimeDoc key or source');
    await viewer.request('/me/list/' + title.id, 'PUT', {});
    await viewer.request('/me/progress', 'POST', { titleId: title.id, position: 20, duration: 60 });
    assert.equal((await viewer.request('/me/continue')).data.items[0].id, title.id);
    assert.equal((await viewer.request('/me/play/' + title.slug)).data.resume.position, 20);
    config.animedocApiKey = 'isolated-provider-key';
    assert.equal((await guest.request('/catalog/home')).status, 200, 'Provider failure must not hide local movies');
    const before = upstreamCalls; assert.equal((await viewer.request('/me/play/' + title.slug)).status, 200); assert.equal(upstreamCalls, before);
    upstreamOffline = false; await refreshMovies(); assert.equal((await guest.request('/catalog/home')).data.hero[0].id, title.id, 'Provider sync preserves studio movies');
    await admin.request('/admin/titles/' + title.id, 'PATCH', { status: 'draft' });
    assert.equal((await guest.request('/catalog/titles/' + title.slug)).status, 404); assert.equal((await viewer.request('/me/play/' + title.slug)).status, 404);
    assert.equal((await guest.request('/catalog/search?q=Independent')).data.items.length, 0);
    assert.equal((await admin.request('/admin/titles/' + title.id, 'PATCH', { status: 'published' })).status, 200);
    assert.equal((await admin.request('/admin/titles/' + title.id, 'DELETE')).status, 200);
    assert.equal((await guest.request('/catalog/titles/' + title.slug)).status, 404);
    assert.equal((await viewer.request('/me/list')).data.items.length, 0);
  } finally { globalThis.fetch = originalFetch; await new Promise<void>((r) => server.close(() => r())); db.close(); rmSync(dir, { recursive: true, force: true }); }
});
