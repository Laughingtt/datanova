/**
 * Tests for the export HTTP route.
 *
 * Boots a minimal Hono app with the export route mounted and uses
 * `app.request()` (built into Hono) to drive it — no live server required.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createExportRoutes } from '../exports.js';

function makeApp() {
  const app = new Hono();
  app.route('/', createExportRoutes());
  return app;
}

describe('POST /api/exports/csv', () => {
  it('returns text/csv with attachment Content-Disposition', async () => {
    const app = makeApp();
    const res = await app.request('/api/exports/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columns: ['id', 'name'],
        rows: [[1, 'Alice'], [2, 'Bob']],
        filename: 'users',
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^text\/csv/);
    const cd = res.headers.get('Content-Disposition') || '';
    expect(cd).toMatch(/^attachment/);
    expect(cd).toMatch(/users-\d{8}-\d{6}\.csv/);
    const body = await res.text();
    expect(body).toBe('id,name\n1,Alice\n2,Bob');
  });
});

describe('POST /api/exports/json', () => {
  it('returns application/json with a row-oriented payload', async () => {
    const app = makeApp();
    const res = await app.request('/api/exports/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columns: ['id', 'name'],
        rows: [[1, 'Alice']],
        filename: 'one',
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
    const body = JSON.parse(await res.text());
    expect(body).toEqual([{ id: 1, name: 'Alice' }]);
  });
});

describe('POST /api/exports/xlsx', () => {
  it('returns application/vnd.openxmlformats with a binary body', async () => {
    const app = makeApp();
    const res = await app.request('/api/exports/xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columns: ['x'],
        rows: [[1], [2]],
        filename: 'nums',
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/vnd\.openxmlformats/);
    const ab = await res.arrayBuffer();
    expect(ab.byteLength).toBeGreaterThan(100);
  });
});

describe('input validation', () => {
  it('rejects empty columns', async () => {
    const app = makeApp();
    const res = await app.request('/api/exports/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns: [], rows: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown format', async () => {
    const app = makeApp();
    const res = await app.request('/api/exports/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns: ['a'], rows: [[1]] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const app = makeApp();
    const res = await app.request('/api/exports/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('rejects row/cell that overflow the column count', async () => {
    const app = makeApp();
    const res = await app.request('/api/exports/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns: ['a', 'b'], rows: [[1]] }),
    });
    expect(res.status).toBe(400);
  });
});