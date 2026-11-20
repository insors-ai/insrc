/**
 * Story f8cbf44536347149/s1 / t7 — the "Build commands" section of docs/daemon.md is read against the shipped behaviour:
 * its add-time defaults table is the daemon's own table, and it names the outcome reasons, buildSetup and the Build section.
 *
 * Run: npx tsx --test src/daemon/__tests__/build-commands-doc.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROJECT_TYPE_GUIDANCE } from '../steps/build-step/validation-checks.js';
import { applyBuildDefaults, migrateBuildDefaults } from '../repo-settings.js';
import { repoConfigPath } from '../../workflow/config/repo-config.js';
import { moveLegacyRepoConfig } from '../../workflow/config/repo-config-store.js';

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
	const config = join(dir, 'repo-config.json');
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

test('src/daemon/__tests__/build-commands-doc.test.ts: the Build commands section of docs/daemon.md names repo.buildDefaults.migrate, its report fields and its outcome counts, and says a cleared command is applied again when it is run', async () => {
	assert.ok(SECTION.includes('repo.buildDefaults.migrate'), 'the method is named');
	// the report fields and the keys of counts are the ones the function returns
	const dir = mkdtempSync(join(tmpdir(), 'insrc-doc-migrate-'));
	try {
		const repo = mkdtempSync(join(dir, 'r-'));
		writeFileSync(join(repo, 'go.mod'), '');
		const report = await migrateBuildDefaults([repo], { configPath: join(dir, 'repo-config.json') });
		for (const field of [...Object.keys(report), ...Object.keys(report.repos[0]!), ...Object.keys(report.counts)]) {
			assert.ok(SECTION.includes(`"${field}"`), `the report field ${field} is shown`);
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
	assert.match(SECTION, /registry-unreadable/);
	assert.match(SECTION, /counts` has a key for every outcome/);
	assert.match(SECTION, /cleared on purpose[\s\S]*applied again/, 'a cleared command is applied again');
	assert.match(SECTION, /read[s]? a repository's entry and then writes it/, 'the read-then-write window is stated');
});

// Story 8ff6d364012cff02/s1 / t5 — the settings file's name, its override variable and its move are read against the code.
const DOCS_DIR = fileURLToPath(new URL('../../../docs/', import.meta.url));
const LIVE_DOCS = ['daemon.md', 'workflow.md', 'installation.md', 'index.html', ...readdirSync(join(DOCS_DIR, 'plans')).filter(f => f.endsWith('.md')).map(f => `plans/${f}`)];

test('build-commands-doc.test.ts: docs/daemon.md and the other live docs name repo-config.json and INSRC_REPO_CONFIG in line with the code', () => {
	// the file name and the variable the docs give are the ones the code uses
	const before = process.env['INSRC_REPO_CONFIG'];
	let fileName: string;
	try {
		delete process.env['INSRC_REPO_CONFIG'];
		fileName = basename(repoConfigPath());
		process.env['INSRC_REPO_CONFIG'] = '/tmp/override-probe.json';
		assert.equal(repoConfigPath(), '/tmp/override-probe.json', 'INSRC_REPO_CONFIG is the variable the code reads');
	} finally { if (before === undefined) delete process.env['INSRC_REPO_CONFIG']; else process.env['INSRC_REPO_CONFIG'] = before; }
	assert.equal(fileName, 'repo-config.json');

	// the old name the docs give is the one the daemon moves
	const dir = mkdtempSync(join(tmpdir(), 'insrc-doc-move-'));
	try {
		writeFileSync(join(dir, 'github.json'), '{}');
		assert.equal(moveLegacyRepoConfig(dir).status, 'moved');
		assert.ok(existsSync(join(dir, fileName)) && !existsSync(join(dir, 'github.json')));
	} finally { rmSync(dir, { recursive: true, force: true }); }

	const section = /### The settings file: repo-config\.json([\s\S]*?)### Build commands/.exec(DOC)?.[1] ?? '';
	assert.ok(section.length > 0, 'the settings file section exists in docs/daemon.md');
	assert.ok(section.includes(`~/.insrc/${fileName}`), 'it names the file');
	assert.ok(section.includes('`INSRC_REPO_CONFIG`') && section.includes('`INSRC_GITHUB_CONFIG`') && /no\s+longer read/.test(section), 'it names the variable and says the old one is not read');
	assert.match(section, /existing `github\.json` is moved to `repo-config\.json`/, 'it says an existing github.json is moved');
	assert.match(section, /first boot of an updated daemon/);
	assert.match(section, /created by hand afterwards is ignored/, 'it says a github.json created by hand afterwards is ignored');

	// the four user-facing docs name the file, and no live doc, plans included, tells a user to create the old one; the old name appears only to say it was renamed
	for (const doc of LIVE_DOCS) {
		const text = readFileSync(join(DOCS_DIR, doc), 'utf8');
		if (!doc.startsWith('plans/')) assert.ok(text.includes(fileName), `${doc} names ${fileName}`);
		assert.doesNotMatch(text, /(cat\s*>>?|tee\s+(-a\s+)?|touch\s+|(^|\n)\s*>\s*)~\/\.insrc\/github\.json/, `${doc} does not tell a user to create github.json`);
		assert.ok(!/INSRC_GITHUB_CONFIG/.test(text.replace(/`INSRC_GITHUB_CONFIG`/g, '')), `${doc} gives INSRC_GITHUB_CONFIG only as the variable that is no longer read`);
	}
	for (const doc of ['workflow.md', 'installation.md', 'index.html']) {
		const text = readFileSync(join(DOCS_DIR, doc), 'utf8');
		assert.match(text, /created by hand afterwards is ignored/, `${doc} says a github.json created by hand afterwards is ignored`);
		for (const line of text.split('\n').filter(l => l.includes('github.json'))) assert.match(line, /was|moved|ignored|created by hand/, `${doc}: github.json appears only to say it was renamed: ${line.trim()}`);
	}
});
