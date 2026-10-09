/**
 * The docs constraint and decision tasks keep to their area at retrieval
 * (Story s7, task t7).
 *
 * The area travels task -> shared runner -> prepare -> retrieval. It narrows
 * the candidates before they are ranked and cut, so the limit and the
 * completeness record count within it. Without an area nothing changes: the
 * runners, and the lookup pipeline's direct calls of the prepare functions.
 *
 * A temporary LMDB graph store; a stand-in model; no embedding service, so
 * retrieval ranks by keywords.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDb } from '../../../../db/client.js';
import { upsertEntities } from '../../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';
import { addRepo } from '../../../../db/repos.js';
import { makeEntityId } from '../../../../indexer/parser/base.js';
import type { AnalyzeScopeRef, ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../../shared/types.js';
import type { Completeness } from '../../../completeness.js';
import { runWithRoutingContext } from '../../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../../context/shaper-provider.js';
import { retrieveDocSections } from '../../../docs-retrieval.js';
import type { PlannedTask, TemplateExecuteArgs, TemplateExecuteResult, TemplateRuntime } from '../../../executor/types.js';
import { prepareDocConstraintEnumerate, runSharedDocConstraintEnumerate } from '../../../explore/doc-constraint-enumerate.js';
import { prepareDocDecisionTrace, runSharedDocDecisionTrace } from '../../../explore/doc-decision-trace.js';
import { docsConstraintEnumerateRuntime } from '../constraint-enumerate.js';
import { docsDecisionTraceRuntime } from '../decision-trace.js';

const NOW = '2026-10-09T10:00:00.000Z';
const HERE = dirname(fileURLToPath(import.meta.url));

let dir: string;
let REPO: string;
let prompts: string[] = [];

function section(name: string, rel: string, body: string): Entity {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, body);
	return {
		id: makeEntityId(REPO, file, 'section', name), kind: 'section', name, language: 'markdown', repoId: 0, repo: REPO, file,
		startLine: 1, endLine: 5, body, embedding: [], indexedAt: NOW, artifact: true,
	} as Entity;
}

/** A model that keeps what it was asked and finds nothing. */
const model = {
	completeStructured: async (messages: ReadonlyArray<{ content: unknown }>) => {
		prompts.push(String(messages[1]!.content));
		return { subject: 'refund', topic: 'refund', constraints: [], decisions: [], notFoundNote: 'none' };
	},
} as unknown as LLMProvider;
const routing = { router: { resolveProviderForRole: () => ({ provider: model }) } } as unknown as RoutingSeamContext;

function runTask(runtime: TemplateRuntime, scopeRef: AnalyzeScopeRef, params: Record<string, unknown>): Promise<TemplateExecuteResult> {
	const task = { taskId: 't01', template: runtime.templateId, kind: 'leaf', params, produces: [], rationale: 'test' } as unknown as PlannedTask;
	const intent: ClassifiedIntent = { target: 'docs', scope: 'M', focused: true, focus: 'refunds', scopeRef, reasoning: 'test' };
	const args: TemplateExecuteArgs = { task, intent, upstreamOutputs: new Map(), runId: 'r1' };
	return runWithRoutingContext(routing, () => runtime.execute(args));
}

