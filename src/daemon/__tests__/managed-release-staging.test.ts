/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { once } from 'node:events';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { open } from 'lmdb';
import { accepted, ManagedDaemonControl, openManagedSupervisorLink } from '../../cli/services/managed-daemon-control.js';
import { InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import { releaseMetadataDigest, releaseSignatureFrame } from '../../shared/managed-release-trust.js';
import { rpc } from '../../shared/ipc-client.js';
import { installFreshSelectorMember, inspectManagedJob, installationPaths, readInstallationSelector, registerManagedJob, removeManagedJob } from '../../shared/managed-daemon-installation.js';
import { retainManagedReleaseVerifier } from '../managed-update-preparation.js';
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

async function fixture(t: TestContext, supervisor?: string, programs?: { daemon: string; controller: string; updater: string }) {
	const scratch = await realpath(await mkdtemp(join(supervisor === undefined ? tmpdir() : '/tmp', 'insrc-release-stage-')));
	t.after(() => rm(scratch, { recursive: true, force: true }));
	const stateRoot = supervisor === undefined ? scratch : join(scratch, '.insrc');
	if (stateRoot !== scratch) await mkdir(stateRoot);
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
			`await writeFile('out/daemon/index.js', ${JSON.stringify(programs?.daemon ?? 'process.stdout.write("candidate daemon");')});`,
			`await writeFile('out/bin/insrc-daemon-supervisor.js', ${JSON.stringify(supervisor ?? 'process.stdout.write("candidate supervisor");')});`,
			...(programs === undefined ? [] : [
				`await writeFile('out/bin/insrc-daemon-control.js', ${JSON.stringify(programs.controller)});`,
				`await writeFile('out/bin/insrc-daemon-update.js', ${JSON.stringify(programs.updater)});`,
			]),
		].join('\n'),
		'version.txt': 'prior',
		'.npmrc': '',
		'scripts/fixture': 'fixture',
	};
	await mkdir(join(repoUrl, 'scripts'));
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
		if (supervisor !== undefined) {
			await mkdir(join(root, 'out/bin'));
			await writeFile(join(root, 'out/bin/insrc-daemon-supervisor.js'), supervisor);
		}
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
	return { options, entry, dependency, old, qualifiedOld, priorCommit, priorFingerprint, priorDependency, scratch };
}

