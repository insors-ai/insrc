import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { ghReleaseAssetTool, ghRepoManageTool } from '../manage.js';
import { ghCacheTool, ghGistTool, ghGpgKeyTool, ghSecretTool, ghSshKeyTool, ghVariableTool } from '../resources.js';
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

test("gh-inputs.test.ts: gist rename's three positionals, gist edit without content or filename, exactly-one-of rules of secret, variable, cache and key adds", async () => {
	const gh = installFakeGh('ok', '');
	try {
		const call = (tool: { execute: (i: Record<string, unknown>, d: typeof deps) => Promise<{ success: boolean; error?: string | undefined }> }, input: Record<string, unknown>) => tool.execute(input, deps);
		const refused = async (tool: Parameters<typeof call>[0], input: Record<string, unknown>, pattern: RegExp) => {
			const before = gh.calls().length;
			const r = await call(tool, input);
			assert.equal(r.success, false, JSON.stringify(input));
			assert.match(r.error ?? '', pattern, JSON.stringify(input));
			assert.equal(gh.calls().length, before, 'gh did not run for a refused input');
		};
		// gist rename: id, oldFilename and newFilename are all positionals, all required
		for (const input of [{ id: 'a', oldFilename: 'x' }, { id: 'a', newFilename: 'y' }, { oldFilename: 'x', newFilename: 'y' }]) { await refused(ghGistTool, { op: 'rename', ...input }, /needs the field/); }
		assert.equal((await call(ghGistTool, { op: 'rename', id: 'a', oldFilename: 'x', newFilename: 'y' })).success, true);
		assert.deepEqual(gh.calls().at(-1), 'gist rename a x y');
		// gist edit offers add, remove and desc only: no content, no filename selector, at least one of the three
		await refused(ghGistTool, { op: 'edit', id: 'a', content: 'text' }, /does not accept the field content/);
		await refused(ghGistTool, { op: 'edit', id: 'a', filename: 'f.txt' }, /does not accept the field filename/);
		await refused(ghGistTool, { op: 'edit', id: 'a' }, /at least one of add, remove, desc/);
		assert.deepEqual(Object.keys(ghGistTool.ops.find(o => o.name === 'edit')!.fields!).sort(), ['add', 'desc', 'id', 'remove']);
		// gist create: files or content, not both; filename only with content
		await refused(ghGistTool, { op: 'create' }, /exactly one of files, content/);
		await refused(ghGistTool, { op: 'create', files: ['a'], content: 'c' }, /exactly one of files, content/);
		await refused(ghGistTool, { op: 'create', files: ['a'], filename: 'f' }, /filename only together with content/);
		// secret and variable set: a name with its value, or an env file, exactly one of name and envFile
		await refused(ghSecretTool, { op: 'set' }, /exactly one of name, envFile/);
		await refused(ghSecretTool, { op: 'set', name: 'T', envFile: '.env' }, /exactly one of name, envFile/);
		await refused(ghSecretTool, { op: 'set', name: 'T' }, /needs secretValue with name/);
		await refused(ghSecretTool, { op: 'set', envFile: '.env', secretValue: 'v' }, /secretValue only together with name/);
		await refused(ghSecretTool, { op: 'set', name: 'T', secretValue: 'v', env: 'e', org: 'o' }, /at most one of env, org, user/);
		await refused(ghSecretTool, { op: 'set', name: 'T', secretValue: 'v', repos: ['a'] }, /repos only with org or user/);
		await refused(ghSecretTool, { op: 'set', name: 'T', secretValue: 'v', visibility: 'all' }, /visibility only together with org/);
		await refused(ghVariableTool, { op: 'set' }, /exactly one of name, envFile/);
		await refused(ghVariableTool, { op: 'set', name: 'V' }, /needs value with name/);
		await refused(ghVariableTool, { op: 'set', name: 'V', value: 'v', env: 'e', org: 'o' }, /at most one of env, org/);
		await refused(ghVariableTool, { op: 'set', name: 'V', value: 'v', repos: ['a'] }, /repos only with org/);
		assert.equal((await call(ghSecretTool, { op: 'set', name: 'T', secretValue: 'v', user: true, repos: ['a'] })).success, true);
		assert.equal((await call(ghVariableTool, { op: 'set', name: 'V', value: '' })).success, true, 'an empty variable value is a value');
		// cache delete: exactly one of id, key, all
		await refused(ghCacheTool, { op: 'delete' }, /exactly one of id, key, all/);
		await refused(ghCacheTool, { op: 'delete', id: 1, key: 'k' }, /exactly one of id, key, all/);
		await refused(ghCacheTool, { op: 'delete', all: true, key: 'k' }, /exactly one of id, key, all/);
		// ssh-key and gpg-key add: a key file or the key text, exactly one
		await refused(ghSshKeyTool, { op: 'add' }, /exactly one of keyFile, key/);
		await refused(ghSshKeyTool, { op: 'add', keyFile: 'f', key: 'k' }, /exactly one of keyFile, key/);
		await refused(ghGpgKeyTool as never, { op: 'add' }, /exactly one of keyFile, key/);
		await refused(ghGpgKeyTool as never, { op: 'add', keyFile: 'f', key: 'k' }, /exactly one of keyFile, key/);
	} finally { gh.restore(); }
});
