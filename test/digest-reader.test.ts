import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const before = readFileSync('runs/2026-10-28.jsonl', 'utf8');
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs, sorted by job, and counts the 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('folds each job into runs, retries, last status, last error, first and last time', () => {
    const row = (job: string) => night!.rows.find((r) => r.job === job);
    expect(row('lane/sync')).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(row('notes/backup')).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(row('rig/rotate-logs')).toMatchObject({ runs: 1, lastStatus: 'ok', lastError: null, owner: 'lane-07' });
  });

  it('keeps a row whose owner is null', () => {
    expect(night!.rows.find((r) => r.job === 'digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });

  it('leaves runs/ untouched', () => {
    expect(readFileSync('runs/2026-10-28.jsonl', 'utf8')).toBe(before);
  });
});

describe('readNight edges', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight('runs', '../runs/2026-10-28')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    writeFileSync(join(dir, '2026-02-01.jsonl'), '');
    expect(readNight(dir, '2026-02-01')).toEqual({ night: '2026-02-01', rows: [], badLines: 0 });
  });

  it('counts lines of the wrong shape as bad and skips blank lines', () => {
    const lines = [
      '{"at":"2026-02-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '',
      'not json',
      '[1,2]',
      'null',
      '{"at":"2026-02-02T01:00:00+01:00","job":"a","status":"done","owner":"x"}',
      '{"at":"2026-02-02T01:00:00+01:00","status":"ok","owner":"x"}',
      '{"at":"2026-02-02T01:00:00+01:00","job":"a","status":"ok","owner":7}',
      '{"at":"2026-02-02T02:00:00+01:00","job":"a","status":"fail","owner":"x","error":"boom"}',
      '',
    ];
    writeFileSync(join(dir, '2026-02-02.jsonl'), lines.join('\n'));
    const night = readNight(dir, '2026-02-02');
    expect(night!.badLines).toBe(6);
    expect(night!.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 2,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'boom',
        firstAt: '2026-02-02T01:00:00+01:00',
        lastAt: '2026-02-02T02:00:00+01:00',
      },
    ]);
  });
});
