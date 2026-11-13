/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('Promotion requires passing source-built evidence for the exact signed head', async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-promotion-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const repo = join(root, 'repo');
	await mkdir(repo);
	const git = (...args: string[]) => execFileSync('/usr/bin/git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
	git('init', '-qb', 'v2');
	git('config', 'user.name', 'Release Test');
	git('config', 'user.email', 'release@example.invalid');
	await mkdir(join(repo, 'release'));
	await writeFile(join(repo, 'release/macos-compatibility.json'), '{}');
	git('add', '.');
	git('commit', '-qm', 'candidate');
	const commit = git('rev-parse', 'HEAD');
	const tree = git('rev-parse', 'HEAD^{tree}');
	const signingKey = join(root, 'signing');
	execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', signingKey]);
	const qualification = join(root, 'qualification.json');
	const installer = join(root, 'installer.sh');
	const script = new URL('../../../scripts/prepare-source-release.mjs', import.meta.url);
	const stage = () => execFileSync(process.execPath, [script.pathname, qualification, repo, 'v2', '7',
		signingKey, signingKey + '.pub', installer], { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
	const names = ['fresh-start', 'fresh-idle', 'legacy-broker-denied', 'managed-running', 'managed-stopped',
		'guarded-rollback', 'restored-retry', 'linux-regression', 'full-regression'];
	const results = new Map(names.map(name => [name, JSON.stringify({
		version: 1, name, commit, tree, execution: 'source-build', exitCode: 0, passed: 1, failed: 0, skipped: 0,
	})]));
	for (const [name, bytes] of results) await writeFile(join(root, name + '.json'), bytes);
	const evidence = { version: 1, commit, tree, checks: names.map(name => ({
		name, result: 'pass', file: name + '.json', sha256: createHash('sha256').update(results.get(name)!).digest('hex'),
	})) };
	await writeFile(qualification, JSON.stringify({ ...evidence, commit: 'a'.repeat(40) }));
	assert.throws(stage, /does not match/);
	await writeFile(qualification, JSON.stringify({ ...evidence, checks: evidence.checks.slice(1) }));
	assert.throws(stage, /missing passing qualification/);
	await writeFile(qualification, JSON.stringify(evidence));
	const failedName = 'fresh-start';
	const failedFile = join(root, failedName + '.json');
	await writeFile(failedFile, 'replaced result');
	assert.throws(stage, /receipt differs/);
	const failed = JSON.stringify({ ...JSON.parse(results.get(failedName)!), failed: 1, exitCode: 1 });
	await writeFile(failedFile, failed);
	await writeFile(qualification, JSON.stringify({ ...evidence, checks: evidence.checks.map(check =>
		check.name === failedName ? { ...check, sha256: createHash('sha256').update(failed).digest('hex') } : check) }));
	assert.throws(stage, /did not record a passing source build/);
	await writeFile(failedFile, results.get(failedName)!);
	await writeFile(qualification, JSON.stringify(evidence));
	const diverged = join(root, 'diverged');
	git('clone', '-q', repo, diverged);
	execFileSync('/usr/bin/git', ['-C', diverged, '-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid',
		'commit', '-qm', 'diverged', '--allow-empty']);
	assert.throws(() => execFileSync(process.execPath, [script.pathname, qualification, diverged, 'v2', '7',
		signingKey, signingKey + '.pub', installer], { cwd: repo, stdio: 'pipe' }), /branch does not match/);
	const signed = JSON.parse(stage()) as { staged: string; tag: string; tagObject: string };
	assert.equal(git('rev-parse', signed.staged), signed.tagObject);
	assert.equal(git('tag', '--list', signed.tag), '');
	git('update-ref', 'refs/tags/' + signed.tag, signed.tagObject);
	const source = await readFile(installer, 'utf8');
	const bundled = source.match(/^INSRC_RELEASE_BOOTSTRAP_B64='([^']+)'$/m)?.[1];
	assert.ok(bundled);
	const verifier = join(root, 'verifier.mjs');
	await writeFile(verifier, Buffer.from(bundled, 'base64'));
	const workspace = await mkdtemp(join(root, 'fetch-'));
	execFileSync(process.execPath, [verifier, 'authorize', workspace, root, repo, 'v2']);
	assert.equal(await readFile(join(workspace, 'checkout/release/macos-compatibility.json'), 'utf8'), '{}');
});

test('Published installer and both IDEs embed the same trusted verifier', { timeout: 80_000 }, async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-packaged-installer-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const key = join(root, 'signing');
	const installer = join(root, 'published.sh');
	execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
	execFileSync(process.execPath, [fileURLToPath(new URL('../../../scripts/bundle-release-bootstrap.mjs', import.meta.url)), key + '.pub', installer]);
	const env = { ...process.env, INSRC_PACKAGED_INSTALLER: installer };
	const project = fileURLToPath(new URL('../../../', import.meta.url));
	const plugin = join(root, 'vscode-plugin');
	await mkdir(join(plugin, 'assets'), { recursive: true });
	await mkdir(join(root, 'src/prompts'), { recursive: true });
	await copyFile(join(project, 'vscode-plugin/package.json'), join(plugin, 'package.json'));
	await copyFile(join(project, 'src/prompts/steering-block.md'), join(root, 'src/prompts/steering-block.md'));
	execFileSync('npm', ['run', 'sync-assets', '--silent'], { cwd: plugin, env, stdio: 'pipe' });
	const jetbrains = join(project, 'jetbrains-plugin');
	try {
		execFileSync('./gradlew', ['--offline', '--no-configuration-cache', '--console=plain', 'bundleBackendAssets'],
			{ cwd: jetbrains, env, stdio: 'pipe', timeout: 65_000 });
		const bytes = await readFile(installer);
		assert.deepEqual(await readFile(join(plugin, 'assets/insrc-daemon-install.sh')), bytes);
		assert.deepEqual(await readFile(join(jetbrains, 'build/generated-resources/insrc/insrc-daemon-install.sh')), bytes);
	} finally {
		execFileSync('./gradlew', ['--offline', '--no-configuration-cache', '--console=plain', 'bundleBackendAssets'],
			{ cwd: jetbrains, stdio: 'pipe', timeout: 65_000 });
	}
});
