/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import type { TestContext } from 'node:test';
import policy from '../../assets/node-runtime-policy.json' with { type: 'json' };
import { requireProcessIdentity } from '../daemon-process.js';
import { SourceInstallationStore, SourcePublicationUnknownError, _setSourcePublicationFaultForTests, readSourceInstallationSelector } from '../source-installation.js';
import type { SourceInstallationState, SourceSelection, SourceTransaction } from '../source-installation.js';

const exec = promisify(execFile);
const file = fileURLToPath(import.meta.url);

/** Run descriptor semantics on actual Linux, never emulate /proc with a Mac pathname fallback. */
async function linux(t: TestContext, run: () => Promise<void> | void) {
	if (process.platform === 'linux') { await run(); return; }
	if (process.platform !== 'darwin') { t.skip('requires Linux or the OrbStack qualification fixtures'); return; }
	let inventory: Array<{ name: string; state: string }>;
	try { inventory = JSON.parse(execFileSync('orb', ['list', '--format=json'], { encoding: 'utf8' })); }
	catch { t.skip('requires the OrbStack qualification fixtures'); return; }
	const project = fileURLToPath(new URL('../../../', import.meta.url));
	const stage = mkdtempSync(join(project, '.insrc/tmp/source-state-linux-'));
	{
		const bundle = join(stage, 'tests.mjs');
		const { buildSync } = await import('esbuild');
		buildSync({ entryPoints: [file], outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
		for (const [name, target] of [['insrc-node-arm64', 'linux-arm64'], ['insrc-node-x64', 'linux-x64']] as const) {
			const machine = inventory.find(m => m.name === name);
			if (!machine) { t.skip(`requires ${name}`); return; }
			const started = machine.state === 'stopped';
			try {
				if (started) execFileSync('orb', ['start', name], { stdio: 'pipe', timeout: 30_000 });
				const home = execFileSync('orb', ['-m', name, '/bin/sh', '-c', 'printf "%s" "$HOME"'], { encoding: 'utf8' });
				const node = join(home, 'insrc-node-qualification/home/.insrc/runtimes', `node-v${policy.nodeVersion}-${target}`,
					policy.targets[target].sha256, 'distribution/bin/node');
				assert.equal(execFileSync('orb', ['-m', name, node, '--version'], { encoding: 'utf8' }).trim(), `v${policy.nodeVersion}`);
				const output = execFileSync('orb', ['-m', name, node, '--test', '--test-reporter=tap',
					`--test-name-pattern=^${t.name}$`, bundle], { encoding: 'utf8', timeout: 90_000, maxBuffer: 256 * 1024 });
				assert.match(output, /# fail 0\b/); assert.match(output, /# skipped 0\b/);
				writeFileSync(join(stage, `${name}-${createHash('sha256').update(t.name).digest('hex').slice(0, 8)}.tap`), output);
			} finally { if (started) execFileSync('orb', ['stop', name], { stdio: 'pipe', timeout: 30_000 }); }
		}
	}
	// Receipts stay in the ignored qualification workspace; Linux fixtures were disposed.
}

function fixture(t: TestContext) {
	const root = mkdtempSync(join(tmpdir(), 'insrc-source-state-')), logical = join(root, 'daemon');
	mkdirSync(logical, { mode: 0o700 });
	t.after(() => { _setSourcePublicationFaultForTests(); rmSync(root, { recursive: true, force: true }); });
	const store = new SourceInstallationStore(root, logical);
	const journal = join(root, 'source-lifecycle/journal.json');
	return { root, logical, store, journal };
}

function selected(root: string, nodeVersion = policy.nodeVersion, archive?: string): SourceSelection {
	const target = `linux-${process.arch}` as 'linux-arm64' | 'linux-x64';
	const archiveSha256 = archive ?? policy.targets[target].sha256;
	const release = join(root, `source-lifecycle/releases/candidate-${nodeVersion}/checkout`);
	const runtime = join(root, 'runtimes', `node-v${nodeVersion}-${target}`, archiveSha256, 'distribution/bin/node');
	const binding = join(root, 'source-runtimes', `${createHash('sha256').update(release).digest('hex')}.json`);
	for (const dir of [release, dirname(runtime), dirname(binding)]) mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(runtime, 'fixture runtime; never executed', { mode: 0o700 });
	writeFileSync(binding, JSON.stringify({ schemaVersion: 1, installationRoot: release, target, nodeVersion,
		archiveSha256, distribution: dirname(dirname(runtime)), inventorySha256: 'f'.repeat(64) }), { mode: 0o600 });
	return { target, toolchain: { nodeVersion, archiveSha256 }, binding, pin: { root: release, runtime, commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64) },
		source: { channel: { repoUrl: 'https://example.invalid/source', branch: 'main' }, sequence: 1,
			tagObject: 'c'.repeat(40), commit: 'a'.repeat(40), tree: 'd'.repeat(40) },
		compatibility: { version: 1, releaseId: 'a'.repeat(40), graphSchema: 10, startup: 'rollback-compatible',
			formats: { lance: '1', config: '1', repoAndIndexQueue: '1', workflowAndSession: '1' } } };
}

function transaction(state: SourceInstallationState): SourceTransaction {
	return { id: randomUUID(), phase: 'reserved', owner: requireProcessIdentity(process.pid), baselineGeneration: state.generation,
		initialSelector: state.selected, prior: null, candidate: null, wasRunning: false };
}

if (process.env.INSRC_SOURCE_STATE_WORKER) {
	const { root, logical } = JSON.parse(process.env.INSRC_SOURCE_STATE_WORKER) as { root: string; logical: string };
	try { new SourceInstallationStore(root, logical).update(0, state => ({ ...state, active: transaction(state) })); process.stdout.write('published'); }
	catch { process.stdout.write('refused'); }
} else {
	test('Linux selector/journal reject malformed, linked and nonprivate files', { timeout: 240_000 }, async t => linux(t, () => {
		const f = fixture(t);
		assert.equal(readSourceInstallationSelector(f.root, f.logical), undefined);
		assert.equal(existsSync(join(f.root, 'source-lifecycle')), false, 'legacy read must not create a selector');
		f.store.update(0, state => state);
		const valid = readFileSync(f.journal);
		for (const bad of ['{', JSON.stringify({ ...f.store.read(), version: 99 }), JSON.stringify({ ...f.store.read(), generation: -1 }),
			JSON.stringify({ ...f.store.read(), installationRoot: join(f.root, 'other') }), JSON.stringify({ ...f.store.read(), active: [] })]) {
			writeFileSync(f.journal, bad); assert.throws(() => f.store.read()); writeFileSync(f.journal, valid);
		}
		chmodSync(f.journal, 0o644); assert.throws(() => f.store.read(), /private/); chmodSync(f.journal, 0o600);
		const outside = join(f.root, 'outside'); writeFileSync(outside, valid, { mode: 0o600 });
		rmSync(f.journal); symlinkSync(outside, f.journal); assert.throws(() => f.store.read());
		rmSync(f.journal); linkSync(outside, f.journal); assert.throws(() => f.store.read(), /private/);
		rmSync(f.journal); writeFileSync(f.journal, valid, { mode: 0o600 });
		chmodSync(dirname(f.journal), 0o777); assert.throws(() => f.store.read(), /private/); chmodSync(dirname(f.journal), 0o700);
		const selection = selected(f.root);
		const state = f.store.update(1, s => ({ ...s, selected: selection, retained: [selection.pin], sourceReleases: [selection.source] }));
		assert.deepEqual(readSourceInstallationSelector(f.root, f.logical), selection);
		assert.throws(() => f.store.update(state.generation, s => ({ ...s, retained: [] })), /cannot be dropped/);
		assert.throws(() => f.store.update(state.generation, s => ({ ...s, sourceReleases: [] })), /floor cannot be removed/);
		assert.throws(() => f.store.update(state.generation, s => ({ ...s, selected: { ...selection,
			pin: { ...selection.pin, runtime: '/usr/bin/node' } } })), /runtime or binding/);
		const binding = readFileSync(selection.binding);
		writeFileSync(selection.binding, JSON.stringify({ ...JSON.parse(binding.toString()), target: 'linux-unknown' }));
		assert.throws(() => f.store.read(), /binding reference/); writeFileSync(selection.binding, binding);
		const retainedRuntime = readFileSync(selection.pin.runtime);
		assert.throws(() => f.store.update(1, s => s), /stale/);
		assert.deepEqual(readFileSync(selection.pin.runtime), retainedRuntime);
		assert.deepEqual(readFileSync(outside), valid, 'unsafe links never redirect a write');
		const historical = selected(f.root, '22.21.0', 'e'.repeat(64));
		const historicalBinding = readFileSync(historical.binding);
		f.store.update(state.generation, s => ({ ...s, selected: historical, retained: [selection.pin, historical.pin] }));
		assert.equal(f.store.read().selected?.toolchain.nodeVersion, '22.21.0', 'references retain their own release metadata');
		assert.deepEqual(readFileSync(historical.binding), historicalBinding, 'persistence never rewrites a runtime binding');
	}));

	test('Atomic publication with unknown fsync/rename outcome reconciles safely', { timeout: 240_000 }, async t => linux(t, () => {
		for (const point of ['file-synced', 'before-rename', 'after-rename', 'directory-synced'] as const) {
			const f = fixture(t); const before = f.store.read();
			_setSourcePublicationFaultForTests(p => { if (p === point) throw new Error('injected I/O failure'); });
			let unknown: SourcePublicationUnknownError | undefined;
			try { f.store.update(0, state => ({ ...state, active: transaction(state) })); }
			catch (error) { assert.ok(error instanceof SourcePublicationUnknownError); unknown = error; }
			finally { _setSourcePublicationFaultForTests(); }
			assert.ok(unknown);
			const afterRename = point === 'after-rename' || point === 'directory-synced';
			const result = f.store.reconcile(unknown.publication);
			assert.equal(result.status, afterRename ? 'published' : 'not-published');
			assert.equal(result.state.generation, afterRename ? 1 : before.generation);
			assert.deepEqual(f.store.reconcile(unknown.publication), result, 'reconciliation is idempotent');
			if (afterRename) {
				assert.throws(() => f.store.update(1, s => ({ ...s, active: transaction(s) })), /another transaction/);
				assert.throws(() => f.store.update(1, s => ({ ...s, active: null })), /unfinished transaction/);
			} else assert.ok(readdirSync(dirname(f.journal)).some(name => name.startsWith('.journal-')), 'uncertain staged bytes retained');
		}
		const f = fixture(t), outside = join(f.root, 'outside'); mkdirSync(outside, { mode: 0o700 });
		_setSourcePublicationFaultForTests(point => {
			if (point === 'before-rename') {
				renameSync(join(f.root, 'source-lifecycle'), join(f.root, 'pinned-original'));
				symlinkSync(outside, join(f.root, 'source-lifecycle'));
			}
		});
		assert.throws(() => f.store.update(0, s => s), SourcePublicationUnknownError); _setSourcePublicationFaultForTests();
		assert.equal(existsSync(join(outside, 'journal.json')), false, 'pinned descriptor never follows replaced parent');
		assert.throws(() => f.store.read());
	}));

	test('Linux source journal serializes competing writers', { timeout: 240_000 }, async t => linux(t, async () => {
		const f = fixture(t); const env = { ...process.env, INSRC_SOURCE_STATE_WORKER: JSON.stringify({ root: f.root, logical: f.logical }) };
		delete env.NODE_TEST_CONTEXT;
		const settled = await Promise.allSettled(Array.from({ length: 4 }, () => exec(process.execPath, [file], { env, timeout: 20_000 })));
		const results = settled.map(result => { assert.equal(result.status, 'fulfilled'); if (result.status !== 'fulfilled') throw result.reason; return result.value; });
		assert.equal(results.filter(r => r.stdout === 'published').length, 1);
		assert.equal(results.filter(r => r.stdout === 'refused').length, 3);
		assert.equal(f.store.read().generation, 1); assert.ok(f.store.read().active);
	}));
}
