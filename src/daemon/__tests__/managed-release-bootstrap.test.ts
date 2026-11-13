/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import { readVerifiedSourceRelease } from '../../shared/managed-source-release.js';

const exec = promisify(execFile);
const project = new URL('../../../', import.meta.url);

test('The installation journal persists signed source floors independently per channel', {
	skip: process.platform !== 'darwin',
}, async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-source-floor-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const gate = new InstallationMutationGate(root);
	const release = readVerifiedSourceRelease({ channel: { repoUrl: 'https://example.invalid/insrc', branch: 'v2' },
		sequence: 2, tagObject: 'a'.repeat(40), commit: 'b'.repeat(40), tree: 'c'.repeat(40) });
	await gate.observeSourceRelease(release);
	await gate.observeSourceRelease(release);
	await assert.rejects(gate.observeSourceRelease({ ...release, sequence: 1 }), /stale/);
	await assert.rejects(gate.observeSourceRelease({ ...release, tagObject: 'd'.repeat(40) }), /replaces/);
	const other = { ...release, channel: { ...release.channel, branch: 'main' }, sequence: 1 };
	await gate.observeSourceRelease(other);
	assert.deepEqual((await new InstallationMutationGate(root).read()).sourceReleases, [release, other]);
});

test('Only an authorized channel tag can reach checkout and npm', async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-source-release-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const origin = join(root, 'origin');
	const incumbent = join(root, 'installed');
	const home = join(root, 'home');
	const state = join(home, '.insrc');
	const key = join(root, 'signing-key');
	const foreign = join(root, 'foreign-key');
	const git = async (cwd: string, ...args: string[]) => (await exec('/usr/bin/git', [
		'-C', cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
		'-c', 'commit.gpgsign=false', '-c', 'gpg.format=ssh', ...args,
	])).stdout.trim();
	for (const path of [key, foreign]) await exec('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path]);
	await mkdir(origin);
	await mkdir(state, { recursive: true });
	await git(origin, 'init', '-q', '-b', 'v2');
	await git(origin, 'commit', '-q', '--allow-empty', '-m', 'incumbent');
	const prior = await git(origin, 'rev-parse', 'HEAD');
	await git(root, 'clone', '-q', '--no-local', origin, incumbent);
	await writeFile(join(origin, 'candidate'), 'candidate source');
	await mkdir(join(origin, 'release'));
	await writeFile(join(origin, 'release/macos-compatibility.json'), '{}');
	await git(origin, 'add', 'candidate', 'release/macos-compatibility.json');
	await git(origin, 'commit', '-qm', 'candidate');
	const packaged = join(root, 'installer.sh');
	await exec(process.execPath, [new URL('scripts/bundle-release-bootstrap.mjs', project).pathname, key + '.pub', packaged]);
	const installer = await readFile(packaged, 'utf8');
	const bundled = installer.match(/^INSRC_RELEASE_BOOTSTRAP_B64='([^']+)'$/m)?.[1];
	assert.ok(bundled);
	const verifier = join(root, 'verifier.mjs');
	await writeFile(verifier, Buffer.from(bundled, 'base64'));
	const tools = join(root, 'tools');
	const trace = join(root, 'npm-invoked');
	await mkdir(tools);
	await writeFile(join(tools, 'uname'), '#!/bin/sh\nprintf "Darwin\\n"\n', { mode: 0o700 });
	await writeFile(join(tools, 'npm'), '#!/bin/sh\ntouch "$INSRC_TEST_NPM_TRACE"\nexit 1\n', { mode: 0o700 });
	const shell = () => exec('/bin/bash', [packaged, '-y', '--target', incumbent, '--repo', origin, '--branch', 'v2'], {
		env: { ...process.env, HOME: home, TMPDIR: root, PATH: `${tools}:${join(process.execPath, '..')}:/usr/bin:/bin`,
			INSRC_TEST_NPM_TRACE: trace },
	});
	const tagName = 'insrc-release/v2';
	const tag = (sequence: number, signer = key, target = 'HEAD', repoUrl = origin) => git(origin, '-c', `user.signingkey=${signer}`,
		'tag', '-fs', tagName, target, '-m', JSON.stringify({ version: 1, repoUrl, branch: 'v2', sequence }));
	const authorize = (workspace: string) => exec(process.execPath, [verifier, 'authorize', workspace, state, origin, 'v2']);
	const denied = async (pattern?: RegExp) => {
		const workspace = await mkdtemp(join(root, 'denied-'));
		if (pattern === undefined) await assert.rejects(authorize(workspace));
		else await assert.rejects(authorize(workspace), pattern);
		await assert.rejects(readFile(join(workspace, 'checkout/candidate')), { code: 'ENOENT' });
		await assert.rejects(shell(), /bridge authorization failed/);
		await assert.rejects(readFile(trace), { code: 'ENOENT' });
	};
	await denied();
	await git(origin, 'tag', '-f', tagName);
	await denied();
	await git(origin, 'tag', '-fa', tagName, '-m', 'unsigned');
	await denied();
	await tag(2, foreign);
	await denied();
	await tag(2, key, prior);
	await denied(/branch head/);
	await tag(2, key, 'HEAD', '/wrong-channel');
	await denied(/configured channel/);
	await tag(2);
	const valid = await mkdtemp(join(root, 'valid-'));
	await authorize(valid);
	assert.equal(await readFile(join(valid, 'checkout/candidate'), 'utf8'), 'candidate source');
	const receipt = JSON.parse(await readFile(join(valid, 'source-release.json'), 'utf8'));
	const journal = join(state, 'managed-lifecycle');
	await mkdir(journal, { mode: 0o700 });
	await writeFile(join(journal, 'journal.json'), JSON.stringify({ version: 1, root: state, active: null, outcome: null,
		sourceReleases: [receipt] }), { mode: 0o600 });
	await authorize(await mkdtemp(join(root, 'retry-')));
	await tag(1);
	await denied(/stale/);
	await git(origin, 'commit', '-q', '--allow-empty', '-m', 'replacement');
	await tag(2);
	await denied(/replaces an existing sequence/);
	await tag(3);
	await assert.rejects(shell(), error => (error as { code?: number }).code === 1);
	await readFile(trace);
});

