import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { acquireRunFileGuard, removeOwnedRunFile, runFileGuardConflict, runFileIdentity } from '../daemon-run-files.js';
import type { RunFileGuard } from '../daemon-run-files.js';
import type { ProcessIdentity, ProcessIdentityReader } from '../daemon-process.js';
import { PATHS } from '../paths.js';

let dir: string;
const children: ChildProcess[] = [];
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'insrc-run-files-')); });
afterEach(() => { for (const child of children.splice(0)) child.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); });

test('managed guard serializes cooperating ownership and preserves observed replacement run files', () => {
	const path = join(dir, 'guard'), pid = join(dir, 'daemon.pid'), socket = join(dir, 'daemon.sock');
	writeFileSync(pid, '123');
	const expected = runFileIdentity(pid);
	const guard = acquireRunFileGuard(path);
	assert.throws(() => acquireRunFileGuard(path), /ownership conflict/);
	removeOwnedRunFile(pid, expected, guard);
	assert.equal(existsSync(pid), false);
	removeOwnedRunFile(pid, expected, guard);
	writeFileSync(socket, 'replacement');
	assert.throws(() => removeOwnedRunFile(socket, undefined, guard), /replacement preserved/);
	assert.equal(readFileSync(socket, 'utf8'), 'replacement');
	guard.release();
	assert.equal(runFileGuardConflict(path), undefined);
	assert.throws(() => guard.assertOwned(), /ownership changed/);
});

test('replaced or rewritten files and changed guard nonces are preserved', () => {
	const path = join(dir, 'guard'), pid = join(dir, 'daemon.pid');
	writeFileSync(pid, 'original');
	const expected = runFileIdentity(pid), guard = acquireRunFileGuard(path);
	writeFileSync(pid, 'replacement owner');
	assert.throws(() => removeOwnedRunFile(pid, expected, guard), /replacement preserved/);
	const owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
	writeFileSync(join(path, 'owner.json'), JSON.stringify({ ...owner, nonce: 'replacement' }));
	assert.throws(() => guard.release(), /ownership changed/);
	assert.equal(existsSync(path), true);
	assert.equal(readFileSync(pid, 'utf8'), 'replacement owner');
});

test('unverifiable guard records and symlinks fail closed without automatic reclamation', () => {
	const path = join(dir, 'guard');
	const guard = acquireRunFileGuard(path);
	writeFileSync(join(path, 'owner.json'), 'malformed');
	assert.match(runFileGuardConflict(path)!, /unverifiable owner/);
	assert.throws(() => acquireRunFileGuard(path), /not reclaimed automatically/);
	assert.throws(() => guard.release());
	const link = join(dir, 'link'); symlinkSync(path, link);
	assert.throws(() => runFileIdentity(link), /symbolic link/);
});

function contender(path: string): { child: ChildProcess; result: Promise<string> } {
	const module = new URL('../daemon-run-files.ts', import.meta.url).href;
	const source = `import { acquireRunFileGuard } from ${JSON.stringify(module)};
try { const guard=acquireRunFileGuard(process.argv[1]); process.stdout.write('acquired\\n'); process.on('message',()=>{guard.release();process.exit(0)}); }
catch { process.stdout.write('conflict\\n'); process.exit(0); }`;
	const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source, path], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
	children.push(child); child.stdout!.setEncoding('utf8');
	const result = new Promise<string>((resolve, reject) => {
		let output = '';
		child.stdout!.on('data', (chunk: string) => { output += chunk; if (output.includes('\n')) resolve(output.trim()); });
		child.on('error', reject);
		child.on('exit', () => { if (output === '') reject(new Error('contender exited without a result')); });
	});
	return { child, result };
}

test('cross-process guard race admits exactly one owner and releases for the next startup', { skip: process.platform === 'win32', timeout: 10000 }, async () => {
	const path = join(dir, 'guard'), a = contender(path), b = contender(path);
	const results = await Promise.all([a.result, b.result]);
	assert.deepEqual([...results].sort(), ['acquired', 'conflict']);
	const owner = results[0] === 'acquired' ? a.child : b.child;
	const ended = once(owner, 'exit'); owner.send('release'); await ended;
	const next = acquireRunFileGuard(path); next.release();
});

