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

import type { DebugSectionId, DebugSection, DebugService, DebugPaneProps } from '../debug-types.js';

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
