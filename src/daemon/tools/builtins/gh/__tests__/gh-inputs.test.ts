import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { ghReleaseAssetTool, ghRepoManageTool } from '../manage.js';
import { installFakeGh } from './_fakegh.js';

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };

test('gh-inputs.test.ts: release download requires a tag, a non-empty pattern list or an archive; set-default needs exactly one of repository, view, unset', async () => {
	const gh = installFakeGh('ok', '');
	try {
		const call = (tool: typeof ghReleaseAssetTool, input: Record<string, unknown>) => tool.execute(input, deps);
		// release download: none of tag, pattern, archive is refused, and gh does not run
		const none = await call(ghReleaseAssetTool, { op: 'download' });
		assert.equal(none.success, false);
		assert.equal(none.failure?.kind, 'rejected');
		assert.match(none.error ?? '', /at least one of tag, pattern, archive/);
		const onlyDir = await call(ghReleaseAssetTool, { op: 'download', dir: 'd' });
		assert.equal(onlyDir.success, false);
		assert.equal(gh.calls().length, 0, 'gh did not run for a refused input');
		// an empty pattern list is not a pattern: the schema refuses it
		assert.equal(validateAgainstSchema(ghReleaseAssetTool.inputSchema as unknown as StructuredSchema, { op: 'download', pattern: [] }).ok, false);
		// each of the three alone is enough
		for (const input of [{ tag: 'v1' }, { pattern: ['*.zip'] }, { archive: 'tar.gz' }]) {
			const r = await call(ghReleaseAssetTool, { op: 'download', ...input });
			assert.equal(r.success, true, JSON.stringify(input));
		}
		// output is a file path, never '-', and not with dir; clobber and skipExisting do not go together
		assert.match((await call(ghReleaseAssetTool, { op: 'download', tag: 'v1', output: '-' })).error ?? '', /never "-"/);
		assert.match((await call(ghReleaseAssetTool, { op: 'download', tag: 'v1', output: 'f', dir: 'd' })).error ?? '', /at most one of output, dir/);
		assert.match((await call(ghReleaseAssetTool, { op: 'download', tag: 'v1', clobber: true, skipExisting: true })).error ?? '', /at most one of clobber, skipExisting/);
		// upload needs at least one file
		assert.equal(validateAgainstSchema(ghReleaseAssetTool.inputSchema as unknown as StructuredSchema, { op: 'upload', tag: 'v1', files: [] }).ok, false);

		// set-default: exactly one of repository, view, unset
		const before = gh.calls().length;
		for (const input of [{}, { repository: 'o/r', view: true }, { view: true, unset: true }, { repository: 'o/r', view: true, unset: true }]) {
			const r = await call(ghRepoManageTool as never, { op: 'set-default', ...input });
			assert.equal(r.success, false, JSON.stringify(input));
			assert.match(r.error ?? '', /exactly one of repository, view, unset/);
		}
		assert.equal(gh.calls().length, before, 'gh did not run for a refused input');
		for (const input of [{ repository: 'o/r' }, { view: true }, { unset: true }]) {
			const r = await call(ghRepoManageTool as never, { op: 'set-default', ...input });
			assert.equal(r.success, true, JSON.stringify(input));
		}
		// a false boolean is not given
		assert.equal((await call(ghRepoManageTool as never, { op: 'set-default', repository: 'o/r', view: false })).success, true);
		// a field the op does not accept, and an op the tool does not offer
		assert.match((await call(ghRepoManageTool as never, { op: 'archive', repository: 'o/r', force: true })).error ?? '', /does not accept the field force/);
		assert.match((await call(ghRepoManageTool as never, { op: 'zap' })).error ?? '', /unknown op "zap"/);
	} finally { gh.restore(); }
});
