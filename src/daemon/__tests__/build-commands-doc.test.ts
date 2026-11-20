/**
 * Story f8cbf44536347149/s1 / t7 — the "Build commands" section of docs/daemon.md is read against the shipped behaviour:
 * its add-time defaults table is the daemon's own table, and it names the outcome reasons, buildSetup and the Build section.
 *
 * Run: npx tsx --test src/daemon/__tests__/build-commands-doc.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROJECT_TYPE_GUIDANCE } from '../steps/build-step/validation-checks.js';
import { applyBuildDefaults } from '../repo-settings.js';

const DOC = readFileSync(fileURLToPath(new URL('../../../docs/daemon.md', import.meta.url)), 'utf8');
const SECTION = /### Build commands([\s\S]*?)### What the record holds/.exec(DOC)?.[1] ?? '';

test('docs/daemon.md: the Build commands section is read against the shipped behaviour and states the add-time defaults, buildSetup and the Build section', async () => {
	assert.ok(SECTION.length > 0, 'the section exists');

	// the add-time defaults table is the daemon's table, row by row
	for (const type of ['python', 'go', 'rust', 'jvm'] as const) {
		const g = PROJECT_TYPE_GUIDANCE[type];
		assert.ok(SECTION.includes(`| ${type} | \`${g.typecheck}\` | \`${g.test}\` | \`exit-code\` |`), `the table row of ${type}`);
	}
	assert.match(SECTION, /Defaults at repo add/);
	assert.match(SECTION, /Nothing is ever overwritten/);

	// every outcome reason the function can report is named, and `buildDefaults` is the reply's field
	const dir = mkdtempSync(join(tmpdir(), 'insrc-doc-'));
	const config = join(dir, 'github.json');
	try {
		const seen = new Set<string>();
		const repo = (marker?: string): string => { const d = mkdtempSync(join(dir, 'r-')); if (marker !== undefined) writeFileSync(join(d, marker), ''); return d; };
		const outcomes = [
			await applyBuildDefaults(repo('pyproject.toml'), { configPath: config }),
			await applyBuildDefaults(repo('package.json'), { configPath: config }),
			await applyBuildDefaults(repo(), { configPath: config }),
			await applyBuildDefaults(repo('go.mod'), { configPath: config, writeKeys: async () => ({ ok: false, error: { code: 'write-failed', message: 'x' } }) }),
		];
		writeFileSync(config, JSON.stringify({ repos: { '/set': { testCommand: 'make test' } } }));
		outcomes.push(await applyBuildDefaults('/set', { configPath: config }));
		for (const o of outcomes) if (!o.applied) seen.add(o.reason);
		assert.deepEqual([...seen].sort(), ['already-set', 'no-typical-commands', 'node-default', 'write-failed']);
		for (const reason of seen) assert.ok(SECTION.includes(`\`${reason}\``), `the section names the reason ${reason}`);
	} finally { rmSync(dir, { recursive: true, force: true }); }
	assert.match(SECTION, /`buildDefaults`/);

	// buildSetup, its commands sources, the suggestion and the Build section on each client
	assert.match(SECTION, /`buildSetup`/);
	for (const source of ['node-default', 'repo-setting', 'none', 'invalid']) assert.ok(SECTION.includes(`\`${source}\``), `the commands source ${source}`);
	assert.match(SECTION, /`suggestion`/);
	assert.match(SECTION, /Use suggested build commands/);
	for (const client of ['terminal', 'VS Code', 'JetBrains']) assert.ok(SECTION.includes(client), `the ${client} page`);
	assert.match(SECTION, /press `u`/);

	// a default is a typical command, not a verified one, and where to change it
	assert.match(SECTION, /typical command, not a verified one/);
	assert.match(SECTION, /repo\.settings\.set/);
});
