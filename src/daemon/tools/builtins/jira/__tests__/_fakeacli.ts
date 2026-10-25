/** A fake acli on PATH: logs argv and behaves by FAKE_MODE; the 'jira auth status' probe behaves by FAKE_PROBE. */

import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = `#!/bin/sh
echo "$@" >> "$FAKE_LOG"
if [ "$1 $2 $3" = "jira auth status" ]; then
  case "$FAKE_PROBE" in
    unauthorized) echo "✗ Error: unauthorized: use acli jira auth login to authenticate" >&2; exit 1 ;;
    network) echo "dial tcp: lookup example.atlassian.net: no such host" >&2; exit 1 ;;
    file) cat "$FAKE_STDOUT_FILE"; exit 0 ;;
    sleep) sleep 5 ;;
    *) printf '✓ Authenticated\\n  Site: example.atlassian.net\\n'; exit 0 ;;
  esac
fi
case "$FAKE_MODE" in
  fail-generic) echo "✗ Error: failed to fetch work item details" >&2; exit 1 ;;
  fail-reject) echo "✗ Error: Issue does not exist or you do not have permission to see it." >&2; exit 1 ;;
  fail-unauthorized) echo "✗ Error: unauthorized: use acli jira auth login to authenticate" >&2; exit 1 ;;
  fail-network) echo "dial tcp: lookup example.atlassian.net: no such host" >&2; exit 1 ;;
  fail-file) cat "$FAKE_STDOUT_FILE" >&2; exit 1 ;;
  exit127) exit 127 ;;
  sleep) sleep 5 ;;
  big) head -c 300000 /dev/zero | tr '\\0' 'x' ;;
  *) if [ -n "$FAKE_STDOUT_FILE" ]; then cat "$FAKE_STDOUT_FILE"; else echo ok; fi; exit "\${FAKE_EXIT:-0}" ;;
esac
`;

export interface FakeAcli { dir: string; log: string; calls: () => string[]; restore: () => void }

/** `stdout`, when given, is what the default mode prints; `probe` is how 'acli jira auth status' answers. */
export function installFakeAcli(mode: string, opts: { stdout?: string; probe?: string; exit?: number } = {}): FakeAcli {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-fakeacli-'));
  const bin = join(dir, 'acli');
  writeFileSync(bin, SCRIPT);
  chmodSync(bin, 0o755);
  const log = join(dir, 'calls.log');
  writeFileSync(log, '');
  const keys = ['PATH', 'FAKE_LOG', 'FAKE_MODE', 'FAKE_PROBE', 'FAKE_STDOUT_FILE', 'FAKE_EXIT'] as const;
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env['PATH'] = `${dir}:${saved['PATH'] ?? ''}`;
  process.env['FAKE_LOG'] = log;
  process.env['FAKE_MODE'] = mode;
  if (opts.probe !== undefined) { process.env['FAKE_PROBE'] = opts.probe; } else { delete process.env['FAKE_PROBE']; }
  if (opts.exit !== undefined) { process.env['FAKE_EXIT'] = String(opts.exit); } else { delete process.env['FAKE_EXIT']; }
  if (opts.stdout !== undefined) { writeFileSync(`${log}.out`, opts.stdout); process.env['FAKE_STDOUT_FILE'] = `${log}.out`; } else { delete process.env['FAKE_STDOUT_FILE']; }
  return {
    dir, log,
    calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean),
    restore: () => { for (const k of keys) { const v = saved[k]; if (v === undefined) { delete process.env[k]; } else { process.env[k] = v; } } },
  };
}
