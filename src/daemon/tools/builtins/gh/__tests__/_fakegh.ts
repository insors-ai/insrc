/** A fake gh on PATH: logs argv and stdin, and behaves by FAKE_MODE. */

import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = `#!/bin/sh
echo "$@" >> "$FAKE_LOG"
if [ "$1" = auth ]; then echo "github.com: logged in as fake" ; exit 0; fi
case "$FAKE_MODE" in
  stdin) cat > "$FAKE_LOG.stdin" ;;
  fail403) echo "HTTP 403: forbidden" >&2; exit 1 ;;
  fail404) echo "HTTP 404: not found" >&2; exit 1 ;;
  multibyte) printf 'aaaa\\303\\251\\303\\251' ;;
  sleep) sleep 5 ;;
  *) if [ -n "$FAKE_STDOUT_FILE" ]; then cat "$FAKE_STDOUT_FILE"; else echo ok; fi ;;
esac
`;

export interface FakeGh { dir: string; log: string; calls: () => string[]; stdin: () => string; restore: () => void }

/** `stdout`, when given, is what the default mode prints instead of 'ok'. */
export function installFakeGh(mode: string, stdout?: string): FakeGh {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fakegh-'));
	const bin = join(dir, 'gh');
	writeFileSync(bin, SCRIPT);
	chmodSync(bin, 0o755);
	const log = join(dir, 'calls.log');
	writeFileSync(log, '');
	const saved = { PATH: process.env['PATH'], FAKE_LOG: process.env['FAKE_LOG'], FAKE_MODE: process.env['FAKE_MODE'], FAKE_STDOUT_FILE: process.env['FAKE_STDOUT_FILE'] };
	process.env['PATH'] = `${dir}:${saved.PATH ?? ''}`;
	process.env['FAKE_LOG'] = log;
	process.env['FAKE_MODE'] = mode;
	if (stdout !== undefined) { writeFileSync(`${log}.out`, stdout); process.env['FAKE_STDOUT_FILE'] = `${log}.out`; } else { delete process.env['FAKE_STDOUT_FILE']; }
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
