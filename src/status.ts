import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lastBeat, type Beat } from './heartbeat.js';

// A night on disk, with its jobs counted by last status. `null` counts: the night file could not be read.
export type NightSummary = {
  night: string;
  ok: number | null;
  retry: number | null;
  fail: number | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// Counts come from the digest reader, not a second parse of the log: jobs by their last status.
export function summarizeNight(runsDir: string, night: string): NightSummary {
  const parsed = readNight(runsDir, night);
  if (!parsed) return { night, ok: null, retry: null, fail: null };
  const count = (s: string) => parsed.rows.filter((r) => r.lastStatus === s).length;
  return { night, ok: count('ok'), retry: count('retry'), fail: count('fail') };
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => summarizeNight(config.runsDir, n)),
  };
}