async function makeTestReleaseAuthority(f: Awaited<ReturnType<typeof fixture>>) {
	const { stateRoot, runtime, source } = f.options;
	const root = generateKeyPairSync('ed25519');
	const signer = generateKeyPairSync('ed25519');
	const keyFile = join(f.scratch, 'fixture-root.pem');
	const installer = join(f.scratch, 'installer.sh');
	const bundle = fileURLToPath(new URL('../../../scripts/bundle-release-bootstrap.mjs', import.meta.url));
	await writeFile(keyFile, root.publicKey.export({ format: 'pem', type: 'spki' }));
	await promisify(execFile)(runtime, [bundle, keyFile, installer]);
	const verifier = join(f.scratch, 'verifier.mjs');
	const packaged = await readFile(installer, 'utf8');
	const base64 = packaged.match(/^INSRC_RELEASE_BOOTSTRAP_B64='([^']+)'$/m)?.[1];
	assert.ok(base64);
	await writeFile(verifier, Buffer.from(base64, 'base64'), { mode: 0o600 });
	const env = { ...process.env, HOME: f.scratch, PATH: `${dirname(runtime)}:${process.env['PATH'] ?? '/usr/bin:/bin'}` };

	async function inventory(root: string) {
		const entries: [string, number, string | null][] = [];
		async function visit(path: string, name: string): Promise<void> {
			const info = await lstat(path);
			entries.push([name, info.mode, info.isDirectory() ? null : info.isSymbolicLink() ? await readlink(path)
				: releaseMetadataDigest(await readFile(path))]);
			if (info.isDirectory()) {
				for (const child of await readdir(path)) await visit(join(path, child), `${name}/${child}`);
			}
		}
		await visit(runtime, 'node-runtime');
		for (const name of ['out', 'node_modules', 'scripts', 'package.json', 'package-lock.json', '.npmrc', 'packages/project-memory']) {
			await visit(join(root, name), name);
		}
		return Buffer.from(JSON.stringify(entries));
	}

	function envelope(domain: Parameters<typeof releaseSignatureFrame>[0], key: KeyObject, value: unknown): string {
		const payload = Buffer.from(JSON.stringify(value));
		return JSON.stringify({ payload: payload.toString('base64'),
			signature: sign(null, releaseSignatureFrame(domain, payload), key).toString('base64') });
	}

	let epoch = 0;
	async function publish(prior: ReleaseCompatibility, candidate: ReleaseCompatibility, independentPrior: string) {
		const built = await mkdtemp(join(f.scratch, 'reference-'));
		git(f.scratch, 'clone', '-q', '--no-local', '--', source.repoUrl, built);
		await promisify(execFile)('npm', ['ci', '--no-fund', '--no-audit'], { cwd: built, env, timeout: 20_000 });
		await promisify(execFile)('npm', ['run', 'build'], { cwd: built, env, timeout: 20_000 });
		await writeFile(join(built, 'out/release-compatibility.json'), JSON.stringify(candidate) + '\n', { mode: 0o600 });
		const priorInventory = await inventory(independentPrior);
		const candidateInventory = await inventory(built);
		const referenceDigest = releaseMetadataDigest(Buffer.from(JSON.stringify([
			releaseMetadataDigest(priorInventory), releaseMetadataDigest(candidateInventory),
		])));
		const compatibility = Buffer.from(JSON.stringify({ prior, candidate }));
		const window = { notBefore: Date.now() - 10_000, expiresAt: Date.now() + 300_000 };
		const keyId = 'disposable-staging-authority';
		const trust = envelope('release-trust', root.privateKey, { version: 1, epoch: ++epoch, ...window, revoked: [],
			keys: [{ id: keyId, publicKey: signer.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
				channel: source, ...window }] });
		const qualification = envelope('release-qualification', signer.privateKey, {
			version: 1, keyId, channel: source, priorCommit: prior.releaseId, candidateCommit: candidate.releaseId,
			priorTree: git(source.repoUrl, 'rev-parse', `${prior.releaseId}^{tree}`),
			candidateTree: git(source.repoUrl, 'rev-parse', `${candidate.releaseId}^{tree}`),
			profile: 'darwin-disposable-fixture', referenceDigest, compatibilityDigest: releaseMetadataDigest(compatibility),
			testEvidenceDigest: 'a'.repeat(64), ...window,
		});
		git(source.repoUrl, 'notes', '--ref=insrc-release-trust', 'add', '-m', trust, candidate.releaseId);
		git(source.repoUrl, 'notes', '--ref=insrc-daemon-updates', 'add', '-m', JSON.stringify({
			keyId, qualification: Buffer.from(qualification).toString('base64'), priorInventory: priorInventory.toString('base64'),
			candidateInventory: candidateInventory.toString('base64'), compatibility: compatibility.toString('base64'),
		}), candidate.releaseId);
		return built;
	}
	return { installer, publish, retain: () => retainManagedReleaseVerifier(stateRoot, verifier) };
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

test('The stopped installed controller fetches and commits a qualified update without daemon IPC', {
	skip: process.platform !== 'darwin' || (process.getuid?.() ?? 0) === 0, timeout: 120_000,
}, async t => {
	const supervisor = `
import { register } from ${JSON.stringify(import.meta.resolve('tsx/esm/api'))};
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
register();
const { listenForSupervisorControllers } = await import(${JSON.stringify(new URL('../supervisor-socket.ts', import.meta.url).href)});
const root = process.argv[2];
const directory = join(root, 'managed-lifecycle');
const selected = JSON.parse(await readFile(join(directory, 'installation.json'), 'utf8'));
await listenForSupervisorControllers(join(directory, 'control.sock'), { installationRoot: root, releaseId: selected.releaseId }, {
  async controller(request) {
    if (request.op !== 'status') throw new Error('stopped update must not send a start or stop request');
    return { v: request.v, id: request.id, ok: true, generation: null, state: 'idle' };
  },
});

`;
	const f = await fixture(t, supervisor);
	const { stateRoot, runtime, source, qualification } = f.options;
	const gate = new InstallationMutationGate(stateRoot);
	await gate.read();
	const paths = installationPaths(stateRoot);
	const authority = await makeTestReleaseAuthority(f);
	await authority.publish(profile(f.priorCommit), qualification.candidate, f.qualifiedOld);
	await authority.retain();
	const graph = open({ path: join(stateRoot, 'graph.lmdb'), noSubdir: true, maxDbs: 32 });
	graph.openDB({ name: 'meta', keyEncoding: 'ordered-binary' }).putSync('schema_version', 10);
	await graph.close();
	await mkdir(join(stateRoot, 'lance'));
	const prior = { version: 1 as const, stateRoot, runtime, releaseId: f.priorCommit, releaseRoot: f.old,
		enabled: true, pathEnv: process.env['PATH'] ?? '/usr/bin:/bin' };
	const id = 'c842126b-7fd6-446d-b529-b043e5ea77e1';
	await installFreshSelectorMember(prior, 'descriptor', id, async () => {});
	await installFreshSelectorMember(prior, 'manifest', id, async () => {});
	try {
		await registerManagedJob(prior, async () => {});
		for (let attempt = 0;; attempt++) {
			try { (await openManagedSupervisorLink(prior)).close(); break; }
			catch (error) { if (attempt >= 30) throw error; await delay(100); }
		}
		await assert.rejects(readFile(paths.daemonPid), { code: 'ENOENT' });
		const controller = fileURLToPath(new URL('../../bin/insrc-daemon-control.ts', import.meta.url));
		const result = await promisify(execFile)(runtime, ['--import', 'tsx', controller, 'update-local'], {
			env: { ...process.env, HOME: f.scratch, INSRC_DAEMON_ROOT: f.old }, timeout: 95_000,
		});
		assert.match(result.stdout, /committed/);
		const selected = await readInstallationSelector(stateRoot);
		assert.equal(selected?.releaseId, qualification.candidate.releaseId);
		assert.ok(selected?.enabled);
		const link = await openManagedSupervisorLink(selected);
		try { assert.equal(accepted(await link.call({ op: 'status', generation: null })).state, 'idle'); }
		finally { link.close(); }
		await assert.rejects(readFile(paths.daemonPid), { code: 'ENOENT' });
		assert.equal((await gate.read()).outcome?.decision, 'committed');
	} finally {
		const selected = await readInstallationSelector(stateRoot);
		if (selected !== undefined && await inspectManagedJob(selected) !== undefined) await removeManagedJob(selected, async () => {});
	}
});

