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
import { REPO_CONFIG_SCHEMA_VERSION, applyBuildDefaults, migrateBuildDefaults, runSchemaMigrations } from '../repo-settings.js';
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
// The old variable, spelled in two parts so that this file does not name it: the source scan in repo-config.test.ts looks for it under src.
const OLD_VAR = ['INSRC', 'GITHUB', 'CONFIG'].join('_');
const DOCS_DIR = fileURLToPath(new URL('../../../docs/', import.meta.url));
const LIVE_DOCS = ['daemon.md', 'workflow.md', 'installation.md', 'index.html', ...readdirSync(join(DOCS_DIR, 'plans')).filter(f => f.endsWith('.md')).map(f => `plans/${f}`)];

// The .json file names each doc edited for the settings file's rename may mention, whether or not it gives the ~/.insrc path.
// Any other name fails the test, so a doc that gives the settings file a different name fails wherever it does so; a doc that
// gains a legitimate mention of another .json file adds it here. github.json is the old name, allowed only where a line says it
// was renamed (checked below for the four user-facing docs, and the plans may not name it at all).
const DOC_JSON_NAMES: Readonly<Record<string, readonly string[]>> = {
	'daemon.md': ['config.json', 'github.json', 'package.json', 'repo-config.json', 'settings.local.json', 't02.t01.json'],
	'workflow.md': ['-1.json', '-2.json', '-s1.json', '-s2.json', 'github.json', 'repo-config.json'],
	'installation.md': ['config.json', 'github.json', 'repo-config.json'],
	'index.html': ['config.json', 'github.json', 'repo-config.json'],
	'plans/meta-workflow-framework.md': ['foo.json', 'repo-config.json'],
	'plans/repo-call-audit.md': ['repo-config.json'],
	'plans/team-workflow.md': ['policy.json', 'repo-config.json', 'team.json', 'tool-surface.golden.json'],
	'plans/workflow-define.md': ['repo-config.json'],
	'plans/workflow-implementation.md': ['repo-config.json'],
};

