/**
 * Story s9, task t15: the design corpus reader reads git objects through the git_cat_file tool. Its options, its validation results and its
 * error codes are those of the reader that ran git itself; the fixed expectations below pin them.
 * Run: npx tsx --test-force-exit src/design/corpus/sources/__tests__/corpus-reader-registry.test.ts
 */

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _resetToolHooksForTests, registerToolHook } from '../../../../daemon/tools/hooks.js';
import { _resetRegistryForTests } from '../../../../daemon/tools/registry.js';
import { ToolDenied } from '../../../../workflow/tracker/tool-denied.js';
import { readPinnedSources, toolGitRunner } from '../git-reader.js';
import { gitFixture } from './git-fixtures.js';

const calls: Array<{ tool: string; caller: string | undefined }> = [];
beforeEach(() => {
	_resetRegistryForTests(); _resetToolHooksForTests(); calls.length = 0;
	registerToolHook({ id: 'spy-cat-file', toolId: 'git_cat_file', async run(ctx) { calls.push({ tool: ctx.toolId, caller: ctx.caller }); } });
});
afterEach(() => { _resetToolHooksForTests(); });

/** What a caller can see of a result: success with the bytes, or the codes of the problems. */
const seen = (r: Awaited<ReturnType<typeof readPinnedSources>>): unknown =>
	r.ok ? { ok: true, blobs: r.value.map(b => ({ path: b.path, bytes: Buffer.from(b.bytes).toString('base64') })) } : { ok: false, codes: r.issues.map(i => i.code) };

test('corpus-reader-registry.test.ts: options, validation results and error codes equal the old reader, including a missing rev in a batch and a binary file', async () => {
	for (const format of ['sha1', 'sha256'] as const) {
		const f = gitFixture(format);
		try {
			const head = f.git('rev-parse', 'HEAD');
			const requests: Record<string, Parameters<typeof readPinnedSources>[1]> = {
				'a binary file': f.request,
				'a binary file and an LFS pointer': { ...f.request, paths: ['binary.bin', 'lfs'] },
				'a missing revision': { ...f.request, revision: 'f'.repeat(head.length) },
				'a missing path': { ...f.request, paths: ['absent'] },
				'a missing path in a batch with a good one': { ...f.request, paths: ['binary.bin', 'absent'] },
				'a blob named as the revision': { ...f.request, revision: f.git('rev-parse', 'HEAD:binary.bin') },
				'a symlink': { ...f.request, paths: ['link'] },
				'an unsafe path': { ...f.request, paths: ['../binary.bin'] },
			};
			const viaTool: Record<string, unknown> = {};
			for (const [name, request] of Object.entries(requests)) {
				viaTool[name] = seen(await readPinnedSources(f.dir, request));
			}
			const t = viaTool as Record<string, { ok: boolean; codes?: string[]; blobs?: { path: string; bytes: string }[] }>;
			assert.deepEqual(t['a binary file']!.blobs, [{ path: 'binary.bin', bytes: Buffer.from(f.binary).toString('base64') }], 'a binary file comes back byte for byte');
			assert.equal(t['a binary file and an LFS pointer']!.ok, true);
			assert.equal(t['a missing revision']!.ok, false);
			assert.equal(t['a missing path in a batch with a good one']!.ok, false, 'a missing path in a batch fails the batch');
			assert.equal(t['a symlink']!.ok, false);
			assert.equal(t['an unsafe path']!.ok, false);
		} finally { f.dispose(); }
	}
	assert.ok(calls.length > 0 && calls.every(c => c.tool === 'git_cat_file' && c.caller === 'workflow'), 'the objects were read through git_cat_file as the workflow');
});

test('corpus-reader-registry.test.ts: limits, cancellation and a denied call behave as before', async () => {
	const f = gitFixture();
	try {
		// limits may only lower the hard bounds, and a tiny byte budget fails with the same code
		const small = await readPinnedSources(f.dir, f.request, { limits: { bytes: 2 } });
		assert.equal(!small.ok && small.issues[0]!.code, 'limit.exceeded');
		assert.equal(small.ok, false);
		// an aborted signal fails with the cancelled result, never a throw
		const aborted = AbortSignal.abort();
		const cancelled = await readPinnedSources(f.dir, f.request, { signal: aborted });
		assert.equal(!cancelled.ok && cancelled.issues[0]!.code, 'inventory.invalid');
		assert.equal(cancelled.ok, false);
		// a denial is thrown, not turned into a source problem
		const denying = async (): Promise<Uint8Array> => { throw new ToolDenied('git_cat_file', 'declined'); };
		await assert.rejects(readPinnedSources(f.dir, f.request, { run: denying }), (e: unknown) => e instanceof ToolDenied && e.reason === 'declined');
		// the default runner is the tool one
		assert.equal(typeof toolGitRunner, 'function');
	} finally { f.dispose(); }
});

test('corpus-reader-registry.test.ts: the reader defaults to the tool runner', () => {
	const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'git-reader.ts'), 'utf8');
	assert.ok(/options\.run \?\? toolGitRunner/.test(text), 'the default runner is the tool one');
	assert.ok(!/runGitBinary|createGitRunner|from 'node:child_process'/.test(text), 'the reader holds no process runner');
});
