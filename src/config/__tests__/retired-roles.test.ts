/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A role that is removed is removed everywhere a user can meet it
 * (LLD-b9d5c5c40df5a574-s2, task t8): the role taxonomy, the settings the
 * VS Code extension declares, and a value a user has stored for it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONFIG_CATALOG, CONFIG_MIGRATIONS, RETIRED_PATHS, RETIRED_ROLE_IDS } from '../config-catalog.js';
import { ConfigCatalogError, reconcileConfig } from '../reconcile.js';
import { reasoningRoleTaxonomy, roleDescriptor } from '../role-taxonomy.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROLE = 'analyze.scope.pick';
const SETTING_PREFIX = 'insrc.models.tasks.';

/** The per-role settings the VS Code extension declares, by role id. */
function declaredRoleSettings(manifest: { contributes: { configuration: unknown } }): string[] {
	const sections = Array.isArray(manifest.contributes.configuration) ? manifest.contributes.configuration : [manifest.contributes.configuration];
	const ids: string[] = [];
	for (const section of sections as Array<{ properties?: Record<string, unknown> }>) {
		for (const key of Object.keys(section.properties ?? {})) {
			if (key.startsWith(SETTING_PREFIX)) ids.push(key.slice(SETTING_PREFIX.length));
		}
	}
	return ids;
}

test("the scope picker's role is gone from the role taxonomy and from the VS Code extension's declared settings, the two agree in both directions, and the reconcile drops a value stored for the role under `models.tasks` and under a repo's `models.byRepo.<repo>.tasks`, where the key holds dots (mutation: retire it as a dotted path)", () => {
	// --- The taxonomy: the role is gone, and it is listed as retired. ---
	const roles = reasoningRoleTaxonomy().roles.map(r => r.id);
	assert.ok(!roles.includes(ROLE));
	assert.equal(roleDescriptor(ROLE), undefined);
	assert.deepEqual([...RETIRED_ROLE_IDS], [ROLE]);
	// The classifier's own role, beside which it stood, is still there.
	assert.ok(roles.includes('analyze.classify'));

	// --- The extension: no setting for the role, and its settings and the taxonomy agree in both directions. ---
	const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'vscode-plugin', 'package.json'), 'utf8')) as { version: string; contributes: { configuration: unknown } };
	const declared = declaredRoleSettings(manifest);
	assert.ok(declared.length > 0, 'the extension declares per-role settings');
	assert.ok(!declared.includes(ROLE));
	assert.deepEqual(declared.filter(id => !roles.includes(id)), [], 'every declared role setting is a live role');
	assert.deepEqual(roles.filter(id => !declared.includes(id)), [], 'every live role has a declared setting');
	assert.equal(new Set(declared).size, declared.length);
	// The removal is a change to what the extension declares: its version is raised from 0.5.12.
	const [major, minor, patch] = manifest.version.split('.').map(Number);
	assert.ok(major! > 0 || minor! > 5 || (minor === 5 && patch! > 12), `the extension's version is raised: ${manifest.version}`);

	// --- The reconcile: a stored value is dropped, globally and per repo. ---
	// The role id is one key that holds dots, and so is a repo's path.
	const repoA = '/Users/dev/work/app.v2';
	const repoB = '/srv/other';
	const stored = {
		models: {
			tasks: { [ROLE]: 'mid', 'analyze.classify': 'core' },
			byRepo: {
				[repoA]: { tasks: { [ROLE]: 'core', 'analyze.plan': 'core' }, coreFloor: 'mid' },
				[repoB]: { tasks: { 'analyze.plan': 'mid' } },
			},
		},
		someOtherKey: { kept: true },
	};
	const before = JSON.parse(JSON.stringify(stored)) as typeof stored;
	const result = reconcileConfig(stored);
	const models = result.config['models'] as typeof stored.models;
	assert.ok(!(ROLE in models.tasks), 'dropped under models.tasks');
	assert.ok(!(ROLE in models.byRepo[repoA]!.tasks), "dropped under the repo's tasks");
	// Everything beside it is kept as it was.
	assert.equal(models.tasks['analyze.classify'], 'core');
	assert.deepEqual(models.byRepo[repoA], { tasks: { 'analyze.plan': 'core' }, coreFloor: 'mid' });
	assert.deepEqual(models.byRepo[repoB], { tasks: { 'analyze.plan': 'mid' } });
	assert.deepEqual(result.config['someOtherKey'], { kept: true });
	// It is reported as pruned, like a retired path, and the input is not changed.
	assert.deepEqual(result.pruned.filter(p => p.includes(ROLE)), [`models.tasks["${ROLE}"]`, `models.byRepo["${repoA}"].tasks["${ROLE}"]`]);
	assert.equal(result.changed, true);
	assert.deepEqual(stored, before);
	// A second pass has nothing to drop.
	const again = reconcileConfig(result.config);
	assert.deepEqual(again.pruned.filter(p => p.includes(ROLE)), []);
	// A config that never stored the role is not touched for it.
	assert.deepEqual(reconcileConfig({ models: { tasks: { 'analyze.classify': 'core' } } }).pruned.filter(p => p.includes(ROLE)), []);

	// --- Why it is a list of role ids and not a retired path. ---
	// Retired as a dotted path, the id is split on its dots and the stored key, which holds them, is never found.
	const asPath = reconcileConfig(stored, CONFIG_CATALOG, [...RETIRED_PATHS, { path: `models.tasks.${ROLE}` }], CONFIG_MIGRATIONS, []);
	assert.equal(((asPath.config['models'] as typeof stored.models).tasks)[ROLE], 'mid', 'a dotted retired path leaves the stored value');
	assert.deepEqual(asPath.pruned.filter(p => p.includes(ROLE)), []);

	// --- A retired role id must not be a live role. ---
	assert.throws(() => reconcileConfig({}, CONFIG_CATALOG, RETIRED_PATHS, CONFIG_MIGRATIONS, ['analyze.classify']), (err: unknown) => {
		assert.ok(err instanceof ConfigCatalogError);
		assert.match((err as Error).message, /retired role id 'analyze\.classify' is in the role taxonomy/);
		return true;
	});
	assert.doesNotThrow(() => reconcileConfig({}));
});
