/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `handoff.run` stream IPC handler tests.
 *
 * Drives the handler directly with an injected send + AbortSignal so
 * we don't need the IpcServer wired up. Each test stands up a tmp
 * git repo + tmp persist root so the underlying runHandoff path
 * actually runs (it's the orchestrator the handler wraps).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handoffRunStream } from '../handoff-stream.js';
import type { IpcStreamMessage } from '../../shared/types.js';
import type { HandoffEvent, ScopePayload } from '../../handoff/types.js';

function initRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-handoff-stream-'));
	const run = (args: string[]) => {
		const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
		if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
	};
	run(['init', '-q']);
	run(['config', 'user.email', 's@example.com']);
	run(['config', 'user.name',  'Stream Test']);
	run(['config', 'commit.gpgsign', 'false']);
	writeFileSync(join(dir, 'a.txt'), 'initial\n');
	run(['add', '.']);
	run(['commit', '-q', '-m', 'init']);
	return dir;
}

function withRepo(fn: (repoPath: string, persistRoot: string) => Promise<void>): Promise<void> {
	const repo = initRepo();
	const root = mkdtempSync(join(tmpdir(), 'insrc-handoff-stream-root-'));
	return fn(repo, root).finally(() => {
		rmSync(repo, { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	});
}

function makeScope(repoPath: string): ScopePayload {
	return { repoId: repoPath, repoPath, inScopeGlobs: ['**'], outOfScopePaths: [], riskHints: 'low' };
}

const FILLED = [
	'## Reproduce', 'a', '## Localize', 'b', '## Hypothesize', 'c', '## Test', 'd', '## Conclude', 'e',
].join('\n');

function collect(): { recorded: IpcStreamMessage[]; send: (m: IpcStreamMessage) => void } {
	const recorded: IpcStreamMessage[] = [];
	return { recorded, send: m => { recorded.push(m); } };
}

// ---------------------------------------------------------------------------
// Happy path: streams handoff events + done
// ---------------------------------------------------------------------------

test("handoff.run: scripted-agent run emits the pipeline events then a 'done'", async () => {
	await withRepo(async (repo, persistRoot) => {
		const { recorded, send } = collect();
		const controller = new AbortController();
		await handoffRunStream({
			templateId:     'DEBUG-SESSION',
			intent:         'fix',
			scope:          makeScope(repo),
			memoryRefs:     [],
			agent:          'scripted-agent',
			sessionId:      'sess-stream',
			specIdOverride: 'spec-stream-1',
			scriptedDeliverable: FILLED,
			persistRoot,
		}, send, controller.signal);

		const last = recorded[recorded.length - 1]!;
		assert.equal(last.stream, 'done');

		const progressEvents = recorded.slice(0, -1);
		for (const m of progressEvents) assert.equal(m.stream, 'handoff');

		// Phase 2c: scripted-agent stdout/stderr now replay through the
		// chunk listener too. The pipeline-stage events stay in the
		// same canonical order; chunk events fan in between `spawned`
		// and `agent-completed`.
		const kinds = progressEvents.map(m => (m.data as HandoffEvent).kind);
		const stageKinds = kinds.filter(k => k !== 'agent-stdout-chunk' && k !== 'agent-stderr-chunk');
		assert.deepEqual(stageKinds, [
			'spec-assembling',
			'spec-ready',
			'worktree-created',
			'spawned',
			'agent-completed',
			'auditing',
			'audit-ready',
			'handoff-final',
		]);

		// At minimum one stdout chunk fired (the scripted deliverable).
		const chunkEvents = kinds.filter(k => k === 'agent-stdout-chunk' || k === 'agent-stderr-chunk');
		assert.ok(chunkEvents.length >= 1,
			`expected at least one chunk event, got ${chunkEvents.length}`);

		// Chunk events land between `spawned` and `agent-completed`.
		const spawnedAt = kinds.indexOf('spawned');
		const completedAt = kinds.indexOf('agent-completed');
		for (let i = 0; i < kinds.length; i++) {
			const k = kinds[i]!;
			if (k === 'agent-stdout-chunk' || k === 'agent-stderr-chunk') {
				assert.ok(i > spawnedAt && i < completedAt,
					`chunk event at index ${i} (kind=${k}) outside [${spawnedAt}, ${completedAt}]`);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// Validation: scripted-agent without deliverable -> stream 'error'; no exception
// ---------------------------------------------------------------------------

test("handoff.run: scripted-agent without --scripted-deliverable -> stream 'error', no throw", async () => {
	const persistRoot = mkdtempSync(join(tmpdir(), 'insrc-handoff-stream-err-'));
	try {
		const { recorded, send } = collect();
		const controller = new AbortController();
		await handoffRunStream({
			templateId:     'DEBUG-SESSION',
			intent:         'fix',
			scope:          { repoId: '/r', repoPath: '/r', inScopeGlobs: ['**'], outOfScopePaths: [], riskHints: 'low' },
			memoryRefs:     [],
			agent:          'scripted-agent',
			sessionId:      'sess-stream-bad',
			persistRoot,
			// scriptedDeliverable: undefined
		}, send, controller.signal);
		assert.equal(recorded.length, 1);
		assert.equal(recorded[0]!.stream, 'error');
		const data = recorded[0]!.data as { error: string };
		assert.match(data.error, /requires scriptedDeliverable/);
	} finally {
		rmSync(persistRoot, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Orchestration error: non-git --repo -> stream 'error' with the runHandoff failure message
// ---------------------------------------------------------------------------

test("handoff.run: orchestration error (non-git repo) surfaces as stream 'error'", async () => {
	const persistRoot = mkdtempSync(join(tmpdir(), 'insrc-handoff-stream-orch-'));
	const nonGit       = mkdtempSync(join(tmpdir(), 'insrc-handoff-stream-nongit-'));
	try {
		const { recorded, send } = collect();
		const controller = new AbortController();
		await handoffRunStream({
			templateId:          'DEBUG-SESSION',
			intent:              'fix',
			scope:               { repoId: nonGit, repoPath: nonGit, inScopeGlobs: ['**'], outOfScopePaths: [], riskHints: 'low' },
			memoryRefs:          [],
			agent:               'scripted-agent',
			sessionId:           'sess-stream-orch',
			scriptedDeliverable: FILLED,
			persistRoot,
		}, send, controller.signal);
		const errorMsg = recorded.find(m => m.stream === 'error');
		assert.ok(errorMsg !== undefined, 'expected an error stream message');
		const data = errorMsg.data as { error: string };
		assert.match(data.error, /worktree add failed/);
		// runHandoff still emitted spec-assembling + spec-ready before failing.
		assert.equal(recorded[0]!.stream, 'handoff');
	} finally {
		rmSync(nonGit,      { recursive: true, force: true });
		rmSync(persistRoot, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Abort after start: events stop firing once signal aborts mid-pipeline
// ---------------------------------------------------------------------------

test('handoff.run: aborting the signal mid-stream prevents subsequent handoff messages', async () => {
	await withRepo(async (repo, persistRoot) => {
		const recorded: IpcStreamMessage[] = [];
		const controller = new AbortController();
		const send = (m: IpcStreamMessage): void => {
			recorded.push(m);
			// Abort as soon as we see the first event so all later
			// progress messages get filtered out by the handler's
			// post-abort guard.
			if (recorded.length === 1) controller.abort();
		};
		await handoffRunStream({
			templateId:          'DEBUG-SESSION',
			intent:              'fix',
			scope:               makeScope(repo),
			memoryRefs:          [],
			agent:               'scripted-agent',
			sessionId:           'sess-abort',
			specIdOverride:      'spec-abort-1',
			scriptedDeliverable: FILLED,
			persistRoot,
		}, send, controller.signal);
		// Only the first emit landed; everything after the abort was
		// dropped. The handler still resolved cleanly (no throw).
		assert.equal(recorded.length, 1);
		assert.equal(recorded[0]!.stream, 'handoff');
	});
});

// ---------------------------------------------------------------------------
// Message id is overridden by the IpcServer in production -- the handler's
// placeholder id MUST be a number so JSON.stringify doesn't choke and the
// IpcServer's `{ ...msg, id: request.id }` rewrite still works.
// ---------------------------------------------------------------------------

test('handoff.run: emitted IpcStreamMessages carry a numeric id field for the server to override', async () => {
	await withRepo(async (repo, persistRoot) => {
		const { recorded, send } = collect();
		const controller = new AbortController();
		await handoffRunStream({
			templateId:          'DEBUG-SESSION',
			intent:              'fix',
			scope:               makeScope(repo),
			memoryRefs:          [],
			agent:               'scripted-agent',
			sessionId:           'sess-id',
			specIdOverride:      'spec-id-1',
			scriptedDeliverable: FILLED,
			persistRoot,
		}, send, controller.signal);
		for (const m of recorded) {
			assert.equal(typeof m.id, 'number');
		}
	});
});
