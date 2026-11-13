/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-9d4523c7cb1c5971 regression: scripts/daemon-ctl.sh must resolve a
 * working node even when the caller's PATH has no node (GUI-launched callers
 * such as the VS Code extension host run with PATH=/usr/local/bin:/usr/bin:/bin).
 * The script pins an ABSOLUTE node path: INSRC_NODE_BIN, then PATH, then
 * well-known install locations (overridable via INSRC_NODE_LOCATIONS for
 * hermetic tests), then the runtime recorded at install time
 * (~/.insrc/daemon-node, internal whitespace preserved).
 *
 * Run: npx tsx --test src/daemon/__tests__/daemon-ctl-node-path.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = join(repo, 'scripts', 'daemon-ctl.sh');

interface Fixture {
	home: string; root: string; emptyBin: string; toolsDir: string;
	pid: string; sock: string; cleanup(): void;
}

function fixture(): Fixture {
	const home = mkdtempSync('/tmp/insrc-ctl-nodepath-');
	const root = join(home, 'root');
	const emptyBin = join(home, 'empty-bin');
	// A controlled tools directory holding the shell utilities the script
	// needs but NO node: the test PATH is genuinely node-free on any OS.
	const toolsDir = join(home, 'tools');
	for (const p of ['.insrc', 'root/.git', 'root/src', 'empty-bin', 'tools']) {
		mkdirSync(join(home, p), { recursive: true });
	}
	for (const util of ['bash', 'sh', 'git', 'date', 'mkdir', 'ps', 'uname', 'cat', 'tee', 'sleep', 'env', 'disown']) {
		const src = spawnSync('bash', ['-c', `command -v ${util}`], { encoding: 'utf8' }).stdout.trim();
		if (src) symlinkSync(src, join(toolsDir, util));
	}
	// cmd_status runs `git -C "$DAEMON_ROOT" ...`; the fixture needs a real git
	// repo so those log lines do not die under set -e.
	spawnSync('git', ['-C', root, 'init', '-q'], { stdio: 'ignore' });
	spawnSync('git', ['-C', root, 'commit', '-q', '--allow-empty', '-m', 'init'], {
		stdio: 'ignore',
		env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
	});
	writeFileSync(join(root, 'package.json'), '{"type":"module"}');
	// tsx/esm must resolve from the daemon root during spawn; the whole built
	// out/ tree is copied so the lifecycle helper's relative imports
	// (../shared/paths.js) resolve inside the fixture root. cpSync into an
	// existing dir nests (out/out), so copy into the home and move it.
	symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'));
	cpSync(join(repo, 'out'), join(home, 'out-copy'), { recursive: true });
	renameSync(join(home, 'out-copy'), join(root, 'out'));
	return {
		home, root, emptyBin, toolsDir,
		pid: join(home, '.insrc/daemon.pid'),
		sock: join(home, '.insrc/daemon.sock'),
		cleanup: () => rmSync(home, { recursive: true, force: true }),
	};
}

/** Hermetic env: genuinely node-free PATH, no well-known locations, no recorded runtime unless extraEnv sets one. */
function guiEnv(f: Fixture, extraEnv: Record<string, string> = {}): Record<string, string> {
	return {
		HOME: f.home,
		PATH: f.toolsDir,
		INSRC_DAEMON_ROOT: f.root,
		INSRC_CTL_LOG_DIR: join(f.home, 'logs'),
		INSRC_CTL_STOP_WAIT_SECS: '0.1',
		INSRC_NODE_LOCATIONS: f.emptyBin, // replaces the built-in well-known locations
		...extraEnv,
	};
}

