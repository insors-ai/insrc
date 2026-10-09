/**
 * The docs tasks take their scope from the one scope function (Story s7, task t6).
 *
 * The inventory, family-summary, constraint and decision tasks resolve their
 * scope through shared/task-scope.ts. The inventory and the family summary
 * keep to the area a module or file scope names; the constraint and decision
 * tasks do not yet narrow what they retrieve (the next task).
 *
 * A temporary LMDB graph store; a stand-in model; no network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { getDb } from '../../../../db/client.js';
import { writeDocSummary } from '../../../../db/doc-summaries.js';
import { upsertEntities } from '../../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';
import { addRepo } from '../../../../db/repos.js';
import { makeEntityId } from '../../../../indexer/parser/base.js';
import type { AnalyzeScopeRef, ClassifiedIntent, DocSummary } from '../../../../shared/analyze-types.js';
import type { Entity, EntityKind, LLMProvider } from '../../../../shared/types.js';
import { ScopeKindTargetMismatchError, scopeErrorMapping } from '../../../context/invariants.js';
import { runWithRoutingContext } from '../../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../../context/shaper-provider.js';
import type { PlannedTask, TemplateExecuteArgs, TemplateExecuteResult, TemplateRuntime } from '../../../executor/types.js';
import { docsConstraintEnumerateRuntime } from '../constraint-enumerate.js';
import { docsDecisionTraceRuntime } from '../decision-trace.js';
import { docsDiscoveryInventoryRuntime } from '../discovery-inventory.js';
import { docsFamilySummariseRuntime } from '../family-summarise.js';

const NOW = '2026-10-09T10:00:00.000Z';

let dir: string;
let REPO: string;
let prompts: string[] = [];

function doc(name: string, rel: string, body: string, kind: EntityKind = 'section'): Entity {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, body);
	return {
		id: makeEntityId(REPO, file, kind, name), kind, name, language: 'markdown', repoId: 0, repo: REPO, file,
		startLine: 1, endLine: 5, body, embedding: [], indexedAt: NOW, artifact: true,
	} as Entity;
}

function summary(title: string, constraint: string, extra: Partial<DocSummary> = {}): DocSummary {
	return {
		title, family: 'docs', kind: 'reference' as DocSummary['kind'], subjects: ['refunds'], summary: `${title} in brief`,
		keyDecisions: [`${title}: decided`], keyConstraints: [constraint], relatedEntities: [],
		status: 'current', summarisedAt: NOW, modelId: 'm', contentHash: 'h', ...extra,
	};
}

/** A model that keeps what it was asked and finds nothing. */
const model = {
	completeStructured: async (messages: ReadonlyArray<{ content: unknown }>) => {
		prompts.push(messages.map(m => String(m.content)).join('\n'));
		return { subject: 'refund', topic: 'refund', constraints: [], decisions: [], notFoundNote: 'none', summary: 's' };
	},
} as unknown as LLMProvider;
const routing = { router: { resolveProviderForRole: () => ({ provider: model }) } } as unknown as RoutingSeamContext;

/** The four docs tasks that have a scope, each with the parameters it is run with. */
const TASKS: ReadonlyArray<[TemplateRuntime, (scopeRef: AnalyzeScopeRef) => Record<string, unknown>]> = [
	[docsDiscoveryInventoryRuntime,  scopeRef => ({ scopeRef })],
	[docsFamilySummariseRuntime,     () => ({ family: 'docs' })],
	[docsConstraintEnumerateRuntime, () => ({ subject: 'refund' })],
	[docsDecisionTraceRuntime,       () => ({ topic: 'refund' })],
];

function run(runtime: TemplateRuntime, scopeRef: AnalyzeScopeRef, params: Record<string, unknown>): Promise<TemplateExecuteResult> {
	const task = { taskId: 't01', template: runtime.templateId, kind: 'leaf', params, produces: [], rationale: 'test' } as unknown as PlannedTask;
	const intent: ClassifiedIntent = { target: 'docs', scope: 'M', focused: true, focus: 'refunds', scopeRef, reasoning: 'test' };
	const args: TemplateExecuteArgs = { task, intent, upstreamOutputs: new Map(), runId: 'r1' };
	return runWithRoutingContext(routing, () => runtime.execute(args));
}

interface FamilySummary {
	docCount: number;
	documents: Array<{ file: string; title: string }>;
	constraints: Array<{ constraint: string }>;
	decisions: Array<{ decision: string }>;
	topSubjects: Array<{ subject: string; docCount: number }>;
	placeholderCount: number;
}
async function familySummary(scopeRef: AnalyzeScopeRef): Promise<{ out: FamilySummary; result: TemplateExecuteResult }> {
	const result = await run(docsFamilySummariseRuntime, scopeRef, { family: 'docs' });
	return { out: result.outputs.get('family-summary') as FamilySummary, result };
}

