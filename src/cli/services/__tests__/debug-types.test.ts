/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc1 type compile-guard (Story s1, t1).
 *
 * There is no runtime behaviour to assert — these are type-level declarations.
 * The guard is that this file COMPILES: the `never`-exhaustiveness switch below
 * proves `DebugSectionId` is exactly the three-member union, and the typed
 * fixtures prove the `DebugSection` / `DebugService` shapes. If any of those
 * types drift, `npx tsc --noEmit` (and the `tsx` test runner) fails here.
 *
 * Run: npx tsx --test src/cli/services/__tests__/debug-types.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DebugSectionId, DebugSection, DebugService, DebugPaneProps, DaemonCardModel, OrphanScanResult, OrphanProcess, KillOutcome } from '../debug-types.js';

/** Exhaustiveness check: every DebugSectionId member must be handled — a fourth
 *  member (or a dropped one) makes this fail to compile at the `never` binding. */
function titleFor(id: DebugSectionId): string {
	switch (id) {
		case 'daemon': return 'Daemon';
		case 'mcp':    return 'MCP';
		case 'logs':   return 'Logs';
		default: {
			const _exhaustive: never = id;
			return _exhaustive;
		}
	}
}

test('DebugSectionId covers exactly daemon, mcp, logs (exhaustive)', () => {
	const ids: readonly DebugSectionId[] = ['daemon', 'mcp', 'logs'];
	assert.deepEqual(ids.map(titleFor), ['Daemon', 'MCP', 'Logs']);
});

test('DebugSection / DebugService / DebugPaneProps shapes hold', () => {
	const sections: readonly DebugSection[] = [
		{ id: 'daemon', title: 'Daemon' },
		{ id: 'mcp', title: 'MCP' },
		{ id: 'logs', title: 'Logs' },
	];
	const debug: DebugService = { sections };
	const props: DebugPaneProps = { services: { debug } };

	assert.equal(props.services.debug.sections.length, 3);
	assert.deepEqual(props.services.debug.sections.map(s => s.id), ['daemon', 'mcp', 'logs']);
	// DebugSection carries only id + title — no view/component field.
	assert.deepEqual(Object.keys(sections[0]!).sort(), ['id', 'title']);
});

test('DaemonCardModel discriminates reachable vs unreachable (Story s2)', () => {
	const up: DaemonCardModel = {
		reachable: true,
		uptimeSec: 3661,
		repoCount: 2,
		repos: [
			{ name: 'repoA', status: 'ready' },
			{ name: 'repoB', status: 'indexing' },
		],
		socket: '/home/u/.insrc/daemon.sock',
		pid: 4242,
		version: '1.2.3',
	};
	const down: DaemonCardModel = { reachable: false };

	// Narrowing on `reachable` gates every running field.
	assert.equal(up.reachable === true && up.repos.map(r => r.status).join(','), 'ready,indexing');
	assert.equal(down.reachable, false);
	assert.equal('uptimeSec' in down, false); // unreachable carries no running fields

	// Optional client-known fields may be omitted (graceful degradation).
	const partial: DaemonCardModel = { reachable: true, uptimeSec: 5, repoCount: 0, repos: [], socket: '/s' };
	assert.equal(partial.reachable === true && partial.pid, undefined);
});

test('OrphanScanResult / OrphanProcess / KillOutcome shapes hold (Story s3)', () => {
	const proc: OrphanProcess = { pid: 5150, command: 'node /x/daemon/index.js' };
	const supported: OrphanScanResult = { supported: true, orphans: [proc] };
	const unsupported: OrphanScanResult = { supported: false };

	// Discriminated on `supported`; the unsupported variant carries NO orphans field.
	assert.equal(supported.supported === true && supported.orphans[0]!.pid, 5150);
	assert.equal(unsupported.supported, false);
	assert.equal('orphans' in unsupported, false);

	// KillOutcome result is exactly the four-member union.
	const results: readonly KillOutcome['result'][] = ['terminated', 'forced', 'not-found', 'error'];
	const outcomes: readonly KillOutcome[] = results.map((result, i) => ({ pid: 5150 + i, result }));
	assert.deepEqual(outcomes.map(o => o.result), ['terminated', 'forced', 'not-found', 'error']);
});
