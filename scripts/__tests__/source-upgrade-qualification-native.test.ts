/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { qualifySourceRelease, stageQualifiedSourceRelease } from '../../src/daemon/source-release-qualification.js';
import { ownedNodeEnvironment } from '../../src/shared/owned-node-runtime.js';
import { nativeOptions, ownedSourceFixture } from './helpers/owned-source-fixture.js';

const git = (cwd: string, ...args: string[]) => execFileSync('/usr/bin/git', ['-C', cwd,
	'-c', 'user.name=Source test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
const declaration = { version: 1, graphSchema: 10, startup: 'rollback-compatible',
	formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' } };

async function authority(root: string) {
	const key = join(root, 'key'), verifier = join(root, 'verifier.mjs'), installer = join(root, 'installer.sh');
	execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
	execFileSync(process.execPath, ['scripts/bundle-release-bootstrap.mjs', key + '.pub', installer]);
	const packaged = await readFile(installer, 'utf8');
	assert.match(packaged, /^INSRC_NODE_BOOTSTRAP_B64='[^']+'/m);
	const encoded = packaged.match(/^INSRC_RELEASE_BOOTSTRAP_B64='([^']+)'$/m)?.[1];
	assert.ok(encoded);
	await writeFile(verifier, Buffer.from(encoded, 'base64'), { mode: 0o600 });
	return { key, verifier };
}

function sign(origin: string, key: string, sequence: number, repoUrl = origin) {
	git(origin, '-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'tag', '-fs', 'insrc-release/main',
		'-m', JSON.stringify({ version: 1, repoUrl, branch: 'main', sequence }));
}

test('Portable source qualification rejects wrong channel/profile/floor before npm', async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-portable-source-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const origin = join(root, 'origin'), stateRoot = join(root, 'state');
	await mkdir(origin); await mkdir(stateRoot);
	git(origin, 'init', '-qb', 'main'); git(origin, 'commit', '--allow-empty', '-qm', 'prior');
	const priorCommit = git(origin, 'rev-parse', 'HEAD');
	await mkdir(join(origin, 'release'));
	const catalog = (target: string, launchProfiles: string[]) => ({ version: 1, target, candidate: declaration,
		predecessors: { [priorCommit]: { declaration, crashConsistentReopening: true, launchProfiles } } });
	for (const target of ['linux-arm64', 'linux-x64']) {
		await writeFile(join(origin, `release/${target}-compatibility.json`), JSON.stringify(catalog(target,
			['linux-source-running', 'linux-source-stopped'])));
	}
	// A tempting Mac catalog must never substitute for a missing Linux catalog.
	await writeFile(join(origin, 'release/macos-compatibility.json'), JSON.stringify(catalog('darwin', ['managed'])));
	git(origin, 'add', '.'); git(origin, 'commit', '-qm', 'candidate');
	const { key, verifier } = await authority(root);
	const input = { stateRoot, runtime: process.execPath, verifier, source: { repoUrl: origin, branch: 'main' }, priorCommit,
		target: 'linux-arm64' as const, launchProfile: 'linux-source-running' };
	const checkout = join(root, 'authorized');
	await assert.rejects(qualifySourceRelease(input, checkout)); // no signed tag
	await assert.rejects(readFile(join(checkout, 'release/linux-arm64-compatibility.json')), { code: 'ENOENT' });
	git(origin, 'tag', '-a', 'insrc-release/main', '-m', 'unsigned');
	await assert.rejects(qualifySourceRelease(input, checkout));
	const foreignKey = join(root, 'foreign');
	execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', foreignKey]);
	sign(origin, foreignKey, 2);
	await assert.rejects(qualifySourceRelease(input, checkout));
	sign(origin, key, 2, '/wrong-channel');
	await assert.rejects(qualifySourceRelease(input, checkout), /configured channel/);
	sign(origin, key, 2);
	await assert.rejects(qualifySourceRelease({ ...input, launchProfile: 'managed' }, checkout), /launch profile/);
	await assert.rejects(readFile(join(checkout, 'release/linux-arm64-compatibility.json')), { code: 'ENOENT' });
	const valid = await qualifySourceRelease(input, checkout);
	assert.equal(valid.qualification.candidate.releaseId, git(origin, 'rev-parse', 'HEAD'));
	assert.deepEqual(valid.launchProfiles, ['linux-source-running', 'linux-source-stopped']);
	await qualifySourceRelease({ ...input, target: 'linux-x64' });
	// A lower Mac observation must not hide a higher Linux source-journal floor.
	for (const [directory, sequence] of [['managed-lifecycle', 1], ['source-lifecycle', 3]] as const) {
		await mkdir(join(stateRoot, directory), { mode: 0o700 });
		await writeFile(join(stateRoot, directory, 'journal.json'), JSON.stringify({ version: 1, root: stateRoot,
			sourceReleases: [{ ...valid.receipt, sequence }], ...(directory === 'source-lifecycle'
				? { installationRoot: origin, generation: 1, selected: null, active: null, retained: [], retainedSelections: [], outcome: null } : {}) }), { mode: 0o600 });
	}
	await assert.rejects(qualifySourceRelease(input), /stale/);
	await writeFile(join(stateRoot, 'source-lifecycle/journal.json'), JSON.stringify({ version: 1, root: stateRoot, installationRoot: origin }));
	await assert.rejects(qualifySourceRelease(input), /invalid record shape/);
	for (const directory of ['managed-lifecycle', 'source-lifecycle']) await rm(join(stateRoot, directory), { recursive: true });
	sign(origin, key, 1);
	await assert.rejects(qualifySourceRelease(input), /stale/);
	git(origin, 'commit', '--allow-empty', '-qm', 'replacement'); sign(origin, key, 2);
	await assert.rejects(qualifySourceRelease(input), /replaces an existing sequence/);
	sign(origin, key, 3);
	git(origin, 'rm', 'release/linux-arm64-compatibility.json'); git(origin, 'commit', '-qm', 'missing Linux catalog'); sign(origin, key, 4);
	await assert.rejects(qualifySourceRelease(input));
	await assert.rejects(qualifySourceRelease({ ...input, target: 'windows' as never }), /unsupported/);
	// Candidate source is inert throughout this fixture: no dependency/build process exists.
	assert.equal(git(origin, 'status', '--porcelain'), '');
});

test('Linux source promotion requires target-specific historical upgrade evidence', async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-linux-promotion-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const origin = join(root, 'origin'); await mkdir(origin); git(origin, 'init', '-qb', 'main');
	git(origin, 'commit', '--allow-empty', '-qm', 'prior'); const prior = git(origin, 'rev-parse', 'HEAD');
	await mkdir(join(origin, 'release'));
	for (const target of ['linux-arm64', 'linux-x64']) await writeFile(join(origin, `release/${target}-compatibility.json`),
		JSON.stringify({ version: 1, target, candidate: declaration, predecessors: { [prior]: {
			declaration, crashConsistentReopening: true, launchProfiles: ['linux-source-stopped'] } } }));
	git(origin, 'add', '.'); git(origin, 'commit', '-qm', 'candidate');
	const commit = git(origin, 'rev-parse', 'HEAD'), tree = git(origin, 'rev-parse', 'HEAD^{tree}');
	const { key } = await authority(root);
	const names = ['historical-upgrade', 'migrated-update', 'guarded-rollback', 'restored-retry', 'full-regression'];
	for (const target of ['linux-arm64', 'linux-x64']) {
		const evidenceFile = join(root, target + '.json'), output = join(root, target + '-installer.sh');
		const checks = [];
		for (const name of names) {
			const bytes = JSON.stringify({ version: 1, target, name, commit, tree, execution: 'source-build',
				exitCode: 0, passed: 1, failed: 0, skipped: 0 });
			const file = `${target}-${name}.json`; await writeFile(join(root, file), bytes);
			checks.push({ name, file, result: 'pass', sha256: createHash('sha256').update(bytes).digest('hex') });
		}
		const evidence = { version: 1, target, commit, tree, checks };
		const run = () => execFileSync(process.execPath, [new URL('../prepare-source-release.mjs', import.meta.url).pathname,
			evidenceFile, origin, 'main', target === 'linux-arm64' ? '7' : '8', key, key + '.pub', output, target], { cwd: origin, stdio: 'pipe' });
		await writeFile(evidenceFile, JSON.stringify({ ...evidence, target: 'darwin' }));
		assert.throws(run, /evidence target/);
		await writeFile(evidenceFile, JSON.stringify({ ...evidence, checks: checks.slice(1) }));
		assert.throws(run, /missing passing qualification/);
		await writeFile(evidenceFile, JSON.stringify(evidence));
		const promoted = JSON.parse(run().toString());
		git(origin, 'update-ref', 'refs/tags/insrc-release/main', promoted.tagObject);
		const encoded = (await readFile(output, 'utf8')).match(/^INSRC_RELEASE_BOOTSTRAP_B64='([^']+)'$/m)?.[1];
		assert.ok(encoded); const verifier = join(root, target + '-verifier.mjs');
		await writeFile(verifier, Buffer.from(encoded, 'base64'));
		const workspace = await mkdtemp(join(root, 'verify-'));
		// The package owns the target default; no caller target flag is supplied.
		const result = execFileSync(process.execPath, [verifier, 'qualification', workspace, root, origin, 'main',
			`--prior=${prior}`, '--profile=linux-source-stopped'], { encoding: 'utf8' });
		assert.equal(JSON.parse(result).target, target);
	}
});

