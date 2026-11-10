// Plan morning-digest § 1. The contract between the run log reader and everything that shows
// a night (the digest page, its JSON, the board link). Committed before the reader so section 2
// can start against it.

/** Status of one run, as written in `runs/<night>.jsonl`. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One job's night, folded from every valid log line for that job. */
export type DigestRow = {
  /** Job name, as in the log (`lane/sync`). */
  job: string;
  /** Owner from the job's last line. `null` when the log says so: the row is kept, views show `—`. */
  owner: string | null;
  /** Valid lines for this job, whatever their status. */
  runs: number;
  /** Lines for this job with status `retry`. */
  retries: number;
  /** Status of the job's last line. */
  lastStatus: RunStatus;
  /** Most recent `error` seen for this job, even if a later line succeeded. `null` if none. */
  lastError: string | null;
  /** `at` of the job's first line, verbatim (offset kept, never converted to UTC). */
  firstAt: string;
  /** `at` of the job's last line, verbatim. */
  lastAt: string;
};

/** A night as read from disk. */
export type Night = {
  /** `YYYY-MM-DD`, the file name without `.jsonl`. */
  night: string;
  /** One row per job, sorted by job, so the page and the JSON agree on order. */
  rows: DigestRow[];
  /** Non-blank lines that didn't parse or didn't match the line shape. Counted, never thrown. */
  badLines: number;
};

/**
 * Reads `<runsDir>/<night>.jsonl` into one row per job.
 *
 * - Returns `null` when there is no such file (or `night` isn't `YYYY-MM-DD`): the page 404s.
 * - An empty file returns a night with no rows ("nothing ran").
 * - A bad line bumps `badLines` and is skipped; it never throws.
 * - Never writes to `runsDir`.
 *
 * Implemented as `readNight` in `src/digest/reader.ts`.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
