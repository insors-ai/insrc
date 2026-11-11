/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { captureManagedReleasePin, stageManagedRelease, verifyStagedReleasePin } from '../managed-release-staging.js';
import type { ManagedReleaseQualification } from '../managed-release-staging.js';
import type { ReleaseCompatibility } from '../release-compatibility.js';

function git(root: string, ...args: string[]): string {
	return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function profile(releaseId: string): ReleaseCompatibility {
	return {
		version: 1, releaseId, graphSchema: 10, startup: 'rollback-compatible',
		formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' },
	};
}

async function fixture(t: TestContext) {
	const stateRoot = await realpath(await mkdtemp(join(tmpdir(), 'insrc-release-stage-')));
	t.after(() => rm(stateRoot, { recursive: true, force: true }));
	const repoUrl = join(stateRoot, 'origin');
	const old = join(stateRoot, 'daemon');
	const qualifiedOld = join(stateRoot, 'qualified');
	await mkdir(repoUrl);
	git(repoUrl, 'init', '-q', '-b', 'v2');
	git(repoUrl, 'config', 'user.name', 'insrc tests');
	git(repoUrl, 'config', 'user.email', 'tests@example.invalid');
	const manifest = { name: 'staging-fixture', version: '1.0.0', type: 'module', scripts: { build: 'node build.mjs' } };
	const files = {
		'.gitignore': 'out/\nnode_modules/\ndist/\n',
		'package.json': JSON.stringify(manifest),
		'package-lock.json': JSON.stringify({ ...manifest, lockfileVersion: 3, packages: { '': { name: manifest.name, version: manifest.version } } }),
		'build.mjs': [
			"import { mkdir, writeFile } from 'node:fs/promises';",
			"for (const dir of ['out/daemon', 'out/bin', 'node_modules', 'packages/project-memory/dist']) await mkdir(dir, { recursive: true });",
			"await writeFile('out/daemon/index.js', 'process.stdout.write(\"candidate daemon\");');",
			"await writeFile('out/bin/insrc-daemon-supervisor.js', 'process.stdout.write(\"candidate supervisor\");');",
		].join('\n'),
		'version.txt': 'prior',
	};
	for (const [name, value] of Object.entries(files)) await writeFile(join(repoUrl, name), value);
	git(repoUrl, 'add', '.');
	git(repoUrl, 'commit', '-qm', 'prior');
	const priorCommit = git(repoUrl, 'rev-parse', 'HEAD');
	const priorDependency = 'export default "prior daemon";';
	for (const root of [old, qualifiedOld]) {
		git(stateRoot, 'clone', '-q', '--', repoUrl, root);
		for (const dir of ['out/daemon', 'node_modules/dependency', 'packages/project-memory/dist']) {
			await mkdir(join(root, dir), { recursive: true });
		}
		await writeFile(join(root, 'out/daemon/index.js'), 'import value from "../../node_modules/dependency/index.mjs"; process.stdout.write(value);');
		await writeFile(join(root, 'node_modules/dependency/index.mjs'), priorDependency);
	}
	const entry = join(old, 'out/daemon/index.js');
	const dependency = join(old, 'node_modules/dependency/index.mjs');
	await writeFile(join(repoUrl, 'version.txt'), 'candidate');
	git(repoUrl, 'commit', '-qam', 'candidate');
	const source = { repoUrl, branch: 'v2' };
	const candidate = profile(git(repoUrl, 'rev-parse', 'HEAD'));
	const runtime = await realpath(process.execPath);
	const { fingerprint: priorFingerprint } = await captureManagedReleasePin(qualifiedOld, runtime);
	const qualification: ManagedReleaseQualification = {
		source, candidate, pairs: [{ prior: profile(priorCommit), candidate, priorFingerprint }],
	};
	const options = { stateRoot, runtime, source, qualification, prior: { root: old, runtime } };
	return { options, entry, dependency, old, priorCommit, priorFingerprint, priorDependency };
}

test('Release provenance, changed bytes and absent legacy declaration', async t => {
	const f = await fixture(t);
	await assert.rejects(stageManagedRelease({ ...f.options, source: { ...f.options.source, branch: 'main' } }), /different update source/);
	await assert.rejects(stageManagedRelease({
		...f.options, qualification: { ...f.options.qualification, pairs: [] },
	}), /installed commit is not qualified/);
	const declared = join(f.old, 'out/release-compatibility.json');
	await writeFile(declared, JSON.stringify(profile(f.options.qualification.candidate.releaseId)));
	await assert.rejects(stageManagedRelease(f.options), /differs from trusted qualification/);
	await rm(declared);
	await writeFile(f.dependency, 'export default "already modified";');
	await assert.rejects(stageManagedRelease(f.options), /installed executable bytes differ from trusted qualification/);
	await writeFile(f.dependency, f.priorDependency);
	const staged = await stageManagedRelease(f.options);
	assert.equal(staged.compatibility?.prior.releaseId, f.priorCommit);
	assert.ok(staged.prior);
	await writeFile(f.dependency, 'changed dependency');
	await assert.rejects(verifyStagedReleasePin(staged.prior), /pinned release changed/);
});

test('Staging leaves the installed release executable and unchanged', async t => {
	const f = await fixture(t);
	const before = await readFile(f.entry);
	const dependencyBefore = await readFile(f.dependency);
	const staged = await stageManagedRelease(f.options);
	assert.ok(staged.prior);
	assert.equal(staged.prior.root, f.old);
	assert.equal(git(f.old, 'rev-parse', 'HEAD'), f.priorCommit);
	assert.equal(git(f.old, 'status', '--porcelain'), '');
	assert.deepEqual(await readFile(f.entry), before);
	assert.deepEqual(await readFile(f.dependency), dependencyBefore);
	assert.equal(execFileSync(staged.prior.runtime, [f.entry], { encoding: 'utf8' }), 'prior daemon');
	assert.equal(execFileSync(staged.candidate.runtime, [join(staged.candidate.root, 'out/daemon/index.js')], { encoding: 'utf8' }), 'candidate daemon');
	assert.equal(git(staged.candidate.root, 'rev-parse', 'HEAD'), f.options.qualification.candidate.releaseId);
	assert.equal(JSON.parse(await readFile(join(staged.candidate.root, 'out/release-compatibility.json'), 'utf8')).releaseId, staged.candidate.commit);
	assert.deepEqual((await readdir(f.options.stateRoot)).sort(), ['daemon', 'managed-lifecycle', 'origin', 'qualified']);
	await verifyStagedReleasePin(staged.prior);
	await verifyStagedReleasePin(staged.candidate);

	const releases = join(f.options.stateRoot, 'managed-lifecycle', 'releases');
	const beforeMismatch = await readdir(releases);
	const wrongCandidate = profile('f'.repeat(40));
	await assert.rejects(stageManagedRelease({
		...f.options,
		qualification: {
			...f.options.qualification,
			candidate: wrongCandidate,
			pairs: [{ prior: profile(f.priorCommit), candidate: wrongCandidate, priorFingerprint: f.priorFingerprint }],
		},
	}), /fetched branch does not match/);
	assert.deepEqual(await readdir(releases), beforeMismatch);
	assert.deepEqual(await readFile(f.entry), before);
});
