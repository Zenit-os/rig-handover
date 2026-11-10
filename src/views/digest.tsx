import type { DigestRow, Night } from '../digest/types.js';

// A job retried this many times or more in a night is flagged for the reader.
export const RETRY_FLAG = 3;

function flags(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.lastStatus === 'fail') out.push('fail');
  if (row.retries >= RETRY_FLAG) out.push(`retries ≥${RETRY_FLAG}`);
  return out;
}

export function Digest({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>first at</th>
              <th>last at</th>
              <th>last error</th>
              <th>flag</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => {
              const f = flags(row);
              return (
                <tr>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{f.length > 0 ? <span class="warn">{f.join(', ')}</span> : <span class="mute">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {night.badLines > 0 ? <p class="mute">{night.badLines} bad line(s) skipped</p> : null}
    </>
  );
}
