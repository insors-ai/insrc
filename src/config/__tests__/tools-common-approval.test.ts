/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t2: the tools.commonApproval setting, and the retirement of permissions.mode.
 * Run: npx tsx --test src/config/__tests__/tools-common-approval.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONFIG_CATALOG, RETIRED_PATHS } from '../config-catalog.js';
import { reconcileConfig } from '../reconcile.js';
import { reconcileConfigFile } from '../reconcile-io.js';
import { readCommonApprovalMode } from '../../shared/common-approval.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = (): string => mkdtempSync(join(tmpdir(), 'insrc-common-approval-'));

test('tools-common-approval.test.ts: config catalog entry tools.commonApproval: default auto, an unknown value falls back to auto with a warning, and a value written to config.json is read back after a reload', () => {
	const entry = CONFIG_CATALOG.find(o => o.path === 'tools.commonApproval');
	assert.ok(entry, 'the catalog declares it');
	assert.equal(entry.type, 'enum');
	assert.equal(entry.default, 'auto');
	assert.deepEqual(entry.enumValues, ['manual', 'edit-auto', 'auto']);

	const dir = tmp();
	try {
		const configPath = join(dir, 'config.json');
		// A fresh config gets the default from the boot reconcile.
		assert.equal(reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG }).kind, 'first-boot');
		const fresh = JSON.parse(readFileSync(configPath, 'utf8')) as { tools?: { commonApproval?: string | undefined } | undefined };
		assert.equal(fresh.tools?.commonApproval, 'auto');
		assert.equal(readCommonApprovalMode(configPath), 'auto');

		// A written value is read back (on every call, so it survives a restart and a reload).
		for (const mode of ['manual', 'edit-auto', 'auto'] as const) {
			writeFileSync(configPath, JSON.stringify({ tools: { commonApproval: mode } }));
			assert.equal(readCommonApprovalMode(configPath), mode);
			reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG });
			assert.equal(readCommonApprovalMode(configPath), mode, 'a reconcile keeps the written value');
		}

		// An unknown value, a missing key, a missing file and an unreadable file all read as auto.
		writeFileSync(configPath, JSON.stringify({ tools: { commonApproval: 'sometimes' } }));
		assert.equal(readCommonApprovalMode(configPath), 'auto');
		writeFileSync(configPath, JSON.stringify({ logLevel: 'info' }));
		assert.equal(readCommonApprovalMode(configPath), 'auto');
		assert.equal(readCommonApprovalMode(join(dir, 'missing.json')), 'auto');
		writeFileSync(configPath, '{ not json');
		assert.equal(readCommonApprovalMode(configPath), 'auto');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('tools-common-approval.test.ts: permissions.mode is stripped from an existing config and is gone from the catalog, the plugin manifest and the settings page', () => {
	assert.equal(CONFIG_CATALOG.some(o => o.path === 'permissions.mode' || o.path.startsWith('permissions.')), false);
	assert.ok(RETIRED_PATHS.some(r => r.path === 'permissions' && r.prefix === true), 'permissions is a retired prefix');

	const stored = { logLevel: 'info', permissions: { mode: 'auto-accept' }, tools: { commonApproval: 'manual' } };
	const out = reconcileConfig(stored, CONFIG_CATALOG).config as Record<string, unknown>;
	assert.equal(out['permissions'], undefined, 'the emptied parent goes with it');
	assert.equal((out['tools'] as Record<string, unknown>)['commonApproval'], 'manual', 'the new setting is untouched');

	const manifest = readFileSync(join(ROOT, 'vscode-plugin', 'package.json'), 'utf8');
	assert.equal(manifest.includes('insrc.permissions.mode'), false);
	assert.equal(manifest.includes('insrc.tools.commonApproval'), true);
	const page = readFileSync(join(ROOT, 'site', 'settings.html'), 'utf8');
	assert.equal(page.includes('permissions.mode'), false);
	assert.equal(page.includes('tools.commonApproval'), true);
});