test('First supported update of a qualified prior build with broker denial', {
	skip: process.platform !== 'darwin' || (process.getuid?.() ?? 0) === 0, timeout: 210_000,
}, async t => {
	const loader = JSON.stringify(import.meta.resolve('tsx/esm/api'));
	const url = (path: string) => JSON.stringify(new URL(path, import.meta.url).href);
	const program = (path: string) => `import { register } from ${loader};\nregister();\nawait import(${url(path)});\n`;
	const supervisor = program('../../bin/insrc-daemon-supervisor.ts');
	const controller = program('../../bin/insrc-daemon-control.ts');
	const updater = program('../../bin/insrc-daemon-update.ts');
	const candidateDaemon = `
import { register } from ${loader};
import { fileURLToPath } from 'node:url';
register();
const { ManagedDaemonLifecycle } = await import(${url('../managed-daemon-lifecycle.ts')});
const { daemonRunFiles } = await import(${url('../run-file-ownership.ts')});
const { PATHS } = await import(${url('../../shared/paths.ts')});
const { IpcServer, directDispatch } = await import(${url('../server.ts')});
const { launchManagedUpdate } = await import(${url('../managed-update-launch.ts')});
const managed = ManagedDaemonLifecycle.open();
const lease = await managed.borrow(daemonRunFiles, PATHS.daemonRunGuard);
daemonRunFiles.writePid();
const server = new IpcServer(directDispatch({
  'daemon.status': async () => ({ pid: process.pid }),
  'daemon.update': async (_params, context) => launchManagedUpdate(fileURLToPath(new URL('../bin/insrc-daemon-update.js', import.meta.url)), [], context.awaitUpdateReply),
}));
await server.listen();
await lease.returnGrant();
managed.setShutdownHandler(async () => { await managed.watchdog(); process.exit(0); });
await managed.ready();
`;
	const f = await fixture(t, supervisor, { daemon: candidateDaemon, controller, updater });
	const { stateRoot, runtime, source, qualification } = f.options;
	const paths = installationPaths(stateRoot);
	const broker = join(f.scratch, 'denied-broker');
	await writeFile(broker, '#!/bin/sh\nprintf "ERROR denied 1\\n"\n', { mode: 0o700 });
	const watchdog = join(f.scratch, 'watchdog.mjs');
	await writeFile(watchdog, program('../../bin/insrc-shutdown-watchdog.ts'));
	const predecessor = `
import { register } from ${loader};
import { createServer } from 'node:net';
import { writeFileSync } from 'node:fs';
register();
const { armShutdownWatchdog } = await import(${url('../shutdown-watchdog.ts')});
const { PATHS } = await import(${url('../../shared/paths.ts')});
writeFileSync(PATHS.pidFile, String(process.pid));
createServer(connection => {
  connection.on('error', () => {});
  connection.on('data', async raw => {
    if (JSON.parse(raw.toString()).method !== 'daemon.shutdown') return;
    try {
      const result = await armShutdownWatchdog({ timeoutMs: 10000, readyTimeoutMs: 5000,
        helperPath: ${JSON.stringify(watchdog)}, brokerPath: ${JSON.stringify(broker)}, logPath: PATHS.daemonLog });
      result.disarm();
      process.exit(70);
    } catch { process.kill(process.pid, 'SIGKILL'); }
  });
}).listen(PATHS.sockFile, () => console.log('ready'));
`;
	await writeFile(f.entry, predecessor);
	await writeFile(join(f.qualifiedOld, 'out/daemon/index.js'), predecessor);
	const authority = await makeTestReleaseAuthority(f);
	const independentlyBuilt = await authority.publish(profile(f.priorCommit), qualification.candidate, f.qualifiedOld);
	const graphPath = join(stateRoot, 'graph.lmdb');
	const graph = open({ path: graphPath, noSubdir: true, maxDbs: 32 });
	const meta = graph.openDB({ name: 'meta', keyEncoding: 'ordered-binary' });
	meta.putSync('schema_version', 10);
	meta.putSync('fixture_record', 'survives');
	await graph.close();
	await mkdir(join(stateRoot, 'lance'));
	const config = join(stateRoot, 'config.json');
	await writeFile(config, JSON.stringify({ daemonUpdate: source, fixture: 'preserved' }));
	const env = { ...process.env, HOME: f.scratch, PATH: `${dirname(runtime)}:${process.env['PATH'] ?? '/usr/bin:/bin'}` };
	const old = spawn(runtime, [f.entry], { env, cwd: f.old, stdio: ['ignore', 'pipe', 'inherit'] });
	const exited = once(old, 'exit');
	const gate = new InstallationMutationGate(stateRoot);
	let verified = false;
	try {
		const [ready] = await Promise.race([once(old.stdout, 'data'), exited]);
		assert.match(String(ready), /ready/);
		const result = await promisify(execFile)('/bin/bash', [authority.installer, '--target', f.old, '--repo', source.repoUrl, '--branch', source.branch, '-y'],
			{ env, cwd: f.scratch, timeout: 105_000 }).catch((error: Error & { stdout?: string }) => {
			t.diagnostic(error.stdout ?? '');
			throw error;
		});
		assert.match(result.stdout, /committed/);
		assert.deepEqual(await exited, [null, 'SIGKILL']);
		const selected = await readInstallationSelector(stateRoot);
		assert.equal(selected?.releaseId, qualification.candidate.releaseId);
		assert.ok(selected?.enabled);
		const link = await openManagedSupervisorLink(selected);
		try { assert.equal(accepted(await link.call({ op: 'status', generation: null })).state, 'running'); }
		finally { link.close(); }
		const log = await readFile('/tmp/.insrc/daemon.log', 'utf8');
		assert.ok(log.split('\n').some(line => line.includes(`"pid":${old.pid}`)
			&& line.includes('broker capture failed: process capability broker refused: denied (errno 1)')));
		assert.equal((await gate.read()).outcome?.decision, 'committed');
		assert.equal(JSON.parse(await readFile(config, 'utf8')).fixture, 'preserved');
		const inspect = open({ path: graphPath, readOnly: true, maxDbs: 32 });
		try { assert.equal(inspect.openDB({ name: 'meta', keyEncoding: 'ordered-binary' }).get('fixture_record'), 'survives'); }
		finally { await inspect.close(); }
		assert.equal(Number((await readFile(paths.daemonPid, 'utf8')).trim()) === old.pid, false);
		await writeFile(join(source.repoUrl, 'version.txt'), 'subsequent managed update');
		git(source.repoUrl, 'commit', '-qam', 'subsequent managed update');
		const next = profile(git(source.repoUrl, 'rev-parse', 'HEAD'));
		await authority.publish(qualification.candidate, next, independentlyBuilt);
		const ack = await rpc<{ launched: boolean; updateId: string }>('daemon.update', {}, () => createConnection(paths.daemonSocket), { timeoutMs: 20_000 });
		assert.equal(ack.launched, true);
		const deadline = performance.now() + 80_000;
		for (;;) {
			const { active, outcome } = await gate.read();
			if (outcome?.id === ack.updateId) {
				assert.equal(outcome.decision, 'committed', outcome.detail);
				if (active === null) break;
			}
			assert.ok(performance.now() < deadline, `running managed update did not settle: ${active?.entries.at(-1)?.step ?? 'preparation'}`);
			await delay(100);
		}
		assert.equal((await readInstallationSelector(stateRoot))?.releaseId, next.releaseId);
		verified = true;
	} finally {
		if (old.exitCode === null && old.signalCode === null) old.kill();
		await exited;
		const selected = await readInstallationSelector(stateRoot);
		if (selected?.enabled && await inspectManagedJob(selected) !== undefined) {
			try {
				await new ManagedDaemonControl(selected).run('stop', 5_000);
				await removeManagedJob(selected, async () => {});
			} catch (error) {
				if (verified) throw error;
				t.diagnostic(`Managed fixture cleanup failed: ${String(error)}`);
			}
		}
	}
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