test('killed guard owner is conclusively dead, so the next startup quarantines the stale guard and acquires', { skip: process.platform === 'win32', timeout: 10000 }, async () => {
	const path = join(dir, 'guard'), owner = contender(path);
	assert.equal(await owner.result, 'acquired');
	const ended = once(owner.child, 'exit'); owner.child.kill('SIGKILL'); await ended;
	assert.match(runFileGuardConflict(path)!, /state=gone/);
	const guard = acquireRunFileGuard(path);
	assert.equal(guard.path, path);
	assert.equal(quarantinedSiblings(path).length, 1);
	assert.equal(existsSync(join(path, 'owner.json')), true); // the new owner's fresh record
	guard.release();
});

// The reclaim contract: an optional identity reader injected for the verdict, so the decision table
// can be driven without a real process. The cast is the LLD signature; it compiles before and after.
const acquireReclaim = acquireRunFileGuard as (path: string, owner?: ProcessIdentity, read?: ProcessIdentityReader) => RunFileGuard;

const RECORDED_PID = 424242;
/** The acquiring startup's identity as a fixture, so no test path probes a real process. */
const acquiringOwner: ProcessIdentity = { pid: process.pid, startedAt: 'linux:current-boot:1', commandLine: 'test-startup' };

function staleGuard(path: string, startedAt: string, nonce: string): void {
	mkdirSync(path);
	writeFileSync(join(path, 'owner.json'), JSON.stringify({ owner: { pid: RECORDED_PID, startedAt, commandLine: 'recorded-daemon' }, nonce }));
}

function quarantinedSiblings(path: string): string[] {
	const prefix = `${basename(path)}.quarantine-`;
	return readdirSync(dirname(path)).filter((name) => name.startsWith(prefix));
}

function quarantineStamp(seconds: number): string {
	return new Date(seconds * 1000).toISOString().slice(0, 19).replace(/:/g, '-');
}

function ensureDaemonLog(): void {
	if (!existsSync(PATHS.daemonLog)) writeFileSync(PATHS.daemonLog, '', { mode: 0o600 });
}

/** Spins on mkdir once ready, grabbing the guard path the moment it is free. */
function guardFreeRacer(path: string): { child: ChildProcess; ready: Promise<void>; result: Promise<string> } {
	const source = `import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const path = process.argv[1];
process.stdout.write('ready\\n');
let done = false;
for (let attempt = 0; attempt < 200000 && !done; attempt++) {
	try { mkdirSync(path); writeFileSync(join(path, 'owner.json'), JSON.stringify({ owner: { pid: process.pid, startedAt: 'linux:current-boot:1', commandLine: 'racer' }, nonce: 'racer' }), { flag: 'wx', mode: 0o600 }); done = true; } catch { }
}
if (done) { process.stdout.write('acquired\\n'); process.on('message', () => process.exit(0)); }
else { process.stdout.write('lost\\n'); process.exit(1); }`;
	const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source, path], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
	children.push(child); child.stdout!.setEncoding('utf8');
	let settleReady: (() => void) | undefined, settleResult: ((value: string) => void) | undefined;
	const ready = new Promise<void>((resolve, reject) => { settleReady = resolve; child.on('error', reject); });
	const result = new Promise<string>((resolve, reject) => {
		settleResult = resolve;
		child.on('exit', () => reject(new Error('racer exited without a result')));
	});
	let buffer = '';
	child.stdout!.on('data', (chunk: string) => {
		buffer += chunk;
		for (;;) {
			const index = buffer.indexOf('\n');
			if (index < 0) break;
			const line = buffer.slice(0, index).trim();
			buffer = buffer.slice(index + 1);
			if (line === '') continue;
			if (settleReady !== undefined) { settleReady(); settleReady = undefined; }
			else settleResult!(line);
		}
	});
	return { child, ready, result };
}

