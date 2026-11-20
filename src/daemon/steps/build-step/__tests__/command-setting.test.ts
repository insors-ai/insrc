/**
 * Where the build-command setting lives (LLD-787434000fa22691-s1, task t6): per registered repository,
 * as rows of the repo settings table, not as keys of the global config. The rows are validated by the
 * same check `repo.settings.set` uses: an empty command is refused, `null` clears a key.
 *
 * Run: npx tsx --test src/daemon/steps/build-step/__tests__/command-setting.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CONFIG_CATALOG } from '../../../../config/config-catalog.js';
import { REPO_TRACKER_FIELDS, validateRepoSetting } from '../../../../config/repo-fields.js';

test('the build commands are rows of the repo settings table, in the Build group, and no row of the global catalog', () => {
	assert.equal(CONFIG_CATALOG.some(r => r.path === 'build' || r.path.startsWith('build.')), false, 'there is no global default');
	const rows = REPO_TRACKER_FIELDS.filter(r => r.group === 'Build');
	assert.deepEqual(rows.map(r => [r.key, r.kind, r.type]), [['typecheckCommand', 'local', 'string'], ['testCommand', 'local', 'string'], ['resultFormat', 'local', 'enum']]);
	assert.deepEqual(rows.find(r => r.key === 'resultFormat')?.enumValues, ['tap', 'exit-code']);
	// No row has a default that would be written for a repository that sets none.
	assert.equal(rows.find(r => r.key === 'typecheckCommand')?.default, undefined);
});

test('repo.settings validates the build rows: a command is a non-empty string, the format is tap or exit-code, and null clears', () => {
	assert.deepEqual(validateRepoSetting('typecheckCommand', 'mypy src'), { ok: true, value: 'mypy src' });
	assert.deepEqual(validateRepoSetting('testCommand', 'pytest -q'), { ok: true, value: 'pytest -q' });
	assert.deepEqual(validateRepoSetting('resultFormat', 'tap'), { ok: true, value: 'tap' });
	for (const key of ['typecheckCommand', 'testCommand', 'resultFormat']) {
		assert.deepEqual(validateRepoSetting(key, null), { ok: true, value: null }, `${key} can be cleared`);
	}
	for (const [key, value] of [['typecheckCommand', ''], ['testCommand', ''], ['testCommand', 'a\nb'], ['typecheckCommand', 7], ['resultFormat', 'junit'], ['resultFormat', '']] as const) {
		const r = validateRepoSetting(key, value);
		assert.equal(r.ok, false, `${key}=${JSON.stringify(value)}`);
		if (!r.ok) assert.equal(r.code, 'invalid-value');
	}
});
