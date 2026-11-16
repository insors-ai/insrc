import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { load } from 'js-yaml';

const workflow = new URL('../../.github/workflows/daemon-linux-candidate.yml', import.meta.url);
const dispatch = new URL('../linux-daemon-dispatch.mjs', import.meta.url);
const { linuxBuildDispatch } = await import(dispatch.href);
const commit = 'a'.repeat(40);
const env = {
	REQUESTED_COMMIT: commit, RELEASE_VERSION: '0.2.1-dev.1', RELEASE_LANE: 'development',
	GITHUB_SHA: commit, GITHUB_REF: 'refs/heads/team/v3', GITHUB_REF_PROTECTED: 'false',
	GITHUB_REPOSITORY_ID: '23', GITHUB_RUN_ID: '455', GITHUB_RUN_ATTEMPT: '2',
	GITHUB_EVENT_NAME: 'workflow_dispatch', LINUX_RELEASE_REF: 'refs/heads/release',
	LINUX_DEVELOPMENT_REFS: '["refs/heads/team/v3","refs/heads/other"]',
};

test('Linux candidate workflow isolates the Ubuntu build and has only pinned read-only Actions', () => {
	const source = readFileSync(workflow, 'utf8');
	const config = load(source) as {
		on: Record<string, unknown>;
		permissions: Record<string, string>;
		jobs: Record<string, { 'runs-on': string; steps: Array<{ uses?: string; with?: Record<string, string | boolean>; run?: string }> }>;
	};
	assert.deepEqual(Object.keys(config.on), ['workflow_dispatch']);
	assert.deepEqual(config.permissions, { contents: 'read' });
	assert.deepEqual(Object.keys(config.jobs), ['build']);
	const build = config.jobs.build!;
	assert.equal(build['runs-on'], 'ubuntu-24.04');
	assert.equal(build.steps[0]?.with?.['persist-credentials'], false);
	for (const step of build.steps) if (step.uses) assert.match(step.uses, /^actions\/[^@]+@[0-9a-f]{40}$/);
	assert.match(source, /inputs\.commit == github\.sha/);
	assert.match(source, /INSRC_DAEMON_LINUX_DEVELOPMENT_REFS/);
	assert.match(source, /sha256sum -c/);
	assert.match(source, /steps\.upload\.outputs\.artifact-id/);
	assert.doesNotMatch(source, /secrets\.|contents: write|npm (?:run )?test|gh release/);
});

test('Linux dispatch uses configured full refs and records the exact target-qualified candidate', () => {
	assert.equal(linuxBuildDispatch(env).artifactName, `daemon-candidate-linux-x64-development-${commit}-2`);
	assert.equal(linuxBuildDispatch({ ...env, GITHUB_REF: 'refs/heads/other' }).ref, 'refs/heads/other');
	assert.throws(() => linuxBuildDispatch({ ...env, GITHUB_REF: 'refs/heads/v2' }), /not authorized/);
	assert.throws(() => linuxBuildDispatch({ ...env, REQUESTED_COMMIT: 'abcd' }), /invalid exact/);
	assert.throws(() => linuxBuildDispatch({ ...env, GITHUB_SHA: 'b'.repeat(40) }), /invalid exact/);
	assert.throws(() => linuxBuildDispatch({ ...env, GITHUB_RUN_ATTEMPT: '02' }), /invalid exact/);
	const production = { ...env, RELEASE_LANE: 'production', RELEASE_VERSION: '0.2.1-pilot.1' };
	assert.throws(() => linuxBuildDispatch(production), /not authorized/);
	assert.throws(() => linuxBuildDispatch({ ...production, GITHUB_REF: env.LINUX_RELEASE_REF }), /not authorized/);
	assert.equal(linuxBuildDispatch({ ...production, GITHUB_REF: env.LINUX_RELEASE_REF,
		GITHUB_REF_PROTECTED: 'true' }).lane, 'production');
	const directory = mkdtempSync(join(tmpdir(), 'insrc-linux-dispatch-'));
	try {
		const candidate = join(directory, 'candidate.json');
		const digest = 'a'.repeat(64);
		writeFileSync(candidate, JSON.stringify({ target: 'linux-x64', lane: 'development',
			version: env.RELEASE_VERSION, commit, archiveSha256: digest }));
		const result = spawnSync(process.execPath, [dispatch.pathname, 'record', directory], { encoding: 'utf8', env });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /artifact_name=daemon-candidate-linux-x64-development-/);
		assert.equal(JSON.parse(readFileSync(candidate, 'utf8')).runAttempt, 2);
		assert.equal(JSON.parse(readFileSync(candidate, 'utf8')).ref, env.GITHUB_REF);
	} finally { rmSync(directory, { recursive: true, force: true }); }
});
