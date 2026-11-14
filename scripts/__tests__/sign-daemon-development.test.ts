import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { once } from 'node:events';
import { sha256 } from '../daemon-bundle-metadata.mjs';
import { developmentPolicySigningBytes, verifyDevelopmentManifest } from '../daemon-development-metadata.mjs';
import { measureBundleRuntime } from '../stage-daemon-bundle.mjs';
import { developmentHandoffSigningBytes, developmentQualificationSigningBytes, signDevelopmentCandidate } from '../sign-daemon-development.mjs';
import { closeGraphStore, getGraphStore, SCHEMA_VERSION, setGraphStorePath } from '../../src/db/graph/store.js';
import { verifyQuiescedReleaseStores } from '../../src/daemon/release-compatibility.js';
import { observeDevelopmentReopen } from '../qualify-daemon-development.mjs';

test('development signer binds the authenticated archive, sequence and exact qualified predecessor', async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'insrc-development-signer-')));
	try {
		const issuer = generateKeyPairSync('ed25519');
		const builder = generateKeyPairSync('ed25519');
		const qualifier = generateKeyPairSync('ed25519');
		const pem = issuer.publicKey.export({ type: 'spki', format: 'pem' });
		const repository = 'https://github.com/example/daemon.git';
		const sourceRef = 'refs/heads/preview';
		const policyBytes = Buffer.from(JSON.stringify({ repository, releaseRef: 'refs/heads/main', developmentRefs: [sourceRef] }));
		const ledgerDirectory = join(root, 'ledger');
		await mkdir(ledgerDirectory, { mode: 0o700 });
		const compatibility = { graphSchema: SCHEMA_VERSION, formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' } };
		const payload = join(root, 'payload');
		await mkdir(join(payload, 'tools'), { recursive: true, mode: 0o700 });
		await mkdir(join(payload, 'out'), { mode: 0o700 });
		await mkdir(join(payload, 'out/daemon'), { mode: 0o700 });
		await writeFile(join(payload, 'tools/node'), 'fixture', { mode: 0o700 });
		await writeFile(join(payload, 'out/daemon/index.js'), 'fixture', { mode: 0o600 });
		const handoff = async (label: string, sourceCommit: string) => {
			const directory = join(root, label);
			await mkdir(directory);
			const version = '1.0.0-dev.1';
			const archiveName = `insrc-daemon-${version}-darwin-arm64.tar.gz`;
			await writeFile(join(payload, 'out/release-compatibility.json'), JSON.stringify({
				version: 1, releaseId: sourceCommit, startup: 'rollback-compatible', ...compatibility,
			}), { mode: 0o600 });
			execFileSync('/usr/bin/tar', ['--format', 'ustar', '-czf', join(directory, archiveName), '-C', payload, 'tools', 'out']);
			const archive = await readFile(join(directory, archiveName));
			const candidate = { schemaVersion: 1, channel: 'development', repository, sourceRef, fetchedTip: sourceCommit,
				commit: sourceCommit, version, target: 'darwin-arm64', minimumMacOS: '15.0', nodeVersion: '22.22.1', archiveName,
				archiveBytes: archive.length, archiveSha256: sha256(archive), runtimeFingerprint: await measureBundleRuntime(payload) };
			const bytes = Buffer.from(JSON.stringify(candidate));
			await writeFile(join(directory, 'candidate.json'), bytes);
			await writeFile(join(directory, 'candidate.sig'), sign(null, developmentHandoffSigningBytes(bytes), builder.privateKey));
			return { directory, candidate };
		};
		const first = await handoff('first', 'a'.repeat(40));
		const next = await handoff('next', 'b'.repeat(40));
		const common = { ledgerDirectory, key: issuer.privateKey.export({ type: 'pkcs8', format: 'pem' }),
			builderKey: builder.publicKey.export({ type: 'spki', format: 'pem' }), policyBytes,
			policySignature: sign(null, developmentPolicySigningBytes(policyBytes), issuer.privateKey), compatibility };
		const prior = await signDevelopmentCandidate({ ...common, directory: first.directory, sequence: 1 });
		assert.deepEqual(await signDevelopmentCandidate({ ...common, directory: first.directory, sequence: 1 }), prior);
		await assert.rejects(signDevelopmentCandidate({ ...common, directory: next.directory, sequence: 1 }), /conflicting.*record/);
		await assert.rejects(signDevelopmentCandidate({ ...common, directory: next.directory, sequence: 3 }), /ENOENT/);
		await assert.rejects(signDevelopmentCandidate({ ...common, builderKey: pem, directory: next.directory, sequence: 2 }), /handoff signature/);
		const statePath = join(root, 'graph.lmdb');
		await mkdir(join(root, 'lance'));
		setGraphStorePath(statePath);
		await (await getGraphStore()).meta.put('development-test-prior', 'prior');
		await closeGraphStore();
		const store = new URL('../../src/db/graph/store.ts', import.meta.url).href;
		const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
			import { getGraphStore, setGraphStorePath } from ${JSON.stringify(store)};
			setGraphStorePath(process.argv[1]);
			const graph = await getGraphStore();
			await graph.meta.put('development-test-candidate', 'candidate');
			process.stdout.write('write persisted');
			setInterval(() => {}, 1000);
		`, statePath], { stdio: ['ignore', 'pipe', 'inherit'] });
		const exited = once(child, 'exit');
		let candidateWriteObserved = false;
		try {
			const [event] = await once(child.stdout!, 'data', { signal: AbortSignal.timeout(5000) });
			candidateWriteObserved = event.toString() === 'write persisted';
		} finally {
			child.kill('SIGKILL');
		}
		const [, exitSignal] = await exited;
		const pair = {
			prior: { version: 1 as const, releaseId: first.candidate.commit, startup: 'rollback-compatible' as const, ...compatibility },
			candidate: { version: 1 as const, releaseId: next.candidate.commit, startup: 'rollback-compatible' as const, ...compatibility },
		};
		await verifyQuiescedReleaseStores(root, pair);
		const graph = await getGraphStore();
		const predecessorReopened = graph.meta.get('development-test-prior') === 'prior' &&
			graph.meta.get('development-test-candidate') === 'candidate';
		assert.equal(predecessorReopened, true);
		await closeGraphStore();
		const record = { schemaVersion: 1, predecessorManifestSha256: sha256(prior.bytes),
			predecessorRuntimeFingerprint: first.candidate.runtimeFingerprint, candidateCommit: next.candidate.commit,
			candidateArchiveSha256: next.candidate.archiveSha256, candidateRuntimeFingerprint: next.candidate.runtimeFingerprint,
			predecessorCompatibility: compatibility, candidateCompatibility: compatibility,
			launchProfile: 'managed', candidateWriteObserved, candidateInterrupted: exitSignal === 'SIGKILL', predecessorReopened };
		const upgrade = { ...common, directory: next.directory, sequence: 2, prior,
			qualificationKey: qualifier.publicKey.export({ type: 'spki', format: 'pem' }) };
		const attest = (value: typeof record) => {
			const evidence = Buffer.from(JSON.stringify(value));
			return { evidence, evidenceSignature: sign(null, developmentQualificationSigningBytes(evidence), qualifier.privateKey) };
		};
		const qualification = attest(record);
		await assert.rejects(signDevelopmentCandidate({ ...upgrade, ...qualification, evidenceSignature: Buffer.alloc(64) }), /qualification signature/);
		await assert.rejects(signDevelopmentCandidate({ ...upgrade, ...attest({ ...record, predecessorReopened: false }) }), /crash-reopen/);
		await assert.rejects(signDevelopmentCandidate({ ...upgrade, ...qualification, compatibility: { ...compatibility, graphSchema: 2 } }), /writable formats/);
		const signed = await signDevelopmentCandidate({ ...upgrade, ...qualification });
		const { manifest } = verifyDevelopmentManifest(signed.bytes, signed.signature, pem);
		assert.equal(manifest.predecessor?.manifestSha256, sha256(prior.bytes));
		assert.equal(manifest.predecessor?.qualificationEvidenceSha256, sha256(qualification.evidence));
	} finally {
		await closeGraphStore();
		await rm(root, { recursive: true, force: true });
	}
});

test('qualification invokes both release roots and rejects a predecessor that cannot reopen', async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'insrc-qualification-probe-')));
	try {
		const runtime = await realpath(process.execPath);
		const makeRelease = async (name: string, denyReopen: boolean) => {
			const release = join(root, name);
			await mkdir(join(release, 'out/db/graph'), { recursive: true });
			await writeFile(join(release, 'package.json'), '{"type":"module"}');
			await writeFile(join(release, 'out/db/graph/store.js'), `
				import { existsSync, readFileSync, writeFileSync } from 'node:fs';
				export const SCHEMA_VERSION = 1;
				let path;
				export function setGraphStorePath(value) { path = value; }
				export async function closeGraphStore() {}
				export async function getGraphStore() {
					const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
					if (${denyReopen} && state['development-qualification-candidate']) throw new Error('cannot reopen');
					return { meta: { get: key => state[key], async put(key, value) {
						state[key] = value;
						writeFileSync(path, JSON.stringify(state));
					} } };
				}
			`);
			return { root: release, runtime };
		};
		const prior = await makeRelease('prior', false);
		const candidate = await makeRelease('candidate', false);
		await observeDevelopmentReopen(prior, candidate, join(root, 'pass'), 1);
		const incompatible = await makeRelease('incompatible-prior', true);
		await assert.rejects(observeDevelopmentReopen(incompatible, candidate, join(root, 'fail'), 1), /cannot reopen/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
