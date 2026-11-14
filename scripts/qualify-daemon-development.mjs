/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync, spawn } from 'node:child_process';
import { createPublicKey, verify } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { requireBundleCompatibility, sha256 } from './daemon-bundle-metadata.mjs';
import { verifyDevelopmentManifest } from './daemon-development-metadata.mjs';
import { developmentHandoffSigningBytes } from './sign-daemon-development.mjs';
import { stageVerifiedBundle } from './stage-daemon-bundle.mjs';
import { readBoundedRegular } from './verify-daemon-bundle.mjs';

const limit = 64 * 1024;
const read = file => readBoundedRegular(file, limit);

async function releaseDeclaration(release, commit) {
	const { version, releaseId, startup, ...compatibility } = JSON.parse(await read(join(release.root, 'out/release-compatibility.json')));
	if (version !== 1 || releaseId !== commit || startup !== 'rollback-compatible') throw new Error('invalid measured release declaration');
	requireBundleCompatibility(compatibility);
	return compatibility;
}

function probe(release, state, phase, graphSchema) {
	const store = pathToFileURL(join(release.root, 'out/db/graph/store.js')).href;
	return ['--input-type=module', '-e', `
		import { getGraphStore, closeGraphStore, SCHEMA_VERSION, setGraphStorePath } from ${JSON.stringify(store)};
		if (SCHEMA_VERSION !== Number(process.argv[3])) throw new Error('compiled graph schema differs from declaration');
		setGraphStorePath(process.argv[1]);
		const graph = await getGraphStore();
		switch (process.argv[2]) {
			case 'seed': await graph.meta.put('development-qualification-prior', 'prior'); break;
			case 'write':
				if (graph.meta.get('development-qualification-prior') !== 'prior') throw new Error('prior state unavailable');
				await graph.meta.put('development-qualification-candidate', 'candidate');
				process.stdout.write('development qualification write persisted\\n');
				setInterval(() => {}, 1000);
				break;
			case 'reopen':
				if (graph.meta.get('development-qualification-prior') !== 'prior' ||
				    graph.meta.get('development-qualification-candidate') !== 'candidate') throw new Error('rollback state unavailable');
				break;
		}
		if (process.argv[2] !== 'write') await closeGraphStore();
	`, state, phase, String(graphSchema)];
}

export async function observeDevelopmentReopen(prior, candidate, state, graphSchema) {
	const env = { ...process.env };
	delete env.NODE_OPTIONS;
	delete env.NODE_PATH;
	execFileSync(prior.runtime, probe(prior, state, 'seed', graphSchema), { env, timeout: 15_000 });
	const child = spawn(candidate.runtime, probe(candidate, state, 'write', graphSchema), { env, stdio: ['ignore', 'pipe', 'inherit'] });
	const exited = once(child, 'exit');
	// Attach an error handler even if the writer fails before emitting any output.
	void exited.catch(() => {});
	let observed = '';
	try {
		const timeout = AbortSignal.timeout(15_000);
		while (!observed.includes('development qualification write persisted\n')) {
			const chunk = await Promise.race([
				once(child.stdout, 'data', { signal: timeout }),
				exited.then(() => { throw new Error('candidate exited before persisting the qualification write'); }),
			]);
			observed = (observed + chunk[0].toString()).slice(-8192);
		}
	} finally {
		child.kill('SIGKILL');
		await exited.catch(() => {});
	}
	const [, signal] = await exited;
	if (signal !== 'SIGKILL') throw new Error('candidate interruption was not observed');
	execFileSync(prior.runtime, probe(prior, state, 'reopen', graphSchema), { env, timeout: 15_000 });
}

async function main([priorDir, candidateDir, issuerKey, builderKey, output, ...extra]) {
	if (!priorDir || !candidateDir || !issuerKey || !builderKey || !output || extra.length ||
		process.platform !== 'darwin' || process.arch !== 'arm64') {
		throw new Error('usage on a dedicated Apple Silicon VM: qualify-daemon-development.mjs PRIOR CANDIDATE ISSUER_PUB BUILDER_PUB EVIDENCE');
	}
	const priorProof = verifyDevelopmentManifest(await read(join(priorDir, 'manifest.json')),
		await readBoundedRegular(join(priorDir, 'manifest.development.sig'), 64), await read(issuerKey));
	const candidateBytes = await read(join(candidateDir, 'candidate.json'));
	const builder = createPublicKey(await read(builderKey));
	const handoff = await readBoundedRegular(join(candidateDir, 'candidate.sig'), 64);
	if (builder.asymmetricKeyType !== 'ed25519' || handoff.length !== 64 ||
		!verify(null, developmentHandoffSigningBytes(candidateBytes), builder, handoff)) {
		throw new Error('candidate builder handoff signature failed');
	}
	const manifest = JSON.parse(candidateBytes);
	if (manifest.repository !== priorProof.manifest.repository || manifest.commit === priorProof.manifest.commit ||
		manifest.target !== 'darwin-arm64' || manifest.nodeVersion !== '22.22.1' ||
		!/^insrc-daemon-[0-9]+\.[0-9]+\.[0-9]+-dev\.[1-9][0-9]*-darwin-arm64\.tar\.gz$/.test(manifest.archiveName) ||
		!/^[a-f0-9]{64}$/.test(manifest.runtimeFingerprint)) throw new Error('invalid candidate qualification identity');
	const root = await realpath(await mkdtemp(join(tmpdir(), 'insrc-development-qualification-')));
	try {
		const prior = await stageVerifiedBundle(join(priorDir, priorProof.manifest.archiveName), priorProof.manifest, root, priorProof.manifestSha256);
		const candidate = await stageVerifiedBundle(join(candidateDir, manifest.archiveName), manifest, root, sha256(candidateBytes));
		const predecessorCompatibility = await releaseDeclaration(prior, priorProof.manifest.commit);
		const candidateCompatibility = await releaseDeclaration(candidate, manifest.commit);
		if (!isDeepStrictEqual(predecessorCompatibility, priorProof.manifest.compatibility) ||
			!isDeepStrictEqual(predecessorCompatibility, candidateCompatibility)) throw new Error('measured writable formats differ');
		await observeDevelopmentReopen(prior, candidate, join(root, 'graph.lmdb'), candidateCompatibility.graphSchema);
		const evidence = Buffer.from(JSON.stringify({
			schemaVersion: 1, predecessorManifestSha256: priorProof.manifestSha256, predecessorRuntimeFingerprint: prior.fingerprint,
			candidateCommit: manifest.commit, candidateArchiveSha256: manifest.archiveSha256, candidateRuntimeFingerprint: candidate.fingerprint,
			predecessorCompatibility, candidateCompatibility, launchProfile: 'managed',
			candidateWriteObserved: true, candidateInterrupted: true, predecessorReopened: true,
		}));
		await writeFile(output, evidence, { flag: 'wx', mode: 0o600 });
	} finally { await rm(root, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(await realpath(process.argv[1])).href === import.meta.url) await main(process.argv.slice(2));
