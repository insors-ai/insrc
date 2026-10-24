/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** runShellBytes (Story s4, task t2): stdin, binary stdout, the isolated git environment and independent limits. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GIT_READ_ARGS as READER_ARGS, gitEnvironment as readerEnvironment } from '../../../design/corpus/sources/git-reader.js';
import { GIT_READ_ARGS, gitEnvironment } from '../git-isolation.js';
import { runShell, runShellBytes } from '../shell-helper.js';

const text = (b: Uint8Array): string => Buffer.from(b).toString('utf8');

test('runShellBytes returns stdout bytes unchanged, delivers stdin and applies the isolate environment', async () => {
	// every byte value survives stdin to stdout, with no text decoding
	const all = Uint8Array.from({ length: 256 }, (_, i) => i);
	const echoed = await runShellBytes(['cat'], { stdin: all });
	assert.equal(echoed.code, 0);
	assert.deepEqual(Buffer.from(echoed.stdout), Buffer.from(all));
	assert.equal(text((await runShellBytes(['cat'], { stdin: 'héllo' })).stdout), 'héllo');

	// isolate: PATH and the fixed git variables only, never the daemon's
	const saved = { ...process.env };
	process.env['MY_SECRET'] = 'leak';
	process.env['GIT_ALTERNATE_OBJECT_DIRECTORIES'] = '/elsewhere';
	process.env['GIT_CONFIG_COUNT'] = '1';
	try {
		const env = await runShellBytes(['env'], { isolate: true });
		assert.equal(env.code, 0, env.stderr);
		const vars = new Map(text(env.stdout).split('\n').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)] as const));
		assert.equal(vars.get('PATH'), process.env['PATH']);
		assert.equal(vars.get('LC_ALL'), 'C');
		assert.equal(vars.get('GIT_CONFIG_GLOBAL'), '/dev/null');
		assert.equal(vars.get('GIT_NO_REPLACE_OBJECTS'), '1');
		assert.equal(vars.has('MY_SECRET'), false);
		assert.equal(vars.has('GIT_ALTERNATE_OBJECT_DIRECTORIES'), false);
		assert.equal(vars.has('GIT_CONFIG_COUNT'), false);
		// without isolate the daemon's environment is passed on, as runShell does
		const plain = await runShellBytes(['env']);
		assert.match(text(plain.stdout), /MY_SECRET=leak/);
	} finally {
		for (const k of ['MY_SECRET', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG_COUNT']) { delete process.env[k]; }
		Object.assign(process.env, saved);
	}

	// one copy: the corpus reader's own definitions stay equal to the shared module until s7 moves it
	assert.deepEqual(gitEnvironment(), readerEnvironment());
	assert.deepEqual([...GIT_READ_ARGS], [...READER_ARGS]);
});

test('runShellBytes reports a stdin write error and a cancellation and leaves runShell unchanged', async () => {
	// the command exits without reading its 32 MB of input: a result, not a throw
	const gone = await runShellBytes(['sh', '-c', 'exit 3'], { stdin: new Uint8Array(32 * 1024 * 1024) });
	assert.equal(gone.code, 3);
	assert.equal(gone.spawnError, false);
	assert.match(gone.stdinError ?? '', /EPIPE|write/i);

	// a spawn error is a result
	const missing = await runShellBytes(['/no/such/command'], { stdin: 'x' });
	assert.equal(missing.spawnError, true);
	assert.match(missing.stderr, /\[spawn\]/);

	// a signal aborted while the command runs kills it; one aborted before it starts never spawns it
	const ctl = new AbortController();
	setTimeout(() => ctl.abort(), 50);
	const cancelled = await runShellBytes(['sleep', '5'], { signal: ctl.signal });
	assert.equal(cancelled.aborted, true);
	assert.equal(cancelled.timedOut, false);
	assert.equal(cancelled.signal, 'SIGKILL');
	const before = new AbortController(); before.abort();
	assert.equal((await runShellBytes(['sleep', '5'], { signal: before.signal })).aborted, true);

	// a time-out is a result too
	const slow = await runShellBytes(['sleep', '5'], { timeoutMs: 50 });
	assert.equal(slow.timedOut, true);

	// runShell keeps its behaviour: text stdout, no stdin, the same result shape
	const r = await runShell(['printf', 'aéb']);
	assert.equal(r.stdout, 'aéb');
	assert.equal(r.code, 0);
	assert.equal('stderrOverflow' in r, false);
});

test('independently lowered stdout and stderr limits behave as the corpus reader\'s limits do and stderr overflow sets stderrOverflow', async () => {
	// stdout over its own limit: truncated, prefix kept, stderr untouched
	const out = await runShellBytes(['sh', '-c', 'head -c 1000 /dev/zero; echo err >&2'], { stdoutLimit: 10, stderrLimit: 100 });
	assert.equal(out.stdoutTruncated, true);
	assert.equal(out.stdout.length, 10);
	assert.equal(out.stderr, 'err\n');
	assert.equal(out.stderrOverflow, false);
	assert.equal(out.code, 0);

	// stderr over its own limit: the process is killed, stderrOverflow is set, stdout is not cut
	const err = await runShellBytes(['sh', '-c', 'echo out; yes x >&2'], { stdoutLimit: 1000, stderrLimit: 100, timeoutMs: 10_000 });
	assert.equal(err.stderrOverflow, true);
	assert.equal(err.timedOut, false);
	assert.ok(err.stderr.length <= 100, 'only the captured prefix is kept');
	assert.equal(text(err.stdout), 'out\n');
	assert.equal(err.stdoutTruncated, false);
	assert.equal(err.signal, 'SIGKILL');

	// with neither limit passed, maxBytes is the shared default for both
	const shared = await runShellBytes(['sh', '-c', 'head -c 50 /dev/zero; echo e >&2'], { maxBytes: 20 });
	assert.equal(shared.stdout.length, 20);
	assert.equal(shared.stdoutTruncated, true);
});
