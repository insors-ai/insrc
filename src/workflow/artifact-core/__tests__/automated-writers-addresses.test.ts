/**
 * s5 t3: the automated content writers (the controller's and the daemon's review auto-fix, and the BUILD, TESTS and code-review
 * rounds) never address a person's feedback, whereas an ordinary revision addresses all of it.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifact-core/__tests__/automated-writers-addresses.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';

// The review reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => {
	await closeGraphStore();
	rmSync(STORE_DIR, { recursive: true, force: true });
});

import type { LLMMessage, LLMProvider, LLMResponse, StructuredCompletionOpts, StructuredSchema } from '../../../shared/types.js';
import { lifecycleFor, resetLifecycleRegistry, roundWriterFor } from '../../../daemon/lifecycle-registry.js';
import { handleReviewStep } from '../../../daemon/steps/review-step/handler.js';
import { _clearReviewStateStoreForTests } from '../../../daemon/steps/review-step/state-store.js';
import { reviewArtifactFile } from '../../review/run-artifact.js';
import { envelopeProvider } from '../../review-pipeline/__tests__/enveloped.js';
import { persistBuildRecord } from '../../runners/build/standalone-record.js';
import { persistTestRecordTask } from '../../runners/build/test-record.js';
import { storeRound } from '../../runners/build/round-writer.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId, testsArtifactId } from '../../storage.js';
import { History } from '../history.js';
import { FileSidecarStore } from '../sidecar-store.js';
import type { Actor, Feedback } from '../types.js';
import { H, alice, artifact } from './store-kit.js';
import '../../__tests__/helpers/converted-repos.js';

const PLAN = `PLAN-${H}-s1`;
const MD = `<!-- insrc:artifact ${PLAN} -->\n\n# Story s1\n\n- t1: extend the two exported constants in foo.\n`;
const reviewer: Actor = { id: 'github:carol', kind: 'person', properties: {} };
const CLAIMS = { claims: [{ id: 'c-inv', ref: 's1/t1', kind: 'inventory', text: 'There are exactly two exported constants in foo.', anchors: ['src/foo.ts'], probe: { greps: ['^export const'] } }] };
const FIX = { claimId: 'c-inv', severity: 'HIGH', evidence: 'ripgrep re-derived THREE `export const` sites.', action: 'Correct the count.', fixability: 'auto', proposedFix: { rationale: 'three', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] } };

const repos: string[] = [];
afterEach(() => { resetLifecycleRegistry(); _clearReviewStateStoreForTests(); for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true }); });

/** A request for change made before anything below is written, so a later revision would address it if it could. */
const feedback = (id: string): Feedback => ({ id, text: 'please change this', actor: reviewer, timestamp: '2026-01-01T00:00:00.000Z', feedback: [], kind: 'revision-request' });

async function repo(): Promise<{ dir: string; history: History }> {
	const dir = mkdtempSync(join(tmpdir(), 'automated-writers-'));
	repos.push(dir);
	mkdirSync(join(dir, 'src'), { recursive: true });
	writeFileSync(join(dir, 'src', 'foo.ts'), 'export const alpha = 1;\nexport const beta = 2;\nexport const gamma = 3;\n');
	await lifecycleFor(dir).store.write(artifact(`DEF-${H}`), alice);
	return { dir, history: new History(new FileSidecarStore(dir)) };
}
const open = async (h: History, id: string) => (await h.openFeedback(id)).map(f => f.id);