test("acquireRunFileGuard quarantines and acquires when the verdict is 'gone' (fake reader, mkdtemp guard)", () => {
	ensureDaemonLog();
	const path = join(dir, 'guard'), nonce = randomUUID();
	const record = JSON.stringify({ owner: { pid: RECORDED_PID, startedAt: 'linux:stale-boot:111', commandLine: 'recorded-daemon' }, nonce });
	staleGuard(path, 'linux:stale-boot:111', nonce);
	const guard = acquireReclaim(path, acquiringOwner, () => undefined); // reader: the recorded owner is gone
	assert.equal(guard.path, path);
	const names = quarantinedSiblings(path);
	assert.equal(names.length, 1);
	assert.match(names[0]!, /^guard\.quarantine-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[0-9a-f-]{36}$/);
	assert.equal(readFileSync(join(dir, names[0]!, 'owner.json'), 'utf8'), record); // the stale record is preserved as evidence
	guard.release();
	assert.equal(quarantinedSiblings(path).length, 1); // release removes only the fresh guard
});

test("acquireRunFileGuard quarantines and acquires on previous-boot 'replaced' (boot segments mismatch)", () => {
	const path = join(dir, 'guard');
	staleGuard(path, 'linux:stale-boot:111', 'nonce-prevboot');
	const replacement: ProcessIdentity = { pid: RECORDED_PID, startedAt: 'linux:current-boot:999', commandLine: 'reused-pid' };
	const guard = acquireReclaim(path, acquiringOwner, () => replacement); // reused PID, but a different boot
	assert.equal(guard.path, path);
	assert.equal(quarantinedSiblings(path).length, 1);
	guard.release();
});

test("acquireRunFileGuard withholds 'same', same-boot 'replaced', corrupt or missing owner.json and a throwing reader; nothing is renamed", () => {
	const path = join(dir, 'guard');
	const same: ProcessIdentity = { pid: RECORDED_PID, startedAt: 'linux:current-boot:111', commandLine: 'recorded-daemon' };
	const reusedSameBoot: ProcessIdentity = { pid: RECORDED_PID, startedAt: 'linux:current-boot:999', commandLine: 'reused-pid' };
	const darwinReused: ProcessIdentity = { pid: RECORDED_PID, startedAt: 'darwin:Mon Nov 13 07:00:00 2026', commandLine: 'reused-pid' };
	const cases: Array<[label: string, setup: () => void, reader: ProcessIdentityReader]> = [
		['same', () => staleGuard(path, 'linux:current-boot:111', 'nonce-same'), () => same],
		['same-boot replaced', () => staleGuard(path, 'linux:current-boot:111', 'nonce-reused'), () => reusedSameBoot],
		// darwin start markers carry no boot segment, so a reused PID there is never conclusively dead.
		['darwin replaced', () => staleGuard(path, 'darwin:Mon Nov 13 06:00:00 2026', 'nonce-darwin'), () => darwinReused],
	];
	for (const [label, setup, reader] of cases) {
		rmSync(path, { recursive: true, force: true }); setup();
		assert.throws(() => acquireReclaim(path, acquiringOwner, reader), /not reclaimed automatically/, label);
		assert.equal(quarantinedSiblings(path).length, 0, label);
	}
	rmSync(path, { recursive: true, force: true });
	mkdirSync(path); writeFileSync(join(path, 'owner.json'), 'malformed');
	assert.throws(() => acquireReclaim(path, acquiringOwner, () => undefined), /not reclaimed automatically/, 'corrupt owner.json');
	assert.equal(quarantinedSiblings(path).length, 0, 'corrupt owner.json');
	rmSync(path, { recursive: true, force: true });
	mkdirSync(path);
	assert.throws(() => acquireReclaim(path, acquiringOwner, () => undefined), /not reclaimed automatically/, 'missing owner.json');
	assert.equal(quarantinedSiblings(path).length, 0, 'missing owner.json');
	rmSync(path, { recursive: true, force: true });
	staleGuard(path, 'linux:current-boot:111', 'nonce-throwing');
	assert.throws(() => acquireReclaim(path, acquiringOwner, () => { throw new Error('unreadable'); }), /not reclaimed automatically/, 'throwing reader');
	assert.equal(quarantinedSiblings(path).length, 0, 'throwing reader');
});