test('Independent staging uses absolute owned npm and preserves Mac signed behavior', nativeOptions, async t => {
	const f = ownedSourceFixture('26'); t.after(() => f.clean());
	const source = { repoUrl: f.seed, branch: 'main' }, stateRoot = join(f.home, '.insrc');
	const { key, verifier } = await authority(f.root);
	await writeFile(join(f.seed, '.gitignore'), 'out/\nnode_modules/\npackages/project-memory/\n');
	let observer = await readFile(join(f.seed, 'observer.mjs'), 'utf8');
	observer = observer.replace('version:process.versions.node,', 'cuda:process.env.ONNXRUNTIME_NODE_INSTALL_CUDA,python:process.env.PYTHONDONTWRITEBYTECODE,version:process.versions.node,');
	observer += `\nif(phase==='build') {\n for(const d of ['out/daemon','node_modules','packages/project-memory'])fs.mkdirSync(d,{recursive:true});\n fs.writeFileSync('out/daemon/index.js','process.exit(0);');\n fs.writeFileSync('out/bin/insrc-daemon-supervisor.js','process.exit(0);');\n}\n`;
	await writeFile(join(f.seed, 'observer.mjs'), observer);
	git(f.seed, 'add', '.'); git(f.seed, 'commit', '-qm', 'qualified predecessor');
	const priorCommit = git(f.seed, 'rev-parse', 'HEAD'), prior = join(f.root, 'incumbent');
	git(f.root, 'clone', '-q', '--', f.seed, prior);
	const toolchain = { node: join(f.distribution, 'bin/node'), npm: join(f.distribution, 'lib/node_modules/npm/bin/npm-cli.js'), identity: '22.22.1:fixture' };
	assert.equal(execFileSync(toolchain.node, [toolchain.npm, '--version'], { encoding: 'utf8', env: { ...f.env, NODE_OPTIONS: '', NODE_PATH: '' } }).trim(), '10.9.4');
	const env = ownedNodeEnvironment(toolchain, { ...f.env, ONNXRUNTIME_NODE_INSTALL_CUDA: 'v12' });
	for (const args of [['ci'], ['run', 'build']]) execFileSync(toolchain.node, [toolchain.npm, ...args], { cwd: prior, env, stdio: 'pipe' });
	const before = await readFile(join(prior, 'out/daemon/index.js'));
	await mkdir(join(f.seed, 'release'));
	await writeFile(join(f.seed, 'release/macos-compatibility.json'), JSON.stringify({ version: 1, candidate: declaration,
		predecessors: { [priorCommit]: { declaration, crashConsistentReopening: true, launchProfiles: ['legacy-stopped'] } } }));
	git(f.seed, 'add', '.'); git(f.seed, 'commit', '-qm', 'candidate qualification'); sign(f.seed, key, 1);
	// Exercise the portable API without the Darwin journal/launchctl owner.
	const inherited = { ...process.env };
	try {
		Object.assign(process.env, f.env); delete process.env.NODE_OPTIONS; delete process.env.NODE_PATH;
		for (const override of [undefined, '', 'v12']) {
			if (override === undefined) delete process.env.ONNXRUNTIME_NODE_INSTALL_CUDA;
			else process.env.ONNXRUNTIME_NODE_INSTALL_CUDA = override;
			const staged = await stageQualifiedSourceRelease({ stateRoot, runtime: toolchain.node, verifier, source,
				priorCommit, target: 'darwin', launchProfile: 'legacy-stopped' }, prior, toolchain.node).catch((error: unknown) => {
				const detail = error as { message?: string; stdout?: string; stderr?: string };
				throw new Error(`${detail.message ?? String(error)}\nstdout:\n${detail.stdout ?? ''}\nstderr:\n${detail.stderr ?? ''}`, { cause: error });
			});
			assert.equal(staged.candidate.runtime, toolchain.node);
			assert.equal(staged.prior?.runtime, toolchain.node);
			assert.notEqual(staged.candidate.root, prior);
			assert.deepEqual(await readFile(join(prior, 'out/daemon/index.js')), before);
			assert.equal(git(prior, 'rev-parse', 'HEAD'), priorCommit);
			const preinstall = f.records().filter(r => r.phase === 'preinstall').at(-1);
			assert.equal(preinstall.version, '22.22.1');
			assert.equal(preinstall.cuda, override ?? 'skip');
			assert.equal(preinstall.python, '1');
			assert.equal(f.records().filter(r => r.phase === 'build').at(-1).exe, toolchain.node);
			await assert.rejects(readFile(f.fakeTrace), { code: 'ENOENT' });
		}

	} finally {
		for (const k of Object.keys(process.env)) if (!(k in inherited)) delete process.env[k];
		Object.assign(process.env, inherited);
	}
});