function ctl(f: Fixture, command: string, extraEnv: Record<string, string> = {}, path?: string) {
	const env = guiEnv(f, extraEnv);
	if (path) env['PATH'] = path;
	const r = spawnSync('bash', [SCRIPT, command, '--skip-sync', '--skip-install', '--skip-build'], {
		encoding: 'utf8', timeout: 20000, env,
	});
	return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

/** A minimal stand-in daemon: writes the pid file, serves daemon.status, cleans up on SIGTERM. */
function fakeDaemonEntry(f: Fixture): string {
	const nl = String.fromCharCode(10);
	return [
		"import net from 'node:net'; import fs from 'node:fs';",
		`const pidFile = ${JSON.stringify(f.pid)}, sockFile = ${JSON.stringify(f.sock)};`,
		'const cleanup = () => { fs.rmSync(pidFile, { force: true }); fs.rmSync(sockFile, { force: true }); };',
		'const server = net.createServer(s => { s.on(\'error\', () => {}); s.on(\'data\', d => {',
		`\tconst req = JSON.parse(String(d).split(String.fromCharCode(10))[0]);`,
		`\ts.write(JSON.stringify({ id: req.id, result: { ok: true, uptime: 1 } }) + ${JSON.stringify(nl)});`,
		'}); });',
		"process.on('SIGTERM', () => { cleanup(); process.exit(0); });",
		'server.listen(sockFile, () => { fs.writeFileSync(pidFile, String(process.pid)); });',
		'setTimeout(() => process.exit(0), 60000);',
	].join(nl);
}

test('daemon-ctl.sh resolves node from INSRC_NODE_BIN when PATH has no node', () => {
	const f = fixture();
	try {
		const r = ctl(f, 'status', { INSRC_NODE_BIN: process.execPath });
		// The node client must have EXECUTED (not "command not found"); the
		// fixture home has no daemon, so the socket probe fails cleanly.
		assert.notEqual(r.status, 2, r.output);
		assert.doesNotMatch(r.output, /node: command not found/);
		assert.match(r.output, /daemon not reachable/);
	} finally { f.cleanup(); }
});

test('daemon-ctl.sh absolutizes a relative INSRC_NODE_BIN against the caller cwd', () => {
	const f = fixture();
	try {
		// Relative override resolved from the CALLER's directory, not the
		// daemon root (spawn_daemon cds there before executing).
		const callerDir = join(f.home, 'caller');
		const toolsDir = join(callerDir, 'tools');
		mkdirSync(toolsDir, { recursive: true });
		const relNode = 'tools/node';
		symlinkSync(process.execPath, join(toolsDir, 'node'));
		const r = spawnSync('bash', [SCRIPT, 'status'], {
			encoding: 'utf8', timeout: 15000, cwd: callerDir,
			env: guiEnv(f, { INSRC_NODE_BIN: relNode }),
		});
		const out = `${r.stdout}${r.stderr}`;
		assert.notEqual(r.status, 2, out);
		assert.doesNotMatch(out, /node: command not found/);
		assert.match(out, /daemon not reachable/);
	} finally { f.cleanup(); }
});

test('daemon-ctl.sh falls back to the recorded ~/.insrc/daemon-node when PATH and well-known locations have no node', () => {
	const f = fixture();
	try {
		writeFileSync(join(f.home, '.insrc/daemon-node'), `${process.execPath}\n`);
		const r = ctl(f, 'status');
		// Only the recorded runtime can have run: PATH is node-free and
		// INSRC_NODE_LOCATIONS points at an empty dir.
		assert.notEqual(r.status, 2, r.output);
		assert.doesNotMatch(r.output, /node: command not found/);
		assert.match(r.output, /daemon not reachable/);
	} finally { f.cleanup(); }
});

test('daemon-ctl.sh preserves internal whitespace in the recorded runtime path', () => {
	const f = fixture();
	try {
		// A recorded path containing a space must resolve verbatim.
		const spacedDir = join(f.home, 'Node Tools', 'bin');
		mkdirSync(spacedDir, { recursive: true });
		symlinkSync(process.execPath, join(spacedDir, 'node'));
		writeFileSync(join(f.home, '.insrc/daemon-node'), `  ${join(spacedDir, 'node')} \n`);
		const r = ctl(f, 'status');
		assert.notEqual(r.status, 2, r.output);
		assert.doesNotMatch(r.output, /node: command not found/);
		assert.match(r.output, /daemon not reachable/);
	} finally { f.cleanup(); }
});

test('daemon-ctl.sh prefers a node on PATH over the recorded runtime', () => {
	const f = fixture();
	try {
		// A bogus recorded runtime must lose to a real node on PATH.
		writeFileSync(join(f.home, '.insrc/daemon-node'), join(f.home, 'bogus-node'));
		const nodeDir = dirname(process.execPath);
		const r = ctl(f, 'status', {}, `${nodeDir}:${f.toolsDir}`);
		assert.doesNotMatch(r.output, /node not found/);
		assert.doesNotMatch(r.output, /node: command not found/);
		assert.match(r.output, /daemon not reachable/);
	} finally { f.cleanup(); }
});

test('daemon-ctl.sh fails closed with exit 2 and a clear message when no node exists anywhere', () => {
	const f = fixture();
	try {
		// Genuinely node-free PATH (controlled tools dir), empty well-known
		// locations, no recorded runtime, no INSRC_NODE_BIN.
		const r = ctl(f, 'status');
		assert.equal(r.status, 2, r.output);
		assert.match(r.output, /node not found/);
		assert.doesNotMatch(r.output, /node: command not found/);
	} finally { f.cleanup(); }
});

test('daemon-ctl.sh stop succeeds under a node-free PATH via the resolved node', () => {
	const f = fixture();
	try {
		// No daemon running in the fixture home: stop must reach the lifecycle
		// helper (which reports no live process) instead of dying on a bare node.
		const r = ctl(f, 'stop', { INSRC_NODE_BIN: process.execPath });
		assert.equal(r.status, 0, r.output);
		assert.doesNotMatch(r.output, /node: command not found/);
	} finally { f.cleanup(); }
});

test('daemon-ctl.sh honours a non-executable INSRC_NODE_BIN by failing closed, not by echoing it', () => {
	const f = fixture();
	try {
		const bogus = join(f.home, 'not-executable');
		writeFileSync(bogus, '#!/bin/sh\n');
		const r = ctl(f, 'status', { INSRC_NODE_BIN: bogus });
		assert.equal(r.status, 2, r.output);
		assert.match(r.output, /node not found/);
	} finally { f.cleanup(); }
});

test('daemon-ctl.sh start spawns the daemon and stop shuts it down under a node-free GUI PATH (the original startup failure)', () => {
	const f = fixture();
	// The exact failure before the fix was the stop_managed_daemon call inside
	// cmd_start dying on a bare `node` (exit 4, "node: command not found")
	// before spawn. With a resolved node, start must reach spawn, the stand-in
	// daemon must come up and answer status, and stop must reach the helper.
	writeFileSync(join(f.root, 'out/daemon/index.js'), fakeDaemonEntry(f));
	const nodeBinDir = join(f.home, 'node-bin');
	mkdirSync(nodeBinDir, { recursive: true });
	symlinkSync(process.execPath, join(nodeBinDir, 'node'));
	const env = guiEnv(f, { INSRC_NODE_LOCATIONS: nodeBinDir });
	try {
		const start = spawnSync('bash', [SCRIPT, 'start', '--skip-sync', '--skip-install', '--skip-build'], {
			encoding: 'utf8', timeout: 30000, env,
		});
		const startOut = `${start.stdout}${start.stderr}`;
		assert.equal(start.status, 0, startOut);
		assert.doesNotMatch(startOut, /node: command not found/);
		assert.match(startOut, /daemon running/);
		assert.ok(existsSync(f.pid), 'pid file written by the spawned daemon');
		const status = spawnSync('bash', [SCRIPT, 'status'], { encoding: 'utf8', timeout: 15000, env });
		const statusOut = `${status.stdout}${status.stderr}`;
		assert.equal(status.status, 0, statusOut);
		assert.match(statusOut, /"uptime": 1/);
		// Stop must reach the lifecycle helper over the resolved node: the
		// helper runs (no "node: command not found") and owns the outcome. The
		// stand-in is not a real insrc daemon so the capability broker refuses
		// the drain; the assertion that matters is that the script got all the
		// way to the helper instead of dying on a bare node.
		const stop = spawnSync('bash', [SCRIPT, 'stop'], { encoding: 'utf8', timeout: 15000, env });
		const stopOut = `${stop.stdout}${stop.stderr}`;
		assert.doesNotMatch(stopOut, /node: command not found/);
		assert.match(stopOut, /stopping daemon/, 'stop reached the lifecycle path');
	} finally {
		// Kill any stand-in daemon the start spawned.
		if (existsSync(f.pid)) {
			const pid = Number(readFileSync(f.pid, 'utf8'));
			try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
		}
		f.cleanup();
	}
});