/** The marker of each fixture section that a prompt holds, in fixture order. */
const MARKERS = ['PAY-REFUNDS', 'PAY-LEDGER', 'PAY-DISPUTES', 'OLD-REFUNDS', 'SHIP-A', 'SHIP-B'] as const;
const shown = (prompt: string): string[] => MARKERS.filter(m => prompt.includes(m));
const limits = (c: Completeness | undefined): Array<[string, number]> => (c?.limited ?? []).map(l => [l.what, l.limit]);

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-docs-area-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'ready' });
	prompts = [];
	// Every section mentions a refund. The two under docs/ship also mention
	// shipping, so for the query 'refund shipping' they rank above all the
	// others: a limit of two over the whole repo keeps those two and nothing
	// of docs/pay. `docs/pay-old` shares the prefix of `docs/pay`.
	await upsertEntities(await getDb(), [
		section('Refund policy', 'docs/pay/refunds.md', 'PAY-REFUNDS A refund MUST be issued within 30 days. We decided to refund in full.'),
		section('Ledger rules', 'docs/pay/ledger.md', 'PAY-LEDGER A refund MUST be posted to the ledger. We decided on double entry.'),
		section('Disputes', 'docs/pay/disputes.md', 'PAY-DISPUTES A refund under dispute MUST wait. We decided to hold it.'),
		section('Old refunds', 'docs/pay-old/refunds.md', 'OLD-REFUNDS A refund MUST be issued within 90 days. We decided to refund in part.'),
		section('Shipping', 'docs/ship/shipping.md', 'SHIP-A A refund MUST not cover shipping. We decided to exclude shipping.'),
		section('Returns', 'docs/ship/returns.md', 'SHIP-B A refund of return shipping MUST be approved. We decided case by case.'),
	]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('a docs constraint task and a docs decision task with a module scope retrieve only sections under that directory and count within it; without an area the runners and the lookup pipeline\'s calls return what they did (mutation: drop the area at the hand-over from runner to prepare)', async () => {
	const repo:   AnalyzeScopeRef = { kind: 'repo', value: REPO };
	const module_: AnalyzeScopeRef = { kind: 'module', value: join(REPO, 'docs/pay') };
	const file:   AnalyzeScopeRef = { kind: 'file', value: join(REPO, 'docs/pay/ledger.md') };
	const TASKS = [
		[docsConstraintEnumerateRuntime, 'constraints', 'subject'],
		[docsDecisionTraceRuntime, 'decision-trace', 'topic'],
	] as const;

	for (const [runtime, output, key] of TASKS) {
		const id = runtime.templateId;
		const ask = async (scopeRef: AnalyzeScopeRef, maxSources?: number) => {
			prompts = [];
			const result = await runTask(runtime, scopeRef, { [key]: 'refund shipping', ...(maxSources !== undefined ? { maxSources } : {}) });
			const out = result.outputs.get(output) as { retrievedSectionCount: number };
			return { shown: prompts.length === 1 ? shown(prompts[0]!) : [], count: out.retrievedSectionCount, completeness: result.completeness };
		};

		// --- a repo scope: the whole repo, as before ---
		const whole = await ask(repo);
		assert.deepEqual(whole.shown, [...MARKERS], `${id}: a repo scope reads every section`);
		assert.equal(whole.count, 6, id);
		// With a limit of two, the two best of the whole repo: the shipping sections.
		const wholeCut = await ask(repo, 2);
		assert.deepEqual(wholeCut.shown, ['SHIP-A', 'SHIP-B'], id);
		assert.deepEqual(limits(wholeCut.completeness), [['document sections', 2]], id);

		// --- a module scope: only sections under docs/pay, through runner, prepare and retrieval ---
		const area = await ask(module_);
		assert.deepEqual(area.shown, ['PAY-REFUNDS', 'PAY-LEDGER', 'PAY-DISPUTES'], `${id}: not docs/pay-old, not docs/ship`);
		assert.equal(area.count, 3, `${id}: the count is the area's`);
		assert.deepEqual(limits(area.completeness), [], `${id}: three sections of the area, under the limit`);
		// The limit applies WITHIN the area: two of the area's three, although none
		// of them is among the two best of the repo. Narrowing after the cut would give none.
		const areaCut = await ask(module_, 2);
		assert.equal(areaCut.shown.length, 2, id);
		assert.ok(areaCut.shown.every(m => m.startsWith('PAY-')), `${id}: got ${areaCut.shown.join(', ')}`);
		assert.equal(areaCut.count, 2, id);
		assert.deepEqual(limits(areaCut.completeness), [['document sections', 2]], `${id}: the limit was reached within the area`);

		// --- a file scope: that file's section alone; a limit of two is not reached ---
		const one = await ask(file, 2);
		assert.deepEqual(one.shown, ['PAY-LEDGER'], id);
		assert.deepEqual([one.count, limits(one.completeness)], [1, []], id);
	}

	// --- without an area: the two runners return what they did ---
	const db = await getDb();
	prompts = [];
	const c = await runSharedDocConstraintEnumerate({ subject: 'refund shipping', repoPath: REPO, db, maxSources: 2, provider: model });
	const d = await runSharedDocDecisionTrace({ topic: 'refund shipping', repoPath: REPO, db, maxSources: 2, provider: model });
	assert.deepEqual(prompts.map(shown), [['SHIP-A', 'SHIP-B'], ['SHIP-A', 'SHIP-B']]);
	assert.deepEqual([c.retrievedSectionCount, d.retrievedSectionCount], [2, 2]);
	// ... and with one, the runner hands it on to prepare.
	prompts = [];
	const area = { directory: join(REPO, 'docs/pay') };
	const ca = await runSharedDocConstraintEnumerate({ subject: 'refund shipping', repoPath: REPO, db, area, provider: model });
	const da = await runSharedDocDecisionTrace({ topic: 'refund shipping', repoPath: REPO, db, area, provider: model });
	assert.deepEqual(prompts.map(shown), [['PAY-REFUNDS', 'PAY-LEDGER', 'PAY-DISPUTES'], ['PAY-REFUNDS', 'PAY-LEDGER', 'PAY-DISPUTES']]);
	assert.deepEqual([ca.retrievedSectionCount, da.retrievedSectionCount], [3, 3]);

	// --- the lookup pipeline's direct calls of the prepare functions: no area, the whole repo ---
	// The arguments are the ones src/analyze/explore/executor.ts builds.
	const pc = await prepareDocConstraintEnumerate({ subject: 'refund shipping', repoPath: REPO, db, runId: 'r1', logContext: 'exploration' });
	const pd = await prepareDocDecisionTrace({ topic: 'refund shipping', repoPath: REPO, db, runId: 'r1', logContext: 'exploration' });
	for (const p of [pc, pd]) {
		assert.equal(p.kind, 'narrow-llm');
		if (p.kind !== 'narrow-llm') continue;
		assert.deepEqual(shown(p.userTurn), [...MARKERS]);
		assert.equal(p.prepared.retrievedSectionCount, 6);
		assert.equal(p.retrieved.length, 6);
	}
	// The pipeline passes no area to either.
	const pipeline = readFileSync(join(HERE, '..', '..', '..', 'explore', 'executor.ts'), 'utf8');
	assert.equal(pipeline.match(/return prepareDoc(ConstraintEnumerate|DecisionTrace)\(\{/g)!.length, 2);
	assert.ok(!/\barea\b\s*[:,}]/.test(pipeline), 'the lookup pipeline names no area');

	// --- retrieval itself: an area with no document is empty, and an absent area is the whole closure ---
	const q = { db, query: 'refund shipping', closureRepos: [REPO], previewChars: 0 } as const;
	assert.equal((await retrieveDocSections(q)).length, 6);
	assert.equal((await retrieveDocSections({ ...q, area: undefined })).length, 6);
	assert.deepEqual((await retrieveDocSections({ ...q, area: { directory: join(REPO, 'docs/ship') } })).map(r => r.heading).sort(), ['Returns', 'Shipping']);
	assert.deepEqual((await retrieveDocSections({ ...q, area: { file: join(REPO, 'docs/pay-old/refunds.md') } })).map(r => r.heading), ['Old refunds']);
	assert.deepEqual(await retrieveDocSections({ ...q, area: { directory: join(REPO, 'docs/none') } }), []);
});