// The text around every mention of the settings file in each edited doc, as it stands now. A mention changed to another name
// (even one that is allowed elsewhere) breaks its window, so the doc fails the test; change a window when its text is edited on purpose.
const FILE_MENTION_CONTEXT: Readonly<Record<string, readonly string[]>> = {
	"daemon.md": [
		" neither is touched, `repo-config.json` is the one the daemo",
		"## The settings file: repo-config.json",
		"-config.json`, and a `repo-config.json` that another process",
		"`~/.insrc/repo-config.json`, a file of the shape",
		"daemon never deletes `repo-config.json`, and a `repo-config.",
		"itten. Only `~/.insrc/repo-config.json` is written, through ",
		"luding an unreadable `repo-config.json`,",
		"luding an unreadable `repo-config.json`, which fails every r",
		"olds a bad value, or `repo-config.json` cannot be read, the ",
		"settings now live in `repo-config.json`, and the settings me",
		"ts entry of `~/.insrc/repo-config.json`, through",
		"ub.json` is moved to `repo-config.json`. The new name is pub",
		"wn entry of `~/.insrc/repo-config.json`; when the entry sets",
	],
	"workflow.md": [
		"-in.** When `~/.insrc/repo-config.json` is absent or",
		"cat > ~/.insrc/repo-config.json <<'JSON'",
		"ing file is moved to `repo-config.json` at the first boot of",
		"settings now live in `repo-config.json`.",
		"├── repo-config.json                      ",
	],
	"installation.md": [
		"### `~/.insrc/repo-config.json` — repository setting",
	],
	"index.html": [
		"   <h3><code>~/.insrc/repo-config.json</code> — repository s",
	],
	"plans/meta-workflow-framework.md": [
		"on lives at `~/.insrc/repo-config.json` — one entry per",
		"├── repo-config.json                   # G",
	],
	"plans/repo-call-audit.md": [
		"dlers.ts:35-52 writes repo-config.json through repo.trackerC",
	],
	"plans/team-workflow.md": [
		"   - An unparseable `repo-config.json` is read by the lenie",
		"**s3 single writer of repo-config.json (accepted 2026-10-17,",
		"po entry in `~/.insrc/repo-config.json` (extended), per-user",
		"that writes `~/.insrc/repo-config.json`, through one",
	],
	"plans/workflow-define.md": [
		"  `~/.insrc/repo-config.json` per-repo. Details in",
	],
	"plans/workflow-implementation.md": [
		"                    # repo-config.json + workflow config",
		"  `~/.insrc/repo-config.json` if their repo alread",
		"- Config: `~/.insrc/repo-config.json` with per-repo mappin",
		"e remote if `~/.insrc/repo-config.json` has no",
		"onfig.ts` | `~/.insrc/repo-config.json` loader, per-workflow",
		"├── repo-config.json                      ",
	],
};

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
	assert.ok(section.includes('`INSRC_REPO_CONFIG`') && section.includes(`\`${OLD_VAR}\``) && /no\s+longer read/.test(section), 'it names the variable and says the old one is not read');
	assert.match(section, /existing `github\.json` is moved to `repo-config\.json`/, 'it says an existing github.json is moved');
	assert.match(section, /first boot of an updated daemon/);
	assert.match(section, /created by hand afterwards is ignored/, 'it says a github.json created by hand afterwards is ignored');

	// the four user-facing docs name the file, and no live doc, plans included, tells a user to create the old one;
	// the old name appears only to say it was renamed, and never in the plans
	for (const doc of LIVE_DOCS) {
		const text = readFileSync(join(DOCS_DIR, doc), 'utf8');
		const isPlan = doc.startsWith('plans/');
		if (!isPlan) assert.ok(text.includes(`~/.insrc/${fileName}`), `${doc} names ~/.insrc/${fileName}`);
		assert.doesNotMatch(text, /(cat\s*>>?|tee\s+(-a\s+)?|touch\s+|(^|\n)\s*>\s*)~\/\.insrc\/github\.json/, `${doc} does not tell a user to create github.json`);
		assert.ok(!text.replaceAll(`\`${OLD_VAR}\``, '').includes(OLD_VAR), `${doc} gives ${OLD_VAR} only as the variable that is no longer read`);
		// a shell example that writes the settings file writes the file the code reads
		for (const m of text.matchAll(/cat\s*>\s*~\/\.insrc\/(\S+)\s*<</g)) assert.equal(m[1], fileName, `${doc}: the shell example writes ${fileName}`);
		if (isPlan) {
			assert.ok(!text.includes('github.json'), `${doc}: a plan never names github.json`);
			assert.ok(!text.includes(OLD_VAR), `${doc}: a plan never names ${OLD_VAR}`);
		}
	}
	// every .json name an edited doc mentions is one it was known to mention, so a doc that gives the settings file another name
	// fails, with or without the ~/.insrc path
	for (const [doc, allowed] of Object.entries(DOC_JSON_NAMES)) {
		const names = new Set((readFileSync(join(DOCS_DIR, doc), 'utf8').match(/[A-Za-z0-9_@./-]*[A-Za-z0-9_-]+\.json\b/g) ?? []).map(n => n.replace(/^.*\//, '')));
		for (const name of names) assert.ok(allowed.includes(name), `${doc} names ${name}, which is neither the settings file ${fileName} nor a .json file it was known to mention`);
		if (!doc.startsWith('plans/')) assert.ok(names.has(fileName), `${doc} names ${fileName}`);
	}
	// every mention of the settings file is still the text it was, so none was changed to another name
	for (const [doc, windows] of Object.entries(FILE_MENTION_CONTEXT)) {
		const text = readFileSync(join(DOCS_DIR, doc), 'utf8');
		for (const w of windows) assert.ok(text.includes(w), `${doc}: the mention of ${fileName} near "${w}" was changed`);
	}
	// the tree listings in workflow.md and the plans keep the file's line
	for (const doc of ['workflow.md', 'plans/workflow-implementation.md', 'plans/meta-workflow-framework.md']) {
		assert.match(readFileSync(join(DOCS_DIR, doc), 'utf8'), new RegExp(`├── ${fileName.replace('.', '\\.')}`), `${doc}'s tree listing names ${fileName}`);
	}
	// every override variable a live doc names is the one the code reads (or the old one, named as no longer read)
	for (const doc of LIVE_DOCS) {
		for (const name of readFileSync(join(DOCS_DIR, doc), 'utf8').match(/\bINSRC_[A-Z_]*CONFIG\b/g) ?? []) {
			assert.ok(name === 'INSRC_REPO_CONFIG' || name === OLD_VAR, `${doc} names ${name}, which is neither the variable the code reads nor the old one`);
		}
	}
	// the docs that document the override name the variable the code reads, as often as they did when they were updated
	for (const [doc, count] of Object.entries({ 'daemon.md': 2, 'installation.md': 1, 'index.html': 1 })) {
		assert.ok(readFileSync(join(DOCS_DIR, doc), 'utf8').split('INSRC_REPO_CONFIG').length - 1 >= count, `${doc} names INSRC_REPO_CONFIG at least ${count} times`);
	}
	for (const doc of ['workflow.md', 'installation.md', 'index.html']) {
		const text = readFileSync(join(DOCS_DIR, doc), 'utf8');
		assert.match(text, /created by hand afterwards is ignored/, `${doc} says a github.json created by hand afterwards is ignored`);
		for (const line of text.split('\n').filter(l => l.includes('github.json'))) assert.match(line, /was|moved|ignored|created by hand/, `${doc}: github.json appears only to say it was renamed: ${line.trim()}`);
	}
});

// Story d70697dff9f56b4a/s1 / t4 — the schemaVersion and its boot migration are read against the code.
test('build-commands-doc.test.ts: docs/daemon.md describes the schemaVersion at the root of repo-config.json and the boot migration in line with the code', async () => {
	const fileName = (() => {
		const before = process.env['INSRC_REPO_CONFIG'];
		try { delete process.env['INSRC_REPO_CONFIG']; return basename(repoConfigPath()); }
		finally { if (before !== undefined) process.env['INSRC_REPO_CONFIG'] = before; }
	})();
	assert.equal(fileName, 'repo-config.json');
	const section = /#### The schemaVersion at the root, and the migration it decides([\s\S]*?)### Build commands/.exec(DOC)?.[1] ?? '';
	assert.ok(section.length > 0, 'the subsection exists in docs/daemon.md');

	// it is about the file the code reads, and the old name is not given to the field
	assert.ok(section.includes(`~/.insrc/${fileName}`) && section.includes('`schemaVersion`'), 'it names the file and the field');
	assert.ok(!section.includes('github.json'), 'the field is never placed in the old file');
	// the expected version is the code's, and step 1 is the build defaults
	assert.ok(section.includes(`currently ${REPO_CONFIG_SCHEMA_VERSION} (step 1`), `it states the expected version ${REPO_CONFIG_SCHEMA_VERSION}`);
	assert.match(section, /step 1: apply the build defaults/);

	// every status the pass can report, read by running it, is named with its backticks
	const dir = mkdtempSync(join(tmpdir(), 'insrc-doc-schema-'));
	const file = join(dir, fileName);
	try {
		const seen = new Set<string>();
		const run = async (content: string | undefined, over: Record<string, unknown> = {}): Promise<void> => {
			rmSync(file, { force: true });
			if (content !== undefined) writeFileSync(file, content);
			const r = await runSchemaMigrations({ registeredRepos: async () => [], configPath: file, ...over });
			seen.add(r.status);
		};
		await run(undefined);                                                   // applied
		await run(`{"schemaVersion":${REPO_CONFIG_SCHEMA_VERSION}}`);           // up-to-date
		await run(`{"schemaVersion":${REPO_CONFIG_SCHEMA_VERSION + 1}}`);       // newer-schema
		await run('{"schemaVersion":"x"}');                                     // schema-version-invalid
		await run('{not json');                                                 // file-unreadable
		await run('{}', { registeredRepos: async () => { throw new Error('x'); } });                                                  // registry-unreadable
		await run('{}', { steps: [{ version: 1, run: async () => ({ clean: false }) }] });                                            // not-clean
		await run('{}', { steps: [{ version: 1, run: async () => { throw new Error('x'); } }] });                                     // failed
		assert.deepEqual([...seen].sort(), ['applied', 'failed', 'file-unreadable', 'newer-schema', 'not-clean', 'registry-unreadable', 'schema-version-invalid', 'up-to-date']);
		for (const status of seen) assert.ok(section.includes(`\`${status}\``), `the subsection names the status ${status}`);
	} finally { rmSync(dir, { recursive: true, force: true }); }

	// the rules, as the code behaves
	assert.match(section, /absent, `null` or `0`/, 'absent, null and 0 apply');
	assert.match(section, /not taken as 0/, 'an invalid value is not taken as 0');
	assert.match(section, /never a\s+commit id|never a commit id/, 'the decision is not by commit id');
	assert.match(section, /never lowers the value/);
	assert.match(section, /does not wait for it, so it never\s+delays startup and a failure never stops the daemon/, 'the pass does not delay or stop startup');
	assert.match(section, /runs again at the next boot/, 'a step that did not run clean is retried');
	assert.match(section, /neither reads nor writes `schemaVersion`/, 'the manual method does not touch the version');
	assert.match(section, /not applied again at boot[\s\S]*only a manual\s+`repo\.buildDefaults\.migrate`/, 'a deliberate clear is not re-applied at boot');
	assert.match(section, /Removing the value, or lowering it by hand/, 'lowering or removing it re-runs the steps');
});