test('Fresh macOS install and Linux install preserve their existing build and launch routes', async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-fresh-routing-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const tools = join(root, 'tools');
	await mkdir(tools);
	const shim = (name: string, command: string) =>
		writeFile(join(tools, name), '#!/bin/bash\nset -eu\n' + command, { mode: 0o700 });
	await shim('uname', 'printf "%s\\n" "$INSRC_TEST_PLATFORM"');
	await shim('git', `
case "$1" in
--version) printf 'git version 2.45.0\\n' ;;
clone)
  target="$7"
  mkdir -p "$target/out/bin" "$target/scripts" "$target/src/assets/models"
  cp "$INSRC_TEST_CATALOG" "$target/src/assets/models/cloud-model-catalog.json"
  : > "$target/out/bin/insrc-daemon-control.js"
  printf '%s\\n' '#!/bin/sh' 'echo linux-start >> "$INSRC_TEST_TRACE"' > "$target/scripts/daemon-ctl.sh"
  chmod +x "$target/scripts/daemon-ctl.sh"
  ;;
-C) printf 'abcdef\\n' ;;
*) exit 1 ;;
esac`);
	await shim('npm', 'printf "npm:%s\\n" "$1" >> "$INSRC_TEST_TRACE"');
	await shim('curl', 'exit 1');
	await shim('node', `
if [ "\${2:-}" = "activate-fresh" ]; then
  printf 'mac-activate:%s\\n' "$4" >> "$INSRC_TEST_TRACE"
  exit 0
fi
exec "$INSRC_TEST_NODE" "$@"`);
	const installer = new URL('scripts/insrc-daemon-install.sh', project).pathname;
	for (const platform of ['Darwin', 'Linux']) {
		const home = join(root, platform);
		await mkdir(home);
		const trace = join(home, 'trace');
		const target = join(home, 'daemon');
		await exec('/bin/bash', [installer, '-y', '--target', target, '--embedder', 'onnx',
			...(platform === 'Darwin' ? ['--no-start'] : [])], {
			env: { ...process.env, HOME: home, PATH: `${tools}:/usr/bin:/bin`, INSRC_TEST_PLATFORM: platform,
				INSRC_TEST_TRACE: trace, INSRC_TEST_NODE: process.execPath,
				INSRC_TEST_CATALOG: new URL('src/assets/models/cloud-model-catalog.json', project).pathname },
		});
		assert.deepEqual((await readFile(trace, 'utf8')).trim().split('\n'), platform === 'Darwin'
			? ['npm:ci', 'npm:run', 'mac-activate:idle']
			: ['npm:install', 'npm:run', 'linux-start']);
	}
});
