/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { inspectSourcePredecessor, prepareSourcePredecessor, sourceRecoveryGuidance } from '../daemon/source-predecessor.js';
import { readSourceInstallationSelector } from '../shared/source-installation.js';
import { resolveOwnedToolchain } from '../shared/owned-node-runtime.js';
import { readSourceReleaseTarget } from '../shared/source-release-target.js';
import { checkUpdateSource } from '../shared/update-source.js';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

async function main(): Promise<void> {
	const [mode, ...args] = process.argv.slice(2);
	if (mode === 'inspect') {
		const [stateRoot, installationRoot, runtime] = args;
		if (!stateRoot || !installationRoot || !runtime || args.length !== 3) throw new Error('usage: inspect STATE_ROOT INSTALLATION_ROOT INCUMBENT_RUNTIME');
		const selected = readSourceInstallationSelector(stateRoot, installationRoot);
		const root = selected?.pin.root ?? installationRoot;
		const guidance = sourceRecoveryGuidance(stateRoot, installationRoot, process.execPath);
		try {
			const inventory = await inspectSourcePredecessor({ root, runtime, knownBuild: selected?.pin });
			process.stdout.write(JSON.stringify({ inventory, activationPermitted: false, guidance }) + '\n');
		} catch (error) {
			process.stdout.write(JSON.stringify({ decision: 'recovery-required', activationPermitted: false, guidance,
				reason: `Inventory unavailable; retain incumbent files and data: ${error instanceof Error ? error.message : String(error)}` }) + '\n');
			process.exitCode = 4;
		}
		return;
	}
	if (mode !== 'prepare' || (args.length !== 1 && !(args.length === 2 && args[1] === '--rebuild-predecessor'))) {
		throw new Error('usage: prepare REQUEST_JSON [--rebuild-predecessor]');
	}
	const file = await open(args[0]!, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	let request: Record<string, unknown>;
	try {
		const info = await file.stat();
		if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > 64 * 1024) throw new Error('recovery request must be bounded, private and owned');
		const bytes = Buffer.alloc(info.size + 1), { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
		const after = await file.stat(), current = await lstat(args[0]!);
		if (bytesRead !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs
			|| current.dev !== info.dev || current.ino !== info.ino) throw new Error('recovery request changed while reading');
		const value: unknown = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid recovery request');
		request = value as Record<string, unknown>;
	} finally { await file.close(); }
	const required = ['stateRoot', 'installationRoot', 'incumbentRuntime', 'verifier', 'repoUrl', 'branch', 'priorCommit', 'launchProfile'];
	if (Object.keys(request).some(key => ![...required, 'target'].includes(key))
		|| required.some(key => typeof request[key] !== 'string' || !request[key])) throw new Error('invalid recovery request fields');
	const stateRoot = request.stateRoot as string, installationRoot = request.installationRoot as string;
	const selected = readSourceInstallationSelector(stateRoot, installationRoot);
	const root = selected?.pin.root ?? installationRoot;
	if (selected) await resolveOwnedToolchain(root, stateRoot); // Runtime records alone are never executable authority.
	const source = checkUpdateSource({ repoUrl: request.repoUrl as string, branch: request.branch as string });
	const result = await prepareSourcePredecessor({ stateRoot, runtime: process.execPath,
		verifier: request.verifier as string, priorCommit: request.priorCommit as string,
		source: { repoUrl: source.repoUrl!, branch: source.branch! }, launchProfile: request.launchProfile as string,
		target: readSourceReleaseTarget(request.target ?? (process.platform === 'darwin' ? 'darwin' : `${process.platform}-${process.arch}`)) },
		{ root, runtime: request.incumbentRuntime as string, knownBuild: selected?.pin },
		{ bootstrapRoot: packageRoot, rebuildPredecessor: args[1] === '--rebuild-predecessor' });
	process.stdout.write(JSON.stringify({ ...result, activationPermitted: false }) + '\n');
	if (result.decision === 'recovery-required') process.exitCode = 4;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main().catch(error => { process.stderr.write(`source recovery: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 4; });
}
