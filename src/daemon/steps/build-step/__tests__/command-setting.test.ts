/**
 * The build-command setting's place in the config (LLD-787434000fa22691-s1, task t6): only the result
 * format is a row of the settings catalog (it has a real default); the two commands are not, so a
 * reconcile writes no empty default for them, and a config's `build` block is carried through untouched.
 *
 * Run: npx tsx --test src/daemon/steps/build-step/__tests__/command-setting.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CONFIG_CATALOG } from '../../../../config/config-catalog.js';
import { reconcileConfig } from '../../../../config/reconcile.js';

test('the build command keys are not catalog rows, the result format is, and a reconcile carries a build block through untouched', () => {
	assert.deepEqual(CONFIG_CATALOG.filter(r => r.path === 'build' || r.path.startsWith('build.')).map(r => [r.path, r.default]), [['build.resultFormat', 'exit-code']],
		'a command row would fill an empty default that the setting refuses');
	const build = { typecheckCommand: 'mypy src', testCommand: 'pytest -q', resultFormat: 'exit-code', byRepo: { '/r': { testCommand: 'pytest -x' } } };
	const out = reconcileConfig({ build });
	assert.deepEqual(out.config['build'], build);
	assert.equal(out.repaired.length, 0);
	// and a config without them gains the format only
	assert.deepEqual(reconcileConfig({}).config['build'], { resultFormat: 'exit-code' });
});
