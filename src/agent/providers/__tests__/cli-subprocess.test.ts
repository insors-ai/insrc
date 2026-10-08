/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Process-group teardown for every CLI child (ISSUE-f1bf0fb3, LLD-f1bf0fb3-s1,
 * plan task t1), driven against a FAKE `claude` that starts a grandchild.
 */

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider } from '../cli-provider.js';

/**
 * A fake CLI that starts `sleep 300` as a grandchild sharing its stdio (so the
 * grandchild holds the CLI's pipes open), records the grandchild's pid, then:
 *   hang  — never exits (the call must time out);
 *   leave — prints a claude result envelope and exits 0, leaving the grandchild.
 */
const FAKE = `#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const mode = readFileSync(join(here, 'mode'), 'utf8').trim();
const g = spawn('sleep', ['300'], { stdio: 'inherit' });
writeFileSync(join(here, 'grandchild.pid'), String(g.pid));
if (mode === 'hang') setInterval(() => {}, 1000);
else { process.stdout.write(JSON.stringify({ is_error: false, result: 'done' })); process.exit(0); }
`;

function fakeCli(mode: 'hang' | 'leave'): { bin: string; grandchildPid: () => number; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-cli-group-'));
	const bin = join(dir, 'fake.mjs');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	writeFileSync(join(dir, 'mode'), mode);
	const pidFile = join(dir, 'grandchild.pid');
	return {
		bin,
		grandchildPid: () => {
			assert.ok(existsSync(pidFile), 'the fake CLI recorded its grandchild');
			return Number(readFileSync(pidFile, 'utf8'));
		},
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** The kill is asynchronous at the OS level; give the grandchild a moment to go. */
async function goneWithin(pid: number, ms: number): Promise<boolean> {
	const until = Date.now() + ms;
	while (Date.now() < until) {
		if (!isAlive(pid)) return true;
		await new Promise(r => setTimeout(r, 25));
	}
	return !isAlive(pid);
}

test('a timed-out CLI child is killed with its process group, so a grandchild it started is gone', async () => {
	const f = fakeCli('hang');
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin, timeoutMs: 1_500 });
		await assert.rejects(p.complete([{ role: 'user', content: 'hi' }]), /exited with -9/);
		const pid = f.grandchildPid();
		assert.equal(await goneWithin(pid, 2_000), true, `grandchild ${pid} outlived the timed-out CLI`);
	} finally { f.cleanup(); }
});

test('a CLI child that exits 0 leaving a background process holding its pipes resolves with exit code 0 and the background process is gone', async () => {
	const f = fakeCli('leave');
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin, timeoutMs: 20_000 });
		const started = Date.now();
		const out = await p.complete([{ role: 'user', content: 'hi' }]);
		assert.equal(out.text, 'done');
		assert.ok(Date.now() - started < 10_000, 'the call returned when the CLI exited, not at the time limit');
		const pid = f.grandchildPid();
		assert.equal(await goneWithin(pid, 2_000), true, `background process ${pid} outlived the CLI`);
	} finally { f.cleanup(); }
});

// ---------------------------------------------------------------------------
// Working directory of one-shot calls (ISSUE-f9ced66a, LLD-f9ced66a-s1, task t1)
// ---------------------------------------------------------------------------

/** A fake CLI that answers with the directory it was started in: as a claude
 *  envelope (result + structured_output), or as a codex agent_message when
 *  called as `codex exec`. */
const CWD_FAKE = `#!/usr/bin/env node
const cwd = process.cwd();
if (process.argv[2] === 'exec') {
	process.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ cwd }) } }) + '\\n');
} else {
	process.stdout.write(JSON.stringify({ is_error: false, result: cwd, structured_output: { cwd } }));
}
`;

const CWD_SCHEMA = { type: 'object', properties: { cwd: { type: 'string' } }, required: ['cwd'] } as const;

function cwdFake(): { bin: string; elsewhere: string; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-cli-cwd-'));
	const elsewhere = mkdtempSync(join(tmpdir(), 'insrc-fake-cli-repo-'));
	const bin = join(dir, 'fake.mjs');
	writeFileSync(bin, CWD_FAKE);
	chmodSync(bin, 0o755);
	return {
		bin,
		elsewhere: realpathSync(elsewhere),
		cleanup: () => { rmSync(dir, { recursive: true, force: true }); rmSync(elsewhere, { recursive: true, force: true }); },
	};
}

test('completeStructured and complete run the CLI in opts.cwd when it is given', async () => {
	const f = cwdFake();
	try {
		for (const kind of ['claude', 'codex'] as const) {
			const p = new CliProvider({ kind, binPath: f.bin, timeoutMs: 20_000 });
			const structured = await p.completeStructured<{ cwd: string }>(
				[{ role: 'user', content: 'where are you?' }], CWD_SCHEMA, { cwd: f.elsewhere });
			assert.equal(structured.cwd, f.elsewhere, `${kind} completeStructured ran in opts.cwd`);
			const plain = await p.complete([{ role: 'user', content: 'where are you?' }], { cwd: f.elsewhere });
			const seen = kind === 'claude' ? plain.text : (JSON.parse(plain.text) as { cwd: string }).cwd;
			assert.equal(seen, f.elsewhere, `${kind} complete ran in opts.cwd`);
		}
	} finally { f.cleanup(); }
});

test('completeStructured without opts.cwd runs the CLI in the inherited working directory', async () => {
	const f = cwdFake();
	try {
		const inherited = realpathSync(process.cwd());
		for (const kind of ['claude', 'codex'] as const) {
			const p = new CliProvider({ kind, binPath: f.bin, timeoutMs: 20_000 });
			const structured = await p.completeStructured<{ cwd: string }>([{ role: 'user', content: 'where are you?' }], CWD_SCHEMA);
			assert.equal(structured.cwd, inherited, `${kind} completeStructured inherited the working directory`);
			const plain = await p.complete([{ role: 'user', content: 'where are you?' }]);
			const seen = kind === 'claude' ? plain.text : (JSON.parse(plain.text) as { cwd: string }).cwd;
			assert.equal(seen, inherited, `${kind} complete inherited the working directory`);
		}
	} finally { f.cleanup(); }
});
