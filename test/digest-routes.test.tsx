import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Plan morning-digest § 2d. Routes read `config.runsDir`, so each test injects a temp dir of
// fixtures written here. `runs/` is never read or written.

const GOOD = [
  '{"at":"2026-03-01T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-03-02T00:00:00+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"lock held"}',
  '{"at":"2026-03-02T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-03-01T23:30:00+01:00","job":"notes/backup","status":"fail","owner":null,"error":"quota exceeded"}',
  '{"at":"2026-03-01T22:00:00+01:00","job":"digest/render","status":"retry","owner":"lane-07"}',
  '{"at":"2026-03-01T22:10:00+01:00","job":"digest/render","status":"retry","owner":"lane-07"}',
  '{"at":"2026-03-01T22:20:00+01:00","job":"digest/render","status":"retry","owner":"lane-07"}',
  '{"at":"2026-03-01T22:30:00+01:00","job":"digest/render","status":"ok","owner":"lane-07"}',
];

describe('digest routes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir };
  const app = createApp(config);

  beforeAll(() => {
    writeFileSync(join(dir, '2026-03-01.jsonl'), GOOD.join('\n') + '\n');
    writeFileSync(join(dir, '2026-03-03.jsonl'), '');
    writeFileSync(
      join(dir, '2026-03-04.jsonl'),
      [
        '{"at":"2026-03-04T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        'this is not json',
        '{"at":"2026-03-04T02:00:00+01:00","job":"lane/sync","status":"fail","owner":"rook","error":"boom"}',
        '',
      ].join('\n'),
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  describe('GET /digest/:night', () => {
    it('200 with the rows of a night that exists', async () => {
      const res = await app.request('/digest/2026-03-01');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('digest · 2026-03-01');
      expect(html).toContain('lane/sync');
      expect(html).toContain('notes/backup');
      expect(html).toContain('quota exceeded');
      expect(html).toContain('retries ≥3'); // digest/render: 3 retries
      expect(html).toContain('fail'); // notes/backup last status
      expect(html).not.toContain('nothing ran');
    });

    it('404 for a night with no file', async () => {
      const res = await app.request('/digest/2026-01-01');
      expect(res.status).toBe(404);
    });

    it('404 for a night name that is not YYYY-MM-DD', async () => {
      const res = await app.request('/digest/not-a-night');
      expect(res.status).toBe(404);
    });

    it('renders "nothing ran" for an empty night', async () => {
      const res = await app.request('/digest/2026-03-03');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('digest · 2026-03-03');
      expect(html).toContain('nothing ran');
      expect(html).not.toContain('<table>');
    });

    it('still renders a night with a bad line, and says how many were skipped', async () => {
      const res = await app.request('/digest/2026-03-04');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('lane/sync');
      expect(html).toContain('boom');
      expect(html).toContain('1 bad line(s) skipped');
    });
  });

  describe('GET /api/digest/:night', () => {
    it('200 with the rows of a night that exists, sorted by job', async () => {
      const res = await app.request('/api/digest/2026-03-01');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Night;
      expect(body.night).toBe('2026-03-01');
      expect(body.badLines).toBe(0);
      expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync', 'notes/backup']);
      expect(body.rows.find((r) => r.job === 'lane/sync')).toEqual({
        job: 'lane/sync',
        owner: 'rook',
        runs: 3,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'lock held',
        firstAt: '2026-03-01T23:00:00+01:00',
        lastAt: '2026-03-02T01:00:00+01:00',
      });
    });

    it('404 for a night with no file', async () => {
      const res = await app.request('/api/digest/2026-01-01');
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'no such night', night: '2026-01-01' });
    });

    it('200 with no rows for the empty night', async () => {
      const res = await app.request('/api/digest/2026-03-03');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ night: '2026-03-03', rows: [], badLines: 0 });
    });

    it('200 with badLines counted for a night with a bad line', async () => {
      const res = await app.request('/api/digest/2026-03-04');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Night;
      expect(body.badLines).toBe(1);
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0]).toMatchObject({ job: 'lane/sync', runs: 2, lastStatus: 'fail', lastError: 'boom' });
    });
  });

  it('page and JSON agree on job order for the same night', async () => {
    const page = await (await app.request('/digest/2026-03-01')).text();
    const json = (await (await app.request('/api/digest/2026-03-01')).json()) as Night;
    const positions = json.rows.map((r) => page.indexOf(`<td>${r.job}</td>`));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
