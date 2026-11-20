/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSchemaVersion, writeRepoEntryKeys, writeSchemaVersion } from '../../workflow/config/repo-config-store.js';
import { REPO_CONFIG_SCHEMA_VERSION, SCHEMA_MIGRATION_STEPS, createRepoSettingsHandlers, runSchemaMigrations } from '../repo-settings.js';
import type { SchemaMigrationStep } from '../repo-settings.js';

async function inTempDir(run: (dir: string, file: string) => Promise<void>): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), 'schema-migrations-'));
	try { await run(dir, join(dir, 'repo-config.json')); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const parse = (file: string): Record<string, unknown> => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

test('schema-migrations.test.ts: readSchemaVersion returns null for an absent file, an absent key and a null value, the integer for a valid one, and ok:false for an unreadable file or a value that is not a non-negative integer, without changing the file', async () => {
	await inTempDir(async (dir, file) => {
		assert.deepEqual(readSchemaVersion(file), { ok: true, version: null }, 'an absent file');
		assert.ok(!existsSync(file), 'a read never creates the file');

		const cases: ReadonlyArray<readonly [string, unknown]> = [
			['an absent key', undefined], ['a null value', null], ['zero', 0], ['a valid integer', 3],
		];
		for (const [label, value] of cases) {
			const text = JSON.stringify(value === undefined ? { repos: {} } : { schemaVersion: value, repos: {} });
			writeFileSync(file, text);
			const r = readSchemaVersion(file);
			assert.ok(r.ok, label);
			assert.equal(r.version, value === undefined || value === null ? null : value, label);
			assert.equal(readFileSync(file, 'utf8'), text, `${label}: the file is unchanged`);
		}

		for (const bad of ['"1"', '1.5', '-1', '{}', '[1]', 'true']) {
			const text = `{"schemaVersion": ${bad}}`;
			writeFileSync(file, text);
			const r = readSchemaVersion(file);
			assert.ok(!r.ok && r.code === 'schema-version-invalid', `${bad} is invalid, not 0`);
			assert.equal(readFileSync(file, 'utf8'), text, `${bad}: the file is unchanged`);
		}

		for (const text of ['{not json', '[]', '{"repos": []}']) {
			writeFileSync(file, text);
			const r = readSchemaVersion(file);
			assert.ok(!r.ok && r.code === 'repo-config-unreadable', `${text} is unreadable`);
			assert.equal(readFileSync(file, 'utf8'), text);
		}
		assert.deepEqual(readdirSync(dir), ['repo-config.json'], 'no temp file is left');
	});
});

test('schema-migrations.test.ts: writeSchemaVersion creates the file when absent, keeps default, repos and unknown root keys, reports changed false when the version is already stored, never lowers a stored version, and returns write-failed or file-changed as data', async () => {
	await inTempDir(async (dir, file) => {
		const created = await writeSchemaVersion(1, file);
		assert.deepEqual(created, { ok: true, changed: true });
		assert.deepEqual(parse(file), { schemaVersion: 1 });

		writeFileSync(file, JSON.stringify({ default: { type: 'none' }, repos: { '/r': { buildCommand: 'make' } }, extra: { keep: true } }));
		assert.deepEqual(await writeSchemaVersion(2, file), { ok: true, changed: true });
		assert.deepEqual(parse(file), { default: { type: 'none' }, repos: { '/r': { buildCommand: 'make' } }, extra: { keep: true }, schemaVersion: 2 });

		const before = readFileSync(file, 'utf8');
		assert.deepEqual(await writeSchemaVersion(2, file), { ok: true, changed: false }, 'already stored');
		assert.deepEqual(await writeSchemaVersion(1, file), { ok: true, changed: false }, 'never lowered');
		assert.equal(readFileSync(file, 'utf8'), before);

		const invalid = await writeSchemaVersion(-1, file);
		assert.ok(!invalid.ok && invalid.error.code === 'write-failed', 'an invalid version is data');

		// A throwing seam is write-failed as data and leaves no temp file.
		const failedWrite = await writeSchemaVersion(5, file, { writeFile: () => { throw new Error('disk full'); }, rename: () => undefined });
		assert.ok(!failedWrite.ok && failedWrite.error.code === 'write-failed' && /disk full/.test(failedWrite.error.message));
		assert.equal(readFileSync(file, 'utf8'), before);

		// The file changing under the writer on every attempt is file-changed, nothing written.
		const raced = await writeSchemaVersion(5, file, {
			writeFile: (path, content) => writeFileSync(path, content),
			rename: (from, to) => { throw new Error(`unreachable ${from} ${to}`); },
			afterTempWrite: () => { writeFileSync(file, JSON.stringify({ schemaVersion: 2, touched: Math.random() })); },
		});
		assert.ok(!raced.ok && raced.error.code === 'file-changed');
		assert.ok(parse(file)['schemaVersion'] === 2);

		// An unreadable file is reported and not overwritten.
		writeFileSync(file, '{not json');
		const unreadable = await writeSchemaVersion(1, file);
		assert.ok(!unreadable.ok && unreadable.error.code === 'repo-config-unreadable');
		assert.equal(readFileSync(file, 'utf8'), '{not json');
		assert.deepEqual(readdirSync(dir).sort(), ['repo-config.json'], 'no temp file is left');
	});
});

test('schema-migrations.test.ts: a repo write through writeRepoEntryKeys after the stamp keeps the root schemaVersion', async () => {
	await inTempDir(async (_dir, file) => {
		await writeSchemaVersion(1, file);
		assert.deepEqual(await writeRepoEntryKeys('/repo', { buildCommand: 'make' }, file), { ok: true, changed: true });
		assert.deepEqual(parse(file), { schemaVersion: 1, repos: { '/repo': { buildCommand: 'make' } } });

		// And the other direction: stamping keeps what the repo writes put in.
		assert.deepEqual(await writeSchemaVersion(2, file), { ok: true, changed: true });
		assert.deepEqual(parse(file), { schemaVersion: 2, repos: { '/repo': { buildCommand: 'make' } } });
	});
});

// ---- t2: the runner ----

const ok = async (): Promise<{ clean: boolean }> => ({ clean: true });
const repos = async (): Promise<readonly string[]> => ['/r1', '/r2'];

function recordingStep(version: number, log: number[], over: Partial<{ clean: boolean; throws: boolean }> = {}): SchemaMigrationStep {
	return { version, run: async () => { log.push(version); if (over.throws) throw new Error(`step ${version} boom`); return { clean: over.clean ?? true }; } };
}

test('schema-migrations.test.ts: runSchemaMigrations runs the pending steps in ascending order and stamps the highest clean version for a version that is absent, null or below the expected one, runs nothing for an equal or higher one, stops at the first step that throws or reports write-failed and stamps only the earlier clean version, runs nothing on an unreadable file or an invalid version, reports registry-unreadable when the registry cannot be listed, and never rejects', async () => {
	await inTempDir(async (dir, file) => {
		// absent file, absent key, null and 0 and a lower version all run the steps above them, in ascending order
		for (const [label, content, expectFrom, expectOrder] of [
			['an absent file', undefined, null, [1, 2, 3]], ['an absent key', '{"repos":{}}', null, [1, 2, 3]],
			['null', '{"schemaVersion":null}', null, [1, 2, 3]], ['zero', '{"schemaVersion":0}', 0, [1, 2, 3]],
			['a lower version', '{"schemaVersion":1}', 1, [2, 3]],
		] as const) {
			rmSync(file, { force: true });
			if (content !== undefined) writeFileSync(file, content);
			const ran: number[] = [];
			const r = await runSchemaMigrations({ registeredRepos: repos, configPath: file, currentVersion: 3, steps: [recordingStep(3, ran), recordingStep(1, ran), recordingStep(2, ran)] });
			assert.deepEqual(ran, [...expectOrder], `${label}: ascending order, only the steps above the stored version`);
			assert.deepEqual(r, { status: 'applied', from: expectFrom, to: 3 }, label);
			assert.equal(readSchemaVersion(file).ok && (readSchemaVersion(file) as { version: number }).version, 3, `${label}: stamped`);
		}

		// an equal or higher version runs nothing and writes nothing
		for (const [stored, status] of [[3, 'up-to-date'], [7, 'newer-schema']] as const) {
			const text = JSON.stringify({ schemaVersion: stored, keep: 1 });
			writeFileSync(file, text);
			const ran: number[] = [];
			const r = await runSchemaMigrations({ registeredRepos: repos, configPath: file, currentVersion: 3, steps: [recordingStep(1, ran), recordingStep(2, ran), recordingStep(3, ran)] });
			assert.equal(r.status, status);
			assert.deepEqual(ran, []);
			assert.equal(readFileSync(file, 'utf8'), text, 'nothing written');
		}

		// a step that is not clean stops the run; only the earlier clean version is stamped
		writeFileSync(file, '{}');
		let ran: number[] = [];
		let r = await runSchemaMigrations({ registeredRepos: repos, configPath: file, currentVersion: 3, steps: [recordingStep(1, ran), recordingStep(2, ran, { clean: false }), recordingStep(3, ran)] });
		assert.deepEqual(ran, [1, 2], 'step 3 never runs');
		assert.equal(r.status, 'not-clean'); assert.equal(r.to, 1);
		assert.deepEqual(parse(file), { schemaVersion: 1 });

		// a step that throws is the same, reported as failed; the stored 1 is not lowered and step 2 is retried next time
		ran = [];
		r = await runSchemaMigrations({ registeredRepos: repos, configPath: file, currentVersion: 3, steps: [recordingStep(1, ran), recordingStep(2, ran, { throws: true }), recordingStep(3, ran)] });
		assert.deepEqual(ran, [2]);
		assert.equal(r.status, 'failed'); assert.match(r.note ?? '', /step 2 boom/);
		assert.deepEqual(parse(file), { schemaVersion: 1 });

		// a first step that fails stamps nothing
		writeFileSync(file, '{}');
		r = await runSchemaMigrations({ registeredRepos: repos, configPath: file, currentVersion: 1, steps: [recordingStep(1, [], { clean: false })] });
		assert.equal(r.status, 'not-clean'); assert.equal(r.to, undefined);
		assert.deepEqual(parse(file), {});

		// an unreadable file and an invalid version run nothing and are not overwritten
		for (const [text, status] of [['{not json', 'file-unreadable'], ['{"schemaVersion":"1"}', 'schema-version-invalid'], ['{"schemaVersion":-1}', 'schema-version-invalid']] as const) {
			writeFileSync(file, text);
			ran = [];
			r = await runSchemaMigrations({ registeredRepos: repos, configPath: file, currentVersion: 1, steps: [recordingStep(1, ran)] });
			assert.equal(r.status, status); assert.deepEqual(ran, []); assert.equal(readFileSync(file, 'utf8'), text);
		}

		// an unlistable registry runs nothing and stamps nothing
		writeFileSync(file, '{}');
		ran = [];
		r = await runSchemaMigrations({ registeredRepos: async () => { throw new Error('no registry'); }, configPath: file, currentVersion: 1, steps: [recordingStep(1, ran)] });
		assert.equal(r.status, 'registry-unreadable'); assert.deepEqual(ran, []); assert.deepEqual(parse(file), {});

		// a stamp that cannot be written is failed, and the version stays unstamped
		r = await runSchemaMigrations({ registeredRepos: repos, configPath: file, currentVersion: 1, steps: [recordingStep(1, [])], writeVersion: async () => ({ ok: false, error: { code: 'write-failed', message: 'disk full' } }) });
		assert.equal(r.status, 'failed'); assert.match(r.note ?? '', /disk full/);
		assert.deepEqual(parse(file), {});

		// it never rejects, whatever is thrown, including null
		const odd = await runSchemaMigrations({ registeredRepos: repos, configPath: file, currentVersion: 1, steps: [{ version: 1, run: () => { throw null; } }] });
		assert.equal(odd.status, 'failed');
		const odd2 = await runSchemaMigrations({ registeredRepos: repos, configPath: file, currentVersion: 1, writeVersion: () => { throw undefined; }, steps: [{ version: 1, run: ok }] });
		assert.equal(odd2.status, 'failed');
		void dir;
	});
});

test('schema-migrations.test.ts: the version-1 step runs migrateBuildDefaults over the listed repos and is clean only when no repo reports write-failed', async () => {
	await inTempDir(async (dir, file) => {
		assert.equal(REPO_CONFIG_SCHEMA_VERSION, 1);
		assert.deepEqual(SCHEMA_MIGRATION_STEPS.map(s => s.version), [1]);
		const step = SCHEMA_MIGRATION_STEPS[0]!;
		const py = join(dir, 'py'); mkdirSync(py); writeFileSync(join(py, 'pyproject.toml'), '');
		const node = join(dir, 'node'); mkdirSync(node); writeFileSync(join(node, 'package.json'), '');

		const clean = await step.run({ repos: [py, node], configPath: file });
		assert.equal(clean.clean, true);
		assert.deepEqual(clean.counts, { 'applied': 1, 'already-set': 0, 'node-default': 1, 'no-typical-commands': 0, 'write-failed': 0 });
		assert.deepEqual((parse(file)['repos'] as Record<string, unknown>)[py], { typecheckCommand: 'mypy .', testCommand: 'pytest', resultFormat: 'exit-code' });

		// a repo whose write fails makes the step not clean, and the other repo is still handled
		const py2 = join(dir, 'py2'); mkdirSync(py2); writeFileSync(join(py2, 'pyproject.toml'), '');
		const dirty = await step.run({ repos: [py2], configPath: file, writeKeys: async () => ({ ok: false, error: { code: 'write-failed', message: 'refused' } }) });
		assert.equal(dirty.clean, false);
		assert.equal(dirty.counts?.['write-failed'], 1);
	});
});

test('schema-migrations.test.ts: two successive runs over a temporary Python repo with no commands and no schemaVersion (the first writes the three keys and stamps 1, the second runs nothing), with no commit id read anywhere', async () => {
	await inTempDir(async (dir, file) => {
		const py = join(dir, 'py'); mkdirSync(py); writeFileSync(join(py, 'pyproject.toml'), '');
		const first = await runSchemaMigrations({ registeredRepos: async () => [py], configPath: file });
		assert.deepEqual(first, { status: 'applied', from: null, to: 1 });
		assert.deepEqual(parse(file), { schemaVersion: 1, repos: { [py]: { typecheckCommand: 'mypy .', testCommand: 'pytest', resultFormat: 'exit-code' } } });

		const before = readFileSync(file, 'utf8');
		let listed = 0;
		const second = await runSchemaMigrations({ registeredRepos: async () => { listed++; return [py]; }, configPath: file });
		assert.deepEqual(second, { status: 'up-to-date', from: 1 });
		assert.equal(listed, 0, 'the registry is not even listed when nothing is pending');
		assert.equal(readFileSync(file, 'utf8'), before, 'nothing written');

		// the decision never depends on a commit: the runner and its step list do not read one
		const src = readFileSync(new URL('../repo-settings.ts', import.meta.url), 'utf8');
		const from = src.indexOf('// Schema migrations'), to = src.indexOf('async function resolveTarget(');
		assert.ok(from > 0 && to > from);
		assert.doesNotMatch(src.slice(from, to), /commit|rev-parse|git /i);
	});
});

test('schema-migrations.test.ts: a command cleared after the stamp is not re-applied by the second run, while the manual repo.buildDefaults.migrate handler still re-applies it and leaves schemaVersion unchanged', async () => {
	await inTempDir(async (dir, file) => {
		const py = join(dir, 'py'); mkdirSync(py); writeFileSync(join(py, 'pyproject.toml'), '');
		await runSchemaMigrations({ registeredRepos: async () => [py], configPath: file });
		// the user clears all three commands on purpose
		assert.deepEqual(await writeRepoEntryKeys(py, { typecheckCommand: null, testCommand: null, resultFormat: null }, file), { ok: true, changed: true });
		const cleared = readFileSync(file, 'utf8');

		const again = await runSchemaMigrations({ registeredRepos: async () => [py], configPath: file });
		assert.equal(again.status, 'up-to-date');
		assert.equal(readFileSync(file, 'utf8'), cleared, 'a later boot does not re-apply it');

		const handlers = createRepoSettingsHandlers({ registeredRepos: async () => [py], configPath: () => file });
		const report = await handlers['repo.buildDefaults.migrate']!(undefined) as { counts: Record<string, number> };
		assert.equal(report.counts['applied'], 1, 'the manual method re-applies it');
		assert.equal(parse(file)['schemaVersion'], 1, 'and leaves schemaVersion as it was');
		assert.deepEqual((parse(file)['repos'] as Record<string, unknown>)[py], { typecheckCommand: 'mypy .', testCommand: 'pytest', resultFormat: 'exit-code' });
	});
});

// ---- t3: the boot hook ----

test('schema-migrations.test.ts: a source check that src/daemon/index.ts calls runSchemaMigrations as a fire-and-forget pass after the registry loads, with a catch, and not awaited', () => {
	const src = readFileSync(fileURLToPath(new URL('../index.ts', import.meta.url)), 'utf8');
	const call = src.indexOf('runSchemaMigrations({');
	const registry = src.indexOf('await listRepos(db)');      // the registry is loaded here
	const steering = src.indexOf('void runBootSteeringRefresh()');
	const queue = src.indexOf('const queueDone = startQueue()');
	const getDb = src.indexOf('await getDb()');
	assert.ok(call > 0 && registry > 0 && steering > 0 && queue > 0 && getDb > 0, 'the anchors exist in main');
	assert.equal(src.split('runSchemaMigrations(').length - 1, 1, 'it is called once');
	assert.ok(getDb < registry && registry < call, 'the pass starts after the database is open and the registry is loaded');
	assert.ok(steering < call && call < queue, 'it sits beside the steering refresh, before the queue starts');

	// the statement: `void runSchemaMigrations(...)` followed by a then and a catch, ending before the next statement
	const statementStart = src.lastIndexOf('void ', call);
	assert.equal(src.slice(statementStart, call), 'void ', 'the call is the operand of void, directly');
	const end = src.indexOf(';\n', call);
	const statement = src.slice(statementStart, end);
	assert.match(statement, /\.then\(/, 'the result is logged');
	assert.match(statement, /\.catch\(/, 'a rejection is caught');
	assert.doesNotMatch(src, /await\s+runSchemaMigrations/, 'it is never awaited');
	assert.doesNotMatch(src, /(?:return|=)\s*runSchemaMigrations/, 'its promise is not kept or returned');
	// the registry is listed lazily, from the DB the daemon already holds
	assert.match(statement, /registeredRepos:\s*async \(\) => \(await listRepos\(db\)\)\.map\(r => r\.path\)/);
	// and the earlier legacy-file move keeps its place before the pass
	assert.ok(src.indexOf('moveLegacyRepoConfig();') < call);
});
