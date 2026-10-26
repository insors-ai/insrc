/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t2: runShell, runShellBytes and spawnManaged start nothing for an
 * aborted signal (explicit or ambient) and stop a running command when either aborts.
 * Run: npx tsx --test src/daemon/tools/__tests__/shell-helper-abort.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { runShell, runShellBytes, spawnManaged } from '../shell-helper.js';
import { runWithToolSignal } from '../tool-signal.js';
import { cleanup, fileExists, tick, tmp } from './_proc.js';

const aborted = (): AbortSignal => { const c = new AbortController(); c.abort(); return c.signal; };

test('shell-helper-abort.test.ts: an already-aborted explicit signal starts no process in runShell, runShellBytes or spawnManaged', async () => {
	const dir = tmp();
	try {
		const marker = join(dir, 'marker');
		const argv = ['sh', '-c', `touch '${marker}'`];
		const a = await runShell(argv, { signal: aborted() });
		assert.equal(a.aborted, true); assert.equal(a.code, null); assert.equal(a.spawnError, false);
		const b = await runShellBytes(argv, { signal: aborted() });
		assert.equal(b.aborted, true); assert.equal(b.code, null);
		const m = spawnManaged('sh', ['-c', `touch '${marker}'`], { signal: aborted() });
		assert.equal(m.spawned, false);
		assert.deepEqual(await m.settled, { code: null, signal: null, timedOut: false, aborted: true });
		await tick(150);
		assert.equal(fileExists(marker), false, 'no process ran');
	} finally { cleanup(dir); }
});

test('shell-helper-abort.test.ts: an already-aborted ambient signal starts no process either', async () => {
	const dir = tmp();
	try {
		const marker = join(dir, 'marker');
		const argv = ['sh', '-c', `touch '${marker}'`];
		await runWithToolSignal(aborted(), async () => {
			assert.equal((await runShell(argv)).aborted, true);
			assert.equal((await runShellBytes(argv)).aborted, true);
			assert.equal(spawnManaged('sh', ['-c', 'true']).spawned, false);
		});
		await tick(150);
		assert.equal(fileExists(marker), false);
	} finally { cleanup(dir); }
});

test('shell-helper-abort.test.ts: a running process is killed when the explicit or the ambient signal aborts', async () => {
	for (const mode of ['explicit', 'ambient'] as const) {
		const c = new AbortController();
		const started = Date.now();
		const run = mode === 'explicit'
			? runShell(['sleep', '30'], { signal: c.signal })
			: runWithToolSignal(c.signal, () => runShell(['sleep', '30']));
		setTimeout(() => c.abort(), 100);
		const r = await run;
		assert.equal(r.aborted, true, mode);
		assert.equal(r.code, null, mode);
		assert.ok(Date.now() - started < 3000, `${mode}: settled quickly`);
		const c2 = new AbortController();
		const rb = mode === 'explicit'
			? runShellBytes(['sleep', '30'], { signal: c2.signal })
			: runWithToolSignal(c2.signal, () => runShellBytes(['sleep', '30']));
		setTimeout(() => c2.abort(), 100);
		assert.equal((await rb).aborted, true, mode);
	}
});

test('shell-helper-abort.test.ts: a call with no signal and no context behaves as before', async () => {
	const r = await runShell(['sh', '-c', 'echo hi; echo err 1>&2; exit 3']);
	assert.equal(r.stdout, 'hi\n'); assert.equal(r.stderr, 'err\n'); assert.equal(r.code, 3);
	assert.equal(r.aborted, undefined); assert.equal(r.timedOut, false);
	const b = await runShellBytes(['sh', '-c', 'printf abc']);
	assert.equal(Buffer.from(b.stdout).toString(), 'abc'); assert.equal(b.aborted, false);
});