test('a review auto-fix on either path and a BUILD, TESTS or code-review round leave open feedback open', async () => {
	// 1. the controller's review auto-fix (verdicts phase)
	{
		const { dir, history } = await repo();
		const { store } = lifecycleFor(dir);
		await store.write(artifact(PLAN, { payload: { body: { tasks: ['extend the two exported constants in foo.'] }, citations: [] } }), alice);
		const head = JSON.parse(readFileSync(artifactJsonPath(dir, PLAN), 'utf8')) as { meta: Record<string, unknown> };
		writeFileSync(artifactJsonPath(dir, PLAN), JSON.stringify({ ...head, meta: { ...head.meta, authoredBy: 'daemon', workflow: 'plan' } }, null, 2) + '\n');
		const docs = join(dir, 'docs', 'epics', 'demo-E2026102100000000', 'S001');
		mkdirSync(docs, { recursive: true });
		writeFileSync(join(docs, 'PLAN.md'), MD);
		await history.appendFeedback(PLAN, feedback('f-controller'));
		const parse = (env: Awaited<ReturnType<typeof handleReviewStep>>) => JSON.parse(env.content[0]!.text) as { state: string; next: string; applied?: number };
		const start = parse(await handleReviewStep({ phase: 'start', artifact: join(docs, 'PLAN.md'), repo: dir }));
		await handleReviewStep({ phase: 'claims', claims: CLAIMS, state: start.state });
		const done = parse(await handleReviewStep({ phase: 'verdicts', verdicts: { verdicts: [FIX] }, state: start.state } as never));
		assert.equal(done.applied, 1, 'the controller auto-fix was applied');
		assert.equal((await store.readWithHistory(PLAN)).lifecycle.revision.number, 2, 'and it moved the revision');
		assert.deepEqual(await open(history, PLAN), ['f-controller'], 'the controller auto-fix left the request open');
		assert.deepEqual((await store.readWithHistory(PLAN)).changeLog.filter(e => e.operation === 'update').map(e => e.addresses), [[]]);
	}

	// 2. the daemon's review auto-fix (reviewArtifactFile with a service)
	{
		const { dir, history } = await repo();
		const { store, service } = lifecycleFor(dir);
		await store.write(artifact(PLAN, { payload: { body: { tasks: ['extend the two exported constants in foo.'] }, citations: [] } }), alice);
		const md = join(dir, 'PLAN.md');
		writeFileSync(md, '# Story s1\n\n- t1: extend the two exported constants in foo.\n');
		await history.appendFeedback(PLAN, feedback('f-daemon'));
		const provider: LLMProvider = envelopeProvider({
			supportsTools: false,
			capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
			async complete(): Promise<LLMResponse> { return { text: '', stopReason: 'end_turn' }; },
			async *stream(): AsyncIterable<string> { /* unused */ },
			async embed(): Promise<number[]> { return []; },
			async completeStructured<T>(_m: LLMMessage[], schema: StructuredSchema, _o?: StructuredCompletionOpts): Promise<T> {
				const props = (schema as { properties?: Record<string, unknown> }).properties ?? {};
				const { claimId: _c, ...verdict } = FIX;
				return ('claims' in props ? { claims: [CLAIMS.claims[0]] } : verdict) as T;
			},
		});
		const res = await reviewArtifactFile({ mdPath: md, jsonPath: artifactJsonPath(dir, PLAN), repo: dir, provider, model: 'fake', reviewedAt: '2026-10-21T00:00:00.000Z', reReview: false, lifecycle: service, actor: { id: 'insrc:review', kind: 'system', properties: {} } });
		assert.equal(res.applied.length, 1, 'the daemon auto-fix was applied');
		assert.equal((await store.readWithHistory(PLAN)).lifecycle.revision.number, 2);
		assert.deepEqual(await open(history, PLAN), ['f-daemon'], 'the daemon auto-fix left the request open');
	}

	// 3. the BUILD, TESTS and code-review rounds
	{
		const { dir, history } = await repo();
		const through = roundWriterFor(dir);
		const BUILD = buildArtifactId(H, 's1');
		const TESTS = testsArtifactId(H, 's1');
		const CR = codeReviewArtifactId(H, 's1');
		const T1 = '2026-10-21T10:00:00.000Z';
		const rec = (passed: boolean) => ({ meta: { workflow: 'build' as const, epicHash: H, storyId: 's1', createdAt: T1, updatedAt: T1 }, body: { tasks: [{ id: 't1', passed }] } });
		const task = (ok: boolean) => ({ taskId: 't1', ranAt: T1, testsPassed: ok, tests: [], files: [] });
		const crPath = artifactJsonPath(dir, CR);
		await persistBuildRecord(dir, rec(false), through);
		await persistTestRecordTask(dir, { epicHash: H, storyId: 's1', now: T1 }, task(false), {}, through);
		await storeRound(through, CR, crPath, { kind: 'code-review', verdict: 'warn' }, { result: 'warn', summary: 'round 1' });
		for (const id of [BUILD, TESTS, CR]) await history.appendFeedback(id, feedback(`f-${id}`));
		// a second round of each, with different content, so each moves its revision
		await persistBuildRecord(dir, rec(true), through);
		await persistTestRecordTask(dir, { epicHash: H, storyId: 's1', now: T1 }, task(true), {}, through);
		await storeRound(through, CR, crPath, { kind: 'code-review', verdict: 'pass' }, { result: 'pass', summary: 'round 2' });
		for (const id of [BUILD, TESTS, CR]) {
			assert.equal((await lifecycleFor(dir).store.readWithHistory(id)).lifecycle.revision.number, 2, `${id} moved its revision`);
			assert.deepEqual(await open(history, id), [`f-${id}`], `${id}: the round left the request open`);
		}
	}
});
