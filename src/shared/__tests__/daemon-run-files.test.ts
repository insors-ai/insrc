import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { acquireRunFileGuard, removeOwnedRunFile, runFileGuardConflict, runFileIdentity } from '../daemon-run-files.js';

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

test('killed guard owner leaves an explicit orphan conflict and is never reclaimed automatically', { skip: process.platform === 'win32', timeout: 10000 }, async () => {
	const path = join(dir, 'guard'), owner = contender(path);
	assert.equal(await owner.result, 'acquired');
	const ended = once(owner.child, 'exit'); owner.child.kill('SIGKILL'); await ended;
	assert.match(runFileGuardConflict(path)!, /state=gone/);
	assert.throws(() => acquireRunFileGuard(path), /Restart is withheld/);
	assert.equal(existsSync(join(path, 'owner.json')), true);
});