const rel = (file: string): string => file.slice(REPO.length + 1);

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-docs-scope-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'ready' });
	prompts = [];

	// Documents of the 'docs' family in two directories; `docs/pay-old` shares the
	// prefix of `docs/pay` and must not be taken for part of it.
	const refunds  = doc('Refund policy', 'docs/pay/refunds.md', '## Refund policy\n\nRefunds MUST be issued within 30 days. We decided to refund in full.');
	const ledger   = doc('Ledger rules', 'docs/pay/ledger.md', '## Ledger rules\n\nA refund MUST be posted to the ledger. We decided on double entry.');
	const failed   = doc('Chargebacks', 'docs/pay/chargebacks.md', '## Chargebacks\n\nA refund after a chargeback MUST be refused.');
	const pending  = doc('Disputes', 'docs/pay/disputes.md', '## Disputes\n\nA refund under dispute MUST wait.');
	const old      = doc('Old refunds', 'docs/pay-old/refunds.md', '## Old refunds\n\nRefunds MUST be issued within 90 days. We decided to refund in part.');
	const shipping = doc('Shipping', 'docs/ship/shipping.md', '## Shipping\n\nA refund MUST not cover shipping. We decided to exclude it.');
	const oldPending = doc('Old disputes', 'docs/pay-old/disputes.md', '## Old disputes\n\nA refund under dispute MUST wait longer.');
	const db = await getDb();
	await upsertEntities(db, [refunds, ledger, failed, pending, old, shipping, oldPending]);
	await writeDocSummary(db, refunds.id, REPO, summary('Refund policy', 'refunds within 30 days'));
	await writeDocSummary(db, ledger.id, REPO, summary('Ledger rules', 'refund posted to the ledger', { subjects: ['refunds', 'ledger'] }));
	await writeDocSummary(db, failed.id, REPO, summary('Chargebacks', 'none', { errorCode: 'summariser-failed' } as Partial<DocSummary>));
	await writeDocSummary(db, old.id, REPO, summary('Old refunds', 'refunds within 90 days'));
	await writeDocSummary(db, shipping.id, REPO, summary('Shipping', 'no refund of shipping', { subjects: ['shipping'] }));
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('the docs tasks give the same result for a repo scope as before the change, and refuse a symbol scope with the mismatch code', async () => {
	const repo: AnalyzeScopeRef = { kind: 'repo', value: REPO };

	// --- the inventory: every document of the repo, with the summary counts ---
	const inv = (await run(docsDiscoveryInventoryRuntime, repo, { scopeRef: repo })).outputs.get('docs-inventory') as {
		inventory: Array<{ file: string; hasSummary: boolean }>; summariesReady: number; summariesPending: number; familyCounts: Record<string, number>;
	};
	assert.deepEqual(inv.inventory.map(e => `${rel(e.file)}:${e.hasSummary}`), [
		'docs/pay-old/disputes.md:false', 'docs/pay-old/refunds.md:true', 'docs/pay/chargebacks.md:false', 'docs/pay/disputes.md:false',
		'docs/pay/ledger.md:true', 'docs/pay/refunds.md:true', 'docs/ship/shipping.md:true',
	]);
	assert.deepEqual([inv.summariesReady, inv.summariesPending, inv.familyCounts['docs']], [4, 3, 7]);

	// --- the family summary: every summary of the family ---
	const { out, result } = await familySummary(repo);
	assert.deepEqual(out.documents.map(d => rel(d.file)).sort(), ['docs/pay-old/refunds.md', 'docs/pay/ledger.md', 'docs/pay/refunds.md', 'docs/ship/shipping.md']);
	assert.deepEqual([out.docCount, out.placeholderCount, out.constraints.length, out.decisions.length], [4, 1, 4, 4]);
	assert.deepEqual(out.topSubjects, [{ subject: 'refunds', docCount: 3 }, { subject: 'ledger', docCount: 1 }, { subject: 'shipping', docCount: 1 }]);
	assert.deepEqual(result.completeness?.skipped?.map(s => s.what), [
		`1 document: ${join(REPO, 'docs/pay/chargebacks.md')}`,
		`2 documents: ${join(REPO, 'docs/pay-old/disputes.md')} § Old disputes, ${join(REPO, 'docs/pay/disputes.md')} § Disputes`,
	]);

	// --- the constraint and decision tasks: the model is shown sections of the whole repo ---
	for (const [runtime, output, params] of [
		[docsConstraintEnumerateRuntime, 'constraints', { subject: 'refund' }],
		[docsDecisionTraceRuntime, 'decision-trace', { topic: 'refund' }],
	] as const) {
		prompts = [];
		const r = await run(runtime, repo, params);
		assert.ok(r.outputs.has(output), runtime.templateId);
		assert.equal(prompts.length, 1, `${runtime.templateId}: the model was asked once`);
		for (const text of ['within 30 days', 'within 90 days', 'MUST not cover shipping']) {
			assert.ok(prompts[0]!.includes(text), `${runtime.templateId}: the repo's section '${text}'`);
		}
	}

	// --- a symbol scope: refused by each, with the mismatch code, before anything is read ---
	const symbol: AnalyzeScopeRef = { kind: 'symbol', value: `${join(REPO, 'docs/pay/refunds.md')}#Refund policy` };
	for (const [runtime, params] of TASKS) {
		prompts = [];
		let caught: unknown;
		try { await run(runtime, symbol, params(symbol)); } catch (err) { caught = err; }
		assert.ok(caught instanceof ScopeKindTargetMismatchError, `${runtime.templateId}: got ${String(caught)}`);
		assert.equal(scopeErrorMapping(caught)?.code, 'scope-ref-kind-target-mismatch', runtime.templateId);
		assert.equal(caught.message,
			`${runtime.templateId}: scopeRef.kind='symbol' is incompatible with target='docs'. Allowed kinds for this target: repo, module, file, workspace.`);
		assert.deepEqual(prompts, [], `${runtime.templateId}: no model call`);
	}

	// The kinds a docs task accepts: repo, module, file and workspace run on each task.
	const accepted: AnalyzeScopeRef[] = [
		repo, { kind: 'workspace', value: REPO },
		{ kind: 'module', value: join(REPO, 'docs/pay') }, { kind: 'file', value: join(REPO, 'docs/pay/refunds.md') },
	];
	for (const scopeRef of accepted) {
		for (const [runtime, params] of TASKS) {
			const r = await run(runtime, scopeRef, params(scopeRef));
			assert.ok(r.outputs.size === 1, `${runtime.templateId} with a ${scopeRef.kind} scope`);
		}
	}
	// A workspace scope on the repo's directory reads what a repo scope reads.
	assert.deepEqual((await familySummary({ kind: 'workspace', value: REPO })).out, out);
});

