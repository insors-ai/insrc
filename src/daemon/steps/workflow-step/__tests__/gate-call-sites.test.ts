/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The authoring routes ask the team gate before they change anything: the workflow-step
 * phases (start, plan, step, synthesize) and the daemon's server-side driver (workflow.run).
 * A stage held by someone else is refused naming the holder; the first author turn of a
 * stage with no issue is let through; a repo with no policy behaves as before.
 *
 * Run: npx tsx --test src/daemon/steps/workflow-step/__tests__/gate-call-sites.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { handleWorkflowStep } from '../handler.js';
import { encodeState, STATE_VERSION, type WorkflowStepStatePayload } from '../state.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';
import { runStart, runWorkflowServerSide } from '../../../workflow-rpc.js';
import { _setGateDepsForTests, TeamGateRefusedError } from '../../../../workflow/team/gate.js';
import { registerWorkflowRunners } from '../../../../workflow/index.js';
import type { PortResult, TrackerPort } from '../../../../workflow/tracker/port.js';
import type { PolicyReader, TeamPolicy } from '../../../../workflow/team/types.js';
import type { LLMProvider } from '../../../../shared/types.js';
import type { WorkflowIntent } from '../../../../workflow/types.js';

afterEach(() => { _setGateDepsForTests(); _clearWorkflowStateStoreForTests(); });

const HASH = 'a3f4b8c9d1e2f3a4';
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
const none: PolicyReader = () => ({ ok: true, value: 'none' });

interface Seen { loads: number; reads: number }

function inject(holder: string | null, over: { readPolicy?: PolicyReader; issue?: string | null; artifact?: boolean } = {}): Seen {
	const seen: Seen = { loads: 0, reads: 0 };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => { seen.reads += 1; return { ok: true, value: holder }; },
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({
		readPolicy: over.readPolicy ?? team,
		loadTracker: () => { seen.loads += 1; return { ok: true, value: port }; },
		resolveIssue: () => (over.issue === undefined ? 'acme/demo#7' : over.issue),
		ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }),
		artifactExists: () => over.artifact ?? true,
	});
	return seen;
}

const intentOf = (repo: string, workflow = 'plan'): WorkflowIntent => ({ workflow, focus: 'f', repoPath: repo, repoIndexedAt: null, params: { epicHash: HASH, storyId: 's1' } });

function payload(repo: string, stage: WorkflowStepStatePayload['stage']): WorkflowStepStatePayload {
	return { version: STATE_VERSION, runId: 'wf-1', epicKey: HASH, startedAtMs: Date.now(), intent: intentOf(repo), stage, ...(stage === 'awaiting_synthesize' ? { stepOutputs: {} } : {}) };
}

const parse = (env: { content: readonly { text: string }[] }): { next: string; error?: { code: string; message: string } } => JSON.parse(env.content[0]!.text) as never;

class NeverProvider implements LLMProvider {
	calls = 0;
	readonly supportsTools = false;
	get capabilities() { return { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false }; }
	async complete(): Promise<never> { this.calls += 1; throw new Error('unused'); }
	async *stream(): AsyncIterable<string> { this.calls += 1; throw new Error('unused'); }
	async embed(): Promise<number[]> { return []; }
	async completeStructured(): Promise<never> { this.calls += 1; throw new Error('the provider must not be reached'); }
}

test('workflow-step start, plan, step and synthesize on a stage held by someone else are refused naming the holder before any state changes, the first author turn with no issue is let through, and a repo without a policy behaves as before', async () => {
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gate-call-'));
	try {
		inject('bob');

		// start: refused with the gate's own error code, naming the holder; no run state was saved
		const start = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'f', repo, params: { epicHash: HASH, storyId: 's1' } }));
		assert.equal(start.next, 'error');
		assert.equal(start.error?.code, 'team-gate-refused');
		assert.match(start.error?.message ?? '', /held by bob/);

		// plan, step and synthesize: each refused before the executor or the finalizer runs
		for (const [phase, stage, extra] of [
			['plan', 'awaiting_plan', { plan: { workflow: 'plan', steps: [{ id: 's1', runner: 'context.assemble', params: {} }] } }],
			['step', 'awaiting_llm_step', { stepId: 's1', response: {} }],
			['synthesize', 'awaiting_synthesize', { artifact: { body: {}, citations: [] } }],
		] as const) {
			const state = encodeState(payload(repo, stage));
			const out = parse(await handleWorkflowStep({ phase, state, ...extra } as never));
			assert.equal(out.next, 'error', phase);
			assert.equal(out.error?.code, 'team-gate-refused', phase);
			assert.match(out.error?.message ?? '', /held by bob/, phase);
		}
		assert.deepEqual(readdirSync(repo), [], 'nothing was written under the repo');

		// the first author turn of a stage with no issue and no artifact is let through the gate
		inject(null, { issue: null, artifact: false });
		const first = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'f', repo, params: { epicHash: HASH, storyId: 's1' } }));
		assert.notEqual(first.error?.code, 'team-gate-refused', 'the first draft is not blocked by the gate');
		// but not once the artifact exists
		inject(null, { issue: null, artifact: true });
		const later = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'f', repo, params: { epicHash: HASH, storyId: 's1' } }));
		assert.equal(later.error?.code, 'team-gate-refused');

		// no policy: the gate is not consulted beyond the policy read, and the run goes on as before
		const free = inject('bob', { readPolicy: none });
		const ok = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'f', repo, params: { epicHash: HASH, storyId: 's1' } }));
		assert.notEqual(ok.error?.code, 'team-gate-refused');
		assert.equal(free.loads, 0);
		assert.equal(free.reads, 0);

		// analyze-like and other workflows have no stage unit and are not guarded
		inject('bob');
		const stub = parse(await handleWorkflowStep({ phase: 'start', workflow: 'stub', focus: 'demo', repo }));
		assert.equal(stub.next, 'emit_plan');
	} finally { rmSync(repo, { recursive: true, force: true }); }

	// the daemon's server-side driver (workflow.run): refused before anything is generated or written
	const repo2 = mkdtempSync(join(tmpdir(), 'insrc-gate-run-'));
	try {
		inject('bob');
		const provider = new NeverProvider();
		await assert.rejects(
			() => runWorkflowServerSide(intentOf(repo2), provider, { runId: 'wf-9', epicKey: HASH, modelLabel: 'fake', review: false }),
			(err: unknown) => err instanceof TeamGateRefusedError && /held by bob/.test(err.reason),
		);
		assert.equal(provider.calls, 0, 'no model call was made');
		assert.ok(!existsSync(join(repo2, 'docs')) && !existsSync(join(repo2, '.insrc')), 'no draft was written');

		// and the workflow.run stream: an error frame naming the holder, never a done frame
		const frames: Array<{ stream?: string; data?: Record<string, unknown> }> = [];
		await runStart({ workflow: 'plan', focus: 'f', repo: repo2, params: { epicHash: HASH, storyId: 's1' }, review: false }, m => frames.push(m as never), new AbortController().signal);
		assert.ok(frames.some(f => f.stream === 'error' && /held by bob/.test(String(f.data?.['error']))), JSON.stringify(frames));
		assert.ok(!frames.some(f => f.stream === 'done'));
	} finally { rmSync(repo2, { recursive: true, force: true }); }
});
