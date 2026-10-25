/** A fake gh on PATH: logs argv and stdin, and behaves by FAKE_MODE. */

import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = `#!/bin/sh
echo "$@" >> "$FAKE_LOG"
if [ "$1" = auth ] && [ "$FAKE_MODE" = fail403 ]; then echo "github.com: logged in as fake" ; exit 0; fi
case "$*" in
  *--json*)
    if [ -n "$FAKE_JSON_FILE" ]; then cat "$FAKE_JSON_FILE"; exit 0; fi ;;
  *--log*)
    if [ -n "$FAKE_LOG_FAIL" ]; then echo "$FAKE_LOG_FAIL" >&2; exit 1; fi
    if [ -n "$FAKE_LOG_STDOUT_FILE" ]; then cat "$FAKE_LOG_STDOUT_FILE"; exit 0; fi ;;
esac
case "$FAKE_MODE" in
  stdin) cat > "$FAKE_LOG.stdin"; if [ -n "$FAKE_STDOUT_FILE" ]; then cat "$FAKE_STDOUT_FILE"; else echo ok; fi ;;
  echoin) cat >&2; exit 1 ;;
  fail403) echo "HTTP 403: forbidden" >&2; exit 1 ;;
  fail404) echo "HTTP 404: not found" >&2; exit 1 ;;
  multibyte) printf 'aaaa\\303\\251\\303\\251' ;;
  sleep) sleep 5 ;;
  *) if [ -n "$FAKE_STDOUT_FILE" ]; then cat "$FAKE_STDOUT_FILE"; else echo ok; fi ;;
esac
`;

export interface FakeGh { dir: string; log: string; calls: () => string[]; stdin: () => string; restore: () => void }

/** `stdout`, when given, is what the default mode prints instead of 'ok'. */
export function installFakeGh(mode: string, stdout?: string, logs?: { stdout?: string; fail?: string; json?: string }): FakeGh {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fakegh-'));
	const bin = join(dir, 'gh');
	writeFileSync(bin, SCRIPT);
	chmodSync(bin, 0o755);
	const log = join(dir, 'calls.log');
	writeFileSync(log, '');
	const saved = { PATH: process.env['PATH'], FAKE_LOG: process.env['FAKE_LOG'], FAKE_MODE: process.env['FAKE_MODE'], FAKE_STDOUT_FILE: process.env['FAKE_STDOUT_FILE'], FAKE_LOG_STDOUT_FILE: process.env['FAKE_LOG_STDOUT_FILE'], FAKE_LOG_FAIL: process.env['FAKE_LOG_FAIL'], FAKE_JSON_FILE: process.env['FAKE_JSON_FILE'] };
	process.env['PATH'] = `${dir}:${saved.PATH ?? ''}`;
	process.env['FAKE_LOG'] = log;
	process.env['FAKE_MODE'] = mode;
	if (stdout !== undefined) { writeFileSync(`${log}.out`, stdout); process.env['FAKE_STDOUT_FILE'] = `${log}.out`; } else { delete process.env['FAKE_STDOUT_FILE']; }
	delete process.env['FAKE_LOG_STDOUT_FILE'];
	delete process.env['FAKE_LOG_FAIL'];
	delete process.env['FAKE_JSON_FILE'];
	if (logs?.json !== undefined) { writeFileSync(`${log}.json`, logs.json); process.env['FAKE_JSON_FILE'] = `${log}.json`; }
	if (logs?.stdout !== undefined) { writeFileSync(`${log}.logout`, logs.stdout); process.env['FAKE_LOG_STDOUT_FILE'] = `${log}.logout`; }
	if (logs?.fail !== undefined) { process.env['FAKE_LOG_FAIL'] = logs.fail; }
	return {
		dir, log,
		calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean),
		stdin: () => { try { return readFileSync(`${log}.stdin`, 'utf8'); } catch { return ''; } },
		restore: () => {
			for (const [k, v] of Object.entries(saved)) {
				const key = k === 'PATH' ? 'PATH' : k;
				if (v === undefined) { delete process.env[key]; } else { process.env[key] = v; }
			}
		},
	};
}