test("the family-summary task with a module scope keeps only the summaries of documents under that directory, and with a file scope only that file's", async () => {
	// --- a module scope: docs/pay, not docs/pay-old and not docs/ship ---
	const mod = await familySummary({ kind: 'module', value: join(REPO, 'docs/pay') });
	assert.deepEqual(mod.out.documents.map(d => rel(d.file)).sort(), ['docs/pay/ledger.md', 'docs/pay/refunds.md']);
	assert.equal(mod.out.docCount, 2);
	// Everything the roll-up counts is counted within the area.
	assert.deepEqual(mod.out.constraints.map(c => c.constraint).sort(), ['refund posted to the ledger', 'refunds within 30 days']);
	assert.deepEqual(mod.out.decisions.map(d => d.decision).sort(), ['Ledger rules: decided', 'Refund policy: decided']);
	assert.deepEqual(mod.out.topSubjects, [{ subject: 'refunds', docCount: 2 }, { subject: 'ledger', docCount: 1 }]);
	assert.equal(mod.out.placeholderCount, 1, "the area's one failed summary");
	assert.equal(mod.result.completeness?.returned, 2);
	// What the record says was left out is the area's too: not the old directory's document without a summary.
	assert.deepEqual(mod.result.completeness?.skipped?.map(s => s.what), [
		`1 document: ${join(REPO, 'docs/pay/chargebacks.md')}`,
		`1 document: ${join(REPO, 'docs/pay/disputes.md')} § Disputes`,
	]);

	// --- a file scope: that file's summary alone ---
	const file = await familySummary({ kind: 'file', value: join(REPO, 'docs/pay/ledger.md') });
	assert.deepEqual(file.out.documents.map(d => rel(d.file)), ['docs/pay/ledger.md']);
	assert.deepEqual(file.out.constraints.map(c => c.constraint), ['refund posted to the ledger']);
	assert.deepEqual([file.out.docCount, file.out.placeholderCount], [1, 0]);
	assert.deepEqual(file.result.completeness?.skipped ?? [], []);

	// A file whose summary failed: nothing returned, and the record says why.
	const failed = await familySummary({ kind: 'file', value: join(REPO, 'docs/pay/chargebacks.md') });
	assert.deepEqual([failed.out.docCount, failed.out.placeholderCount], [0, 1]);
	assert.deepEqual(failed.result.completeness?.skipped?.map(s => s.what), [`1 document: ${join(REPO, 'docs/pay/chargebacks.md')}`]);

	// --- the inventory keeps to the area in the same way ---
	const inventory = async (scopeRef: AnalyzeScopeRef): Promise<string[]> => {
		const out = (await run(docsDiscoveryInventoryRuntime, scopeRef, { scopeRef })).outputs.get('docs-inventory') as { inventory: Array<{ file: string }> };
		return out.inventory.map(e => rel(e.file));
	};
	assert.deepEqual(await inventory({ kind: 'module', value: join(REPO, 'docs/pay') }),
		['docs/pay/chargebacks.md', 'docs/pay/disputes.md', 'docs/pay/ledger.md', 'docs/pay/refunds.md']);
	assert.deepEqual(await inventory({ kind: 'file', value: join(REPO, 'docs/ship/shipping.md') }), ['docs/ship/shipping.md']);
});
