/**
 * The build-command setting's place in the config (LLD-787434000fa22691-s1, task t6): its keys are not
 * rows of the settings catalog, so a reconcile writes no empty default for them and carries what a
 * config holds through untouched.
 *
 * Run: npx tsx --test src/daemon/steps/build-step/__tests__/command-setting.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CONFIG_CATALOG } from '../../../../config/config-catalog.js';
import { reconcileConfig } from '../../../../config/reconcile.js';

test('the build.* command keys are not catalog rows, and a reconcile carries them through untouched', () => {
	assert.equal(CONFIG_CATALOG.some(r => r.path === 'build' || r.path.startsWith('build.')), false, 'a row would fill an empty default that the setting refuses');
	const build = { typecheckCommand: 'mypy src', testCommand: 'pytest -q', resultFormat: 'exit-code', byRepo: { '/r': { testCommand: 'pytest -x' } } };
	const out = reconcileConfig({ build });
	assert.deepEqual(out.config['build'], build);
	assert.equal(out.repaired.length, 0);
	// and a config without them gains none
	assert.equal(reconcileConfig({}).config['build'], undefined);
});