test('acquireRunFileGuard recomputes the conflict and throws when the retry mkdir hits EEXIST', { skip: process.platform === 'win32', timeout: 10000 }, async () => {
	const path = join(dir, 'guard');
	staleGuard(path, 'linux:stale-boot:111', 'nonce-race');
	const racer = guardFreeRacer(path);
	await racer.ready; // spinning before the reclaim even starts
	// The racer grabs the freed path before the single retry mkdir, so the retry EEXISTs. Even though the
	// recompute's injected reader also reads the racer's record as gone, the reclaim does not run twice:
	// the thrown conflict is recomputed against the racer's record, never the quarantined one.
	let conflict: unknown;
	try { acquireReclaim(path, acquiringOwner, () => undefined); }
	catch (error) { conflict = error; }
	assert.ok(conflict instanceof Error && /ownership conflict/.test(conflict.message), String(conflict));
	assert.equal(conflict.message.includes('nonce-race'), false, 'the conflict must be recomputed, not replayed');
	assert.ok(/nonce=racer/.test(conflict.message) || /unverifiable owner/.test(conflict.message), 'the evidence names the racer: its record or its in-flight write');
	assert.equal(await racer.result, 'acquired');
	assert.equal(quarantinedSiblings(path).length, 1); // the stale record is still quarantined
	racer.child.kill('SIGKILL');
});

test('acquireRunFileGuard leaves a symlink guard as a conflict', () => {
	ensureDaemonLog();
	const target = join(dir, 'target');
	staleGuard(target, 'linux:stale-boot:111', 'nonce-link');
	const link = join(dir, 'guard');
	symlinkSync(target, link);
	assert.throws(() => acquireReclaim(link, acquiringOwner, () => undefined), /symbolic link/);
	assert.equal(lstatSync(link).isSymbolicLink(), true); // the link is not renamed away
	assert.equal(quarantinedSiblings(link).length, 0);
});

test('acquireRunFileGuard suffixes the quarantine name on collision; owner.json stays byte-identical and one daemonLog line is keyed by the recorded nonce; a log-write failure is swallowed', () => {
	ensureDaemonLog();
	const path = join(dir, 'guard'), nonce = randomUUID();
	const record = JSON.stringify({ owner: { pid: RECORDED_PID, startedAt: 'linux:stale-boot:111', commandLine: 'recorded-daemon' }, nonce });
	staleGuard(path, 'linux:stale-boot:111', nonce);
	// Pre-create the first quarantine candidate for every second within ±2s, so the rename must collide.
	const now = Math.floor(Date.now() / 1000);
	for (let second = now - 2; second <= now + 2; second++) {
		const candidate = `${path}.quarantine-${quarantineStamp(second)}-${nonce}`;
		mkdirSync(candidate); writeFileSync(join(candidate, 'sentinel'), 'occupied');
	}
	const guard = acquireReclaim(path, acquiringOwner, () => undefined);
	const suffixed = quarantinedSiblings(path).filter((name) => name.endsWith(`-${nonce}.1`));
	assert.equal(suffixed.length, 1);
	assert.equal(readFileSync(join(dir, suffixed[0]!, 'owner.json'), 'utf8'), record); // byte-identical evidence
	assert.equal(readFileSync(PATHS.daemonLog, 'utf8').split('\n').filter((line) => line.includes(nonce)).length, 1); // exactly one recovery line, keyed by the recorded nonce
	guard.release();
	// The same reclaim succeeds when the recovery line cannot be written.
	rmSync(path, { recursive: true, force: true });
	const quiet = randomUUID();
	staleGuard(path, 'linux:stale-boot:222', quiet);
	// Root ignores the mode bits, so the write-failure fixture proves itself only unprivileged.
	if ((process.getuid?.() ?? 0) !== 0) {
		const mode = statSync(PATHS.daemonLog).mode & 0o777;
		chmodSync(PATHS.daemonLog, 0o444);
		try {
			const recovered = acquireReclaim(path, acquiringOwner, () => undefined);
			assert.equal(recovered.path, path);
			assert.equal(quarantinedSiblings(path).filter((name) => name.endsWith(quiet)).length, 1);
			recovered.release();
			// The swallow, positively: the restart was not blocked and no recovery line landed for the quiet nonce.
			assert.equal(readFileSync(PATHS.daemonLog, 'utf8').split('\n').filter((line) => line.includes(quiet)).length, 0);
		} finally { chmodSync(PATHS.daemonLog, mode); }
	}
});
