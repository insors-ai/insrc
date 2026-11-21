import { copyNodeRuntimeAssets } from '../node-runtime-assets.mjs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { load } from 'js-yaml';

// The release packager is a plain Node script, independent of the TypeScript build.
const script = new URL('../package-daemon-candidate.mjs', import.meta.url);
const { candidateIdentity, dispatchOrigin, stageRuntime, writeCandidateMetadata } = await import(script.href);

test('packager emits candidate metadata and the upload name for each lane', async () => {
	const root = await mkdtemp(join(tmpdir(), 'insrc-candidate-metadata-'));
	try {
		const commit = 'a'.repeat(40);
		const identity = candidateIdentity('0.2.1-pilot.1', commit);
		const payload = Buffer.from('archive fixture');
		const digest = createHash('sha256').update(payload).digest('hex');
		for (const [branch, lane] of [['main', 'release'], ['v2', 'development']]) {
			const output = join(root, branch);
			await mkdir(output);
			await writeFile(join(output, identity.archiveName), payload);
			const outputs = join(root, branch + '.outputs');
			await writeCandidateMetadata(output, identity, { GITHUB_ACTIONS: 'true', GITHUB_REF: `refs/heads/${branch}`,
				GITHUB_SHA: commit, GITHUB_RUN_ID: '1234', GITHUB_RUN_ATTEMPT: '2', GITHUB_OUTPUT: outputs });
			assert.deepEqual(JSON.parse(await readFile(join(output, 'candidate.json'), 'utf8')),
				{ schemaVersion: 1, ...identity, branch, lane, runId: '1234', runAttempt: '2', archiveSha256: digest, archiveBytes: payload.length });
			assert.equal(await readFile(outputs, 'utf8'), `archive_sha256=${digest}\nartifact_name=daemon-candidate-${lane}-${commit}-2\n`);
		}
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('candidate layout survives moving the runtime and rejects external links', async () => {
	const fixture = await mkdtemp(join(tmpdir(), 'insrc-candidate-test-'));
	try {
		const source = join(fixture, 'source');
		const runtime = join(fixture, 'node-dist/bin/node');
		const staging = join(fixture, 'relocated');
		const paths = [
			'out/daemon/index.js', 'out/bin/insrc-daemon-control.js', 'out/bin/insrc-daemon-supervisor.js',
			'out/bin/insrc-shutdown-watchdog.js', 'out/bin/insrc-process-broker', 'out/bin/insrc-darwin-lifecycle',
			'packages/project-memory/dist/index.js', 'packages/project-memory/package.json', 'packages/project-memory/LICENSE',
			'package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
			'node_modules/.bin/fixture', 'node_modules/example/index.js',
			'scripts/daemon-ctl.sh', 'scripts/insrc', 'scripts/insrc-mcp', 'scripts/verify-installed-runtime.mjs', 'scripts/insrc-daemon-install.sh',
			'scripts/stage-daemon-bundle.mjs', 'scripts/daemon-bundle-metadata.mjs', 'scripts/verify-daemon-bundle.mjs',
		];
		for (const path of [...paths.map(name => join(source, name)), runtime, join(fixture, 'node-dist/LICENSE')]) {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, path.endsWith('index.js') ? 'runtime marker' : 'fixture');
		}
		copyNodeRuntimeAssets(fileURLToPath(new URL('../../', import.meta.url)), source);
		await mkdir(join(source, 'node_modules/@insrc'));
		await symlink('../../packages/project-memory', join(source, 'node_modules/@insrc/project-memory'));
		await symlink('../node_modules', join(source, 'out/node_modules'));
		await symlink('index.js', join(source, 'node_modules/example/alias.js'));
		await mkdir(staging);
		await stageRuntime(source, staging, runtime);
		await rm(join(source, 'packages'), { recursive: true });
		assert.equal(await readFile(join(staging, 'node_modules/@insrc/project-memory/dist/index.js'), 'utf8'), 'runtime marker');
		assert.equal(await readFile(join(staging, 'node_modules/example/alias.js'), 'utf8'), 'runtime marker');
		assert.equal(await readFile(join(staging, 'tools/node'), 'utf8'), 'fixture');
		await assert.rejects(readFile(join(staging, 'node_modules/.bin/fixture')), { code: 'ENOENT' });
		await assert.rejects(readFile(join(staging, 'out/node_modules/example/index.js')), { code: 'ENOENT' });
		await mkdir(join(source, 'packages'));
		await symlink(join(staging, 'packages/project-memory'), join(source, 'packages/project-memory'));
		await symlink(runtime, join(source, 'node_modules/example/outside'));
		const unsafe = join(fixture, 'unsafe');
		await mkdir(unsafe);
		await assert.rejects(stageRuntime(source, unsafe, runtime), /unsupported runtime link/);
	} finally {
		await rm(fixture, { recursive: true, force: true });
	}
});

test('candidate workflow accepts only the protected dispatch revision and has no test or publish jobs', async () => {
	const sha = 'a'.repeat(40);
	assert.equal(candidateIdentity('0.2.1-pilot.1', sha).commit, sha);
	assert.throws(() => candidateIdentity('0.2.1-pilot.1', 'v2'), /commit SHA/);
	assert.throws(() => candidateIdentity('../pilot', sha), /version/);
	const yaml = load(await readFile(new URL('../../.github/workflows/daemon-candidate.yml', import.meta.url), 'utf8')) as {
		'on': Record<string, unknown>;
		permissions: Record<string, string>;
		jobs: Record<string, { if: string; steps: Array<{ run?: string }> }>;
	};
	assert.deepEqual(Object.keys(yaml.on), ['workflow_dispatch']);
	assert.deepEqual(yaml.permissions, { contents: 'read' });
	assert.deepEqual(Object.keys(yaml.jobs), ['build']);
	const build = yaml.jobs['build'];
	assert.ok(build);
	assert.match(build.if, /github\.ref_protected/);
	assert.match(build.if, /refs\/heads\/v2.*refs\/heads\/main.*INSRC_DAEMON_MAIN_RELEASE_READY == 'true'/);
	assert.ok(!('environment' in build));
	// Translate the fixed identifiers in this small admission expression,
	// then evaluate the actual checked-in condition against the lane matrix.
	const condition = build.if.replaceAll('vars.INSRC_DAEMON_MAIN_RELEASE_READY', 'ready')
		.replaceAll('github.ref_protected', 'protectedRef').replaceAll('github.ref', 'ref')
		.replaceAll('github.sha', 'sha').replaceAll('inputs.commit', 'requested').replaceAll(' == ', ' === ');
	assert.match(condition, /^[a-zA-Z0-9_ '=()/&|]+$/);
	const admits = new Function('ref', 'protectedRef', 'ready', 'sha', 'requested', `return (${condition})`);
	for (const [ref, protection, ready, requested, expected] of [
		['refs/heads/main', true, 'true', sha, true],
		['refs/heads/main', false, 'true', sha, false],
		['refs/heads/main', true, 'false', sha, false],
		['refs/heads/main', true, '', sha, false],
		['refs/heads/v2', false, '', sha, true],
		['refs/heads/other', true, 'true', sha, false],
		['refs/heads/v2', false, '', 'b'.repeat(40), false],
	]) assert.equal(admits(ref, protection, ready, sha, requested), expected);
	assert.doesNotMatch(JSON.stringify(build), /secrets\.|contents:\s*write|daemon-pilot-production|daemon-pilot-qualification/);
	const env = { GITHUB_REF: 'refs/heads/v2', GITHUB_SHA: sha, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' };
	assert.deepEqual(dispatchOrigin(env, sha), { branch: 'v2', lane: 'development', runId: '123', runAttempt: '2' });
	assert.equal(dispatchOrigin({ ...env, GITHUB_REF: 'refs/heads/main' }, sha).lane, 'release');
	assert.throws(() => dispatchOrigin({ ...env, GITHUB_REF: 'refs/tags/main' }, sha), /origin/);
	assert.throws(() => dispatchOrigin(env, 'b'.repeat(40)), /origin/);
	const commands = build.steps.map(step => step.run).filter(Boolean).join('\n');
	assert.match(commands, /REQUESTED_COMMIT.*GITHUB_SHA/);
	assert.doesNotMatch(commands, /npm (?:run )?test|--test|gh release/);
});
