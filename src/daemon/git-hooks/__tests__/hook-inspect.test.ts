/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBlock } from '../hook-block.js';
import { inspectHook } from '../hook-inspect.js';

const ENTRY = "/opt/insrc's/out/bin/insrc-git-hook.js";

test('src/daemon/git-hooks/__tests__/hook-inspect.test.ts: inspection reports present, absent, foreign, early-exit and stale-entry files', async () => {
	const d = mkdtempSync(join(tmpdir(), 'hook-inspect-'));
	try {
		const none = await inspectHook(join(d, 'none'), ENTRY);
		assert.deepEqual([none.present, none.foreign, none.earlyExit, none.stale], [false, false, false, false]);

		const ours = join(d, 'ours'); await applyBlock(ours, ENTRY, 'post-merge');
		const own = await inspectHook(ours, ENTRY);
		assert.deepEqual([own.present, own.foreign, own.earlyExit, own.stale], [true, false, false, false], 'a file holding only our block has no foreign content');
		assert.equal(own.recordedEntry, ENTRY);

		const foreign = join(d, 'foreign'); writeFileSync(foreign, '#!/bin/sh\necho mine\n');
		const only = await inspectHook(foreign, ENTRY);
		assert.deepEqual([only.present, only.foreign, only.earlyExit], [false, true, false]);
		await applyBlock(foreign, ENTRY, 'post-merge');
		const both = await inspectHook(foreign, ENTRY);
		assert.deepEqual([both.present, both.foreign, both.earlyExit, both.stale], [true, true, false, false]);

		for (const [name, last] of [['exit', 'exit 0'], ['exec', 'exec ./run.sh "$@"']] as const) {
			const file = join(d, name); writeFileSync(file, `#!/bin/sh\necho x\n${last}\n\n`);
			assert.equal((await inspectHook(file, ENTRY)).earlyExit, true, name);
			await applyBlock(file, ENTRY, 'post-merge');
			assert.equal((await inspectHook(file, ENTRY)).earlyExit, true, `${name} stays flagged with our block appended`);
		}

		const stale = await inspectHook(ours, '/somewhere/else.js');
		assert.deepEqual([stale.present, stale.stale, stale.recordedEntry], [true, true, ENTRY]);

		const bad = await inspectHook(d, ENTRY);
		assert.ok(bad.unreadable !== undefined, 'a path that cannot be read is reported');
	} finally { rmSync(d, { recursive: true, force: true }); }
});
