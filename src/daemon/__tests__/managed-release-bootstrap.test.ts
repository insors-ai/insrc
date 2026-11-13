/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { releaseMetadataDigest, releaseSignatureFrame } from '../../shared/managed-release-trust.js';

const exec = promisify(execFile);
const project = new URL('../../../', import.meta.url);

function envelope(domain: Parameters<typeof releaseSignatureFrame>[0], key: KeyObject, value: unknown): string {
	const payload = Buffer.from(JSON.stringify(value));
	return JSON.stringify({ payload: payload.toString('base64'),
		signature: sign(null, releaseSignatureFrame(domain, payload), key).toString('base64') });
}

test('Invalid or missing authorization prevents bootstrap checkout execution, npm scripts and bridge invocation', async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-release-bootstrap-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const origin = join(root, 'origin');
	const incumbent = join(root, 'installed');
	const keys = generateKeyPairSync('ed25519');
	const delegate = generateKeyPairSync('ed25519');
	const git = async (cwd: string, ...args: string[]) => (await exec('/usr/bin/git', [
		'-C', cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args,
	])).stdout.trim();
	await mkdir(origin);
	await git(origin, 'init', '-q', '-b', 'v2');
	await git(origin, 'commit', '-q', '--allow-empty', '-m', 'incumbent');
	const priorCommit = await git(origin, 'rev-parse', 'HEAD');
	const priorTree = await git(origin, 'rev-parse', 'HEAD^{tree}');
	await git(root, 'clone', '-q', '--no-local', origin, incumbent);
	await writeFile(join(origin, 'candidate'), 'candidate source');
	await git(origin, 'add', 'candidate');
	await git(origin, 'commit', '-qm', 'candidate');
	const candidateCommit = await git(origin, 'rev-parse', 'HEAD');
	const candidateTree = await git(origin, 'rev-parse', 'HEAD^{tree}');
	const keyFile = join(root, 'root.pem');
	const packaged = join(root, 'installer.sh');
	await writeFile(keyFile, keys.publicKey.export({ format: 'pem', type: 'spki' }));
	await exec(process.execPath, [new URL('scripts/bundle-release-bootstrap.mjs', project).pathname, keyFile, packaged]);
	const installer = await readFile(packaged, 'utf8');
	const bundled = installer.match(/^INSRC_RELEASE_BOOTSTRAP_B64='([^']+)'$/m)?.[1];
	assert.ok(bundled);
	const verifier = join(root, 'verifier.mjs');
	await writeFile(verifier, Buffer.from(bundled, 'base64'));
	const window = { notBefore: Date.now() - 5_000, expiresAt: Date.now() + 120_000 };
	const channel = { repoUrl: origin, branch: 'v2' };
	const keyId = 'fixture';
	const trust = envelope('release-trust', keys.privateKey, { version: 1, epoch: 1, ...window, revoked: [],
		keys: [{ id: keyId, publicKey: delegate.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'), channel, ...window }] });
	await git(origin, 'notes', '--ref=insrc-release-trust', 'add', '-m', trust, candidateCommit);
	const inventory = Buffer.from('[]');
	const referenceDigest = releaseMetadataDigest(Buffer.from(JSON.stringify([
		releaseMetadataDigest(inventory), releaseMetadataDigest(inventory),
	])));
	const compatibility = Buffer.from('{"candidate":{}}');
	const qualification = { version: 1, keyId, channel, priorCommit, priorTree, candidateCommit, candidateTree,
		profile: 'test', referenceDigest, compatibilityDigest: releaseMetadataDigest(compatibility),
		testEvidenceDigest: 'a'.repeat(64), ...window };
	const note = async (key: KeyObject) => git(origin, 'notes', '--ref=insrc-daemon-updates', 'add', '-f', '-m',
		JSON.stringify({ keyId, qualification: Buffer.from(envelope('release-qualification', key, qualification)).toString('base64'),
			priorInventory: inventory.toString('base64'), candidateInventory: inventory.toString('base64'),
			compatibility: compatibility.toString('base64') }), candidateCommit);
	const authorize = (workspace: string) => exec(process.execPath, [verifier, 'authorize', workspace, incumbent, origin, 'v2']);
	const tools = join(root, 'tools');
	const home = join(root, 'home');
	const trace = join(root, 'npm-invoked');
	await mkdir(tools);
	await mkdir(home);
	await writeFile(join(tools, 'uname'), '#!/bin/sh\nprintf "Darwin\\n"\n', { mode: 0o700 });
	await writeFile(join(tools, 'npm'), '#!/bin/sh\ntouch "$INSRC_TEST_NPM_TRACE"\n', { mode: 0o700 });
	const shell = () => exec('/bin/bash', [packaged, '-y', '--target', incumbent, '--repo', origin, '--branch', 'v2'], {
		env: { ...process.env, HOME: home, TMPDIR: root, PATH: `${tools}:${join(process.execPath, '..')}:/usr/bin:/bin`,
			INSRC_TEST_NPM_TRACE: trace },
	});
	const missing = await mkdtemp(join(root, 'missing-'));
	await assert.rejects(authorize(missing));
	await assert.rejects(readFile(join(missing, 'checkout/candidate')), { code: 'ENOENT' });
	await assert.rejects(shell(), /bridge authorization failed/);
	await assert.rejects(readFile(trace), { code: 'ENOENT' });
	await note(keys.privateKey);
	const invalid = await mkdtemp(join(root, 'invalid-'));
	await assert.rejects(authorize(invalid), /signature/);
	await assert.rejects(readFile(join(invalid, 'checkout/candidate')), { code: 'ENOENT' });
	await assert.rejects(shell(), /bridge authorization failed/);
	await assert.rejects(readFile(trace), { code: 'ENOENT' });
	await note(delegate.privateKey);
	const valid = await mkdtemp(join(root, 'valid-'));
	await authorize(valid);
	assert.equal(await readFile(join(valid, 'checkout/candidate'), 'utf8'), 'candidate source');
	await mkdir(join(valid, 'checkout/out'));
	await assert.rejects(exec(process.execPath, [verifier, 'verify-built', valid, incumbent, origin, 'v2']),
		/unexpected runtime inventory entry/);
});
