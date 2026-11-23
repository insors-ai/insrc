/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * buildDaemonCard (Story s2, t2) — maps daemon.status + client-known fields into
 * the discriminated DaemonCardModel and folds any getStatus reject into
 * { reachable:false } without throwing. Driven with injectable deps (no socket).
 *
 * Run: npx tsx --test src/cli/services/__tests__/debug-daemon-status.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildDaemonCard, type DaemonStatusDeps } from '../debug.js';
import type { DaemonStatus, RegisteredRepo } from '../../../shared/types.js';

function repo(name: string, status: RegisteredRepo['status'], kind?: RegisteredRepo['kind']): RegisteredRepo {
	return { path: `/r/${name}`, name, addedAt: '', status, ...(kind !== undefined ? { kind } : {}) };
}

function status(overrides: Partial<DaemonStatus> = {}): DaemonStatus {
	return { uptime: 3661, repos: [], queueDepth: 0, embeddingsPending: 0, ...overrides };
}

const NO_FILES: Pick<DaemonStatusDeps, 'socket' | 'pidFile' | 'daemonRoot'> = {
	socket: '/tmp/does-not-exist/daemon.sock',
	pidFile: '/tmp/does-not-exist/daemon.pid',
	daemonRoot: '/tmp/does-not-exist/daemon',
};

test('resolving getStatus yields { reachable:true } with the IPC-sourced fields', async () => {
	const card = await buildDaemonCard({
		getStatus: async () => status({ uptime: 120, repos: [repo('a', 'ready'), repo('b', 'indexing')] }),
		...NO_FILES,
	});
	assert.equal(card.reachable, true);
	if (card.reachable) {
		assert.equal(card.uptimeSec, 120);
		assert.equal(card.repoCount, 2);
		assert.deepEqual(card.repos, [{ name: 'a', status: 'ready' }, { name: 'b', status: 'indexing' }]);
		assert.equal(card.socket, NO_FILES.socket);
	}
});

test('a rejecting getStatus yields { reachable:false } and never throws', async () => {
	const card = await buildDaemonCard({
		getStatus: async () => { throw new Error('daemon is not running'); },
		...NO_FILES,
	});
	assert.deepEqual(card, { reachable: false });
});

test('absent pidfile / unresolvable version leave pid+version undefined but stay reachable', async () => {
	const card = await buildDaemonCard({ getStatus: async () => status(), ...NO_FILES });
	assert.equal(card.reachable, true);
	if (card.reachable) {
		assert.equal(card.pid, undefined);
		assert.equal(card.version, undefined);
	}
});

test('pid + version are read when the pidfile and daemon package.json are present', async () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-s2-'));
	try {
		writeFileSync(join(root, 'daemon.pid'), '4242\n');
		writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '9.9.9' }));
		const card = await buildDaemonCard({
			getStatus: async () => status(),
			socket: '/s/daemon.sock',
			pidFile: join(root, 'daemon.pid'),
			daemonRoot: root,
		});
		assert.equal(card.reachable, true);
		if (card.reachable) {
			assert.equal(card.pid, 4242);
			assert.equal(card.version, '9.9.9');
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('only workspace repos are counted (shared-modules rows excluded)', async () => {
	const card = await buildDaemonCard({
		getStatus: async () => status({
			repos: [repo('ws', 'ready'), repo('jvm', 'ready', 'shared-modules'), repo('ws2', 'ready', 'workspace')],
		}),
		...NO_FILES,
	});
	assert.equal(card.reachable, true);
	if (card.reachable) {
		assert.equal(card.repoCount, 2);
		assert.deepEqual(card.repos.map(r => r.name), ['ws', 'ws2']);
	}
});
