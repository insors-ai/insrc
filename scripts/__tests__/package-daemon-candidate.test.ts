import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { load } from 'js-yaml';

// The release packager is a plain Node script, independent of the TypeScript build.
const script = new URL('../package-daemon-candidate.mjs', import.meta.url);
const { candidateIdentity, stageRuntime } = await import(script.href);

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
			'scripts/daemon-ctl.sh', 'scripts/insrc', 'scripts/insrc-daemon-install.sh',
			'scripts/stage-daemon-bundle.mjs', 'scripts/daemon-bundle-metadata.mjs', 'scripts/verify-daemon-bundle.mjs',
		];
		for (const path of [...paths.map(name => join(source, name)), runtime, join(fixture, 'node-dist/LICENSE')]) {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, path.endsWith('index.js') ? 'runtime marker' : 'fixture');
		}
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
	const commands = build.steps.map(step => step.run).filter(Boolean).join('\n');
	assert.match(commands, /REQUESTED_COMMIT.*GITHUB_SHA/);
	assert.doesNotMatch(commands, /npm (?:run )?test|--test|gh release/);
});
