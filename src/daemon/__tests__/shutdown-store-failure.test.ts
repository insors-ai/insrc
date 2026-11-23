/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Retained broken-store status and application resource disposal invariants.
 * The actual disposal callbacks are exercised without installation or PID control.
 */

import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import type { StoreHealth } from '../../db/graph/store.js';
import type { DaemonStatus } from '../../shared/types.js';
import { killAllStoreChildren, runLockLossSequence, spawnStoreChild } from '../../db/graph/__tests__/helpers/store-child-driver.js';
import type { StoreChild } from '../../db/graph/__tests__/helpers/store-child-driver.js';

// A short root: each child's request socket lives under it (path limit ~104 bytes).
const base = mkdtempSync('/tmp/insrc-shutdown-');
afterEach(() => { killAllStoreChildren(); });
after(() => {
	killAllStoreChildren();
	rmSync(base, { recursive: true, force: true });
});

const skip = process.platform === 'win32';

interface Home { home: string; store: string; log: string; crashDir: string; pid: string; sock: string; }
function tempHome(name: string): Home {
	const home = join(base, name);
	mkdirSync(join(home, '.insrc'), { recursive: true });
	return {
		home, store: join(home, 'graph.lmdb'), log: join(home, 'daemon.log'), crashDir: join(home, 'crash'),
		pid: join(home, '.insrc/daemon.pid'), sock: join(home, '.insrc/daemon.sock'),
	};
}

/** One request over the child's socket. Resolves with the answer, or with
 *  'closed' when the connection ends without one. */
function ask(sock: string, method: string, params: unknown = {}): Promise<{ result?: unknown; error?: string } | 'closed'> {
	return new Promise((resolve, reject) => {
		const c = createConnection(sock);
		let buf = '';
		// Never wait for ever on a process that neither answers nor ends.
		const timer = setTimeout(() => { c.destroy(); reject(new Error(`no answer to ${method} within 10 s`)); }, 10_000);
		c.on('connect', () => c.write(`${JSON.stringify({ id: 1, method, params })}\n`));
		c.on('data', d => {
			buf += String(d);
			const nl = buf.indexOf('\n');
			if (nl < 0) return;
			clearTimeout(timer);
			c.end();
			resolve(JSON.parse(buf.slice(0, nl)) as { result?: unknown; error?: string });
		});
		c.on('close', () => { clearTimeout(timer); resolve('closed'); });
		c.on('error', e => { clearTimeout(timer); reject(e); });
	});
}

async function becomeDaemon(child: StoreChild, h: Home): Promise<void> {
	const r = await child.send({ op: 'daemon-like', logPath: h.log, crashLogDir: h.crashDir });
	assert.ok(r.ok, r.ok ? '' : r.message);
	assert.ok(existsSync(h.sock), 'request socket is in place');
}

/** A child with a store broken by the real sequence, serving as a daemon. */
async function brokenDaemon(name: string): Promise<{ child: StoreChild; h: Home }> {
	const h = tempHome(name);
	const child = await runLockLossSequence(h.store, { env: { HOME: h.home } });
	await becomeDaemon(child, h);
	return { child, h };
}

test('status after failure: storeFailure names another process and does not contain \'semume\'', { skip }, async () => {
	const { child, h } = await brokenDaemon('status');
	const answer = await ask(h.sock, 'daemon.status');
	assert.notEqual(answer, 'closed');
	const status = (answer as { result: DaemonStatus }).result;
	assert.deepEqual(status.repos, [], 'answered, with an empty repository list');
	assert.equal(status.storeFailure?.kind, 'locks-lost');
	assert.equal(status.storeFailure?.operation, 'request daemon.status');
	assert.match(status.storeFailure?.cause ?? '', /Another process/);
	assert.doesNotMatch(JSON.stringify(status), /semume/);
	// It goes on answering.
	const again = await ask(h.sock, 'daemon.status');
	assert.equal((again as { result: DaemonStatus }).result.storeFailure?.kind, 'locks-lost');
	await child.kill();
});

// Execute the surviving application callbacks themselves with observed resource ports.
// Importing index.ts would boot the real daemon; AST extraction avoids that side effect.
import ts from 'typescript';
import { runInNewContext } from 'node:vm';

function applicationCallback(name: 'closeStores' | 'closeApplication'): string {
  const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  let expression: string | undefined;
  function visit(node: ts.Node): void {
    if (name === 'closeStores' && ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer) expression = node.initializer.getText(tree);
    if (name === 'closeApplication' && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText(tree) === name) expression = node.right.getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(expression, `${name}: production callback must exist`);
  return ts.transpile(expression, { target: ts.ScriptTarget.ES2022 });
}

test('application disposal coalesces, drains before closing resources and skips unsafe native closes after lock loss during drain', async () => {
  for (const loseLocks of [false, true]) {
    const acts: string[] = [];
    let release!: () => void;
    let health = 'ok';
    const record = (name: string) => async () => { acts.push(name); };
    const context = {
      closing: undefined, workerStarts: [Promise.resolve()], stopBackgroundWork: () => { acts.push('stop'); },
      queueDone: new Promise<void>(r => { release = r; }),
      connectionTestSupervisor: { shutdown: record('tests') },
      server: { flushPendingWrites: record('flush'), disconnectClients: () => { acts.push('disconnect'); } },
      serverClosing: Promise.resolve(),
      maintenance: { stop: record('maintenance') }, sessionPool: { close: record('sessions') },
      supervisor: { terminateAll: record('workers') }, connectionOwners: [{ close: record('owner') }],
      closeDb: record('db'), closeDuckDB: record('duck'),
      graphModule: { closeGraphStore: record('graph') }, lanceModule: { closeLanceConn: record('lance') },
      getStoreHealth: () => ({ state: health }), log: { info() {} },
    };
    const stores = applicationCallback('closeStores')
      .replace("await import('../db/graph/store.js')", 'graphModule')
      .replace("await import('../db/lance/conn.js')", 'lanceModule');
    const closeStores = runInNewContext(`(${stores.trim().replace(/;$/, '')})`, context) as () => Promise<void>;
    const dispose = runInNewContext(`(${applicationCallback('closeApplication').trim().replace(/;$/, '')})`, { ...context, closeStores }) as (reason: string) => Promise<void>;
    const first = dispose('SIGTERM');
    assert.equal(dispose('SIGINT'), first, 'concurrent disposal shares the same drain');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(acts, ['stop'], 'stores remain open while work drains');
    if (loseLocks) health = 'locks-lost';
    release(); await first;
    assert.deepEqual(acts, ['stop', 'tests', 'flush', 'disconnect', 'maintenance', 'sessions', 'workers', 'owner', 'db', 'duck', ...(loseLocks ? [] : ['graph', 'lance'])]);
  }
});
