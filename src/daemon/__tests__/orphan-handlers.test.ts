/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon IPC handlers for §5.1 orphan + cleanup flow. Tests pin:
 *
 *   - `handoff.list-orphans` returns the same shape as the
 *     classifier (covered in detail by orphan-cleanup.test.ts);
 *     this suite just verifies the IPC handler passes the
 *     persistRoot through and surfaces the result list.
 *   - `handoff.discard-orphan` removes only the worktree subdir,
 *     leaving the rest of the session artifacts on disk.
 *   - `handoff.cleanup` writes a `<specId>.outcome.json` stamp
 *     and removes the worktree, with one stamp shape per
 *     accepted outcome value.
 *   - Invalid params on either cleanup IPC don't throw and
 *     return a clear "did nothing" result.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handoffListOrphansRpc, handoffDiscardOrphanRpc, handoffCleanupRpc } from '../orphan-handlers.js';

function tmpRoot(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-orphan-rpc-'));
}

function makeFakeWorktree(root: string, sessionId: string, specId?: string): string {
	const sessionDir = join(root, sessionId);
	mkdirSync(join(sessionDir, 'worktree'), { recursive: true });
	writeFileSync(join(sessionDir, 'worktree', 'index.js'), 'console.log(1)\n');
	if (specId !== undefined) {
		// Trace file so the classifier marks this as `completed`.
		writeFileSync(
			join(sessionDir, `${specId}.trace.jsonl`),
			JSON.stringify({ ts: 1, event: { kind: 'handoff-final', specId, verdict: 'accept', diff: 'd', worktreePath: '/w', deliverable: '' } }) + '\n',
		);
	}
	return sessionDir;
}

test('handoff.list-orphans: surfaces the classifier result keyed by sessionId', async () => {
	const root = tmpRoot();
	try {
		makeFakeWorktree(root, 'sess-1', 'spec-A');
		makeFakeWorktree(root, 'sess-2');
		const result = await handoffListOrphansRpc({ persistRoot: root });
		assert.equal(result.orphans.length, 2);
		const bySession = new Map(result.orphans.map(o => [o.sessionId, o]));
		assert.equal(bySession.get('sess-1')!.status, 'completed');
		assert.equal(bySession.get('sess-2')!.status, 'pending');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('handoff.discard-orphan: removes the worktree subdir but leaves the session dir', async () => {
	const root = tmpRoot();
	try {
		const sessionDir = makeFakeWorktree(root, 'sess-d', 'spec-X');
		const wt = join(sessionDir, 'worktree');
		const trace = join(sessionDir, 'spec-X.trace.jsonl');
		assert.equal(existsSync(wt), true);
		assert.equal(existsSync(trace), true);

		const result = await handoffDiscardOrphanRpc({ sessionId: 'sess-d', persistRoot: root });
		assert.equal(result.removed, true);
		assert.equal(existsSync(wt), false);
		// Session dir + trace artifact still on disk -- that's the
		// observability story for "what happened to this run".
		assert.equal(existsSync(sessionDir), true);
		assert.equal(existsSync(trace), true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('handoff.discard-orphan: missing sessionId returns {removed:false} without throwing', async () => {
	// Cast to unknown so we can deliberately pass a bad shape.
	const result = await handoffDiscardOrphanRpc({} as unknown);
	assert.equal(result.removed, false);
});

test('handoff.cleanup: writes outcome.json + discards worktree for each outcome value', async () => {
	for (const outcome of ['accept', 'reject', 'dismissed'] as const) {
		const root = tmpRoot();
		try {
			const sessionDir = makeFakeWorktree(root, `sess-${outcome}`, `spec-${outcome}`);
			const wt = join(sessionDir, 'worktree');
			const result = await handoffCleanupRpc({
				sessionId: `sess-${outcome}`,
				specId:    `spec-${outcome}`,
				outcome,
				persistRoot: root,
			});
			assert.equal(result.removed, true, `outcome=${outcome}: worktree should be gone`);
			assert.equal(result.outcomeRecorded, true);
			assert.equal(existsSync(wt), false);
			const stampPath = join(sessionDir, `spec-${outcome}.outcome.json`);
			assert.equal(existsSync(stampPath), true);
			const stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
			assert.equal(stamp.outcome, outcome);
			assert.match(stamp.at, /^\d{4}-\d{2}-\d{2}T/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
});

test('handoff.cleanup: idempotent worktree removal -- second call still stamps the outcome', async () => {
	const root = tmpRoot();
	try {
		const sessionDir = makeFakeWorktree(root, 'sess-i', 'spec-i');
		const r1 = await handoffCleanupRpc({ sessionId: 'sess-i', specId: 'spec-i', outcome: 'accept', persistRoot: root });
		assert.equal(r1.removed, true);
		const r2 = await handoffCleanupRpc({ sessionId: 'sess-i', specId: 'spec-i', outcome: 'reject', persistRoot: root });
		assert.equal(r2.removed, false);             // already gone
		assert.equal(r2.outcomeRecorded, true);
		const stamp = JSON.parse(readFileSync(join(sessionDir, 'spec-i.outcome.json'), 'utf8'));
		assert.equal(stamp.outcome, 'reject');       // second call's outcome overwrites
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('handoff.cleanup: invalid outcome refuses to stamp anything', async () => {
	const root = tmpRoot();
	try {
		makeFakeWorktree(root, 'sess-bad');
		const result = await handoffCleanupRpc({ sessionId: 'sess-bad', specId: 'spec-bad', outcome: 'something-else', persistRoot: root } as unknown);
		assert.equal(result.removed, false);
		assert.equal(result.outcomeRecorded, false);
		assert.equal(existsSync(join(root, 'sess-bad', 'spec-bad.outcome.json')), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('handoff.cleanup: stopReason field flows into the outcome stamp', async () => {
	const root = tmpRoot();
	try {
		const sessionDir = makeFakeWorktree(root, 'sess-r', 'spec-r');
		await handoffCleanupRpc({
			sessionId: 'sess-r',
			specId:    'spec-r',
			outcome:   'reject',
			stopReason: 'user closed without applying',
			persistRoot: root,
		});
		const stamp = JSON.parse(readFileSync(join(sessionDir, 'spec-r.outcome.json'), 'utf8'));
		assert.equal(stamp.stopReason, 'user closed without applying');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
