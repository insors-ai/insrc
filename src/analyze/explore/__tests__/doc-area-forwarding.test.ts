/**
 * The document lookups keep to the area the request named, on both
 * execution modes (Story 65b643840a294422/s1, task t11): the one-shot
 * dispatch (the runners) and the multi-turn dispatch (the narrow runners'
 * prepare). Real graph store and real retrieval; the vector search and the
 * model are stand-ins.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import type { Entity, LLMMessage, LLMProvider } from '../../../shared/types.js';
import { savedAnalysisExecution } from '../../connection-access.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';
import { runWithRoutingContext, type RoutingSeamContext } from '../../context/shaper-provider.js';
import type { ResolvedScope } from '../../context/scope.js';
import { _setVectorPassForTest } from '../../docs-retrieval.js';
import { runDocConstraintEnumerate } from '../doc-constraint-enumerate.js';
import { runDocDecisionTrace } from '../doc-decision-trace.js';
import { runDocMention } from '../doc-mention.js';
import { getNarrowRunner } from '../executor.js';
import type { DocMentionOutput, Exploration, ExplorationRunnerContext } from '../types.js';

const REPO = '/repo/alpha';
const NOW = '2026-07-07T10:00:00.000Z';
let dir: string;
let embedded = 0;
let prompts: string[] = [];

const id = (file: string, name: string): string => createHash('sha256').update(`${REPO}\x00${file}\x00section\x00${name}`).digest('hex').slice(0, 32);
const section = (file: string, name: string, body: string): Entity => ({
	id: id(file, name), kind: 'section', name, language: 'markdown', repoId: 1, repo: REPO, file,
	startLine: 1, endLine: 2, body, embedding: [], indexedAt: NOW, artifact: true,
} as Entity);

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-doc-area-forwarding-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
	// The area holds a weaker match; the section outside it holds every word of the query, so it ranks first without an area.
	await upsertEntities(null, [
		section(`${REPO}/docs/pay/one.md`, 'AREA-ONE', 'AREA-ONE Settlement is posted on the day.'),
		section(`${REPO}/docs/pay/two.md`, 'AREA-TWO', 'AREA-TWO Ledger entries are dated.'),
		section(`${REPO}/docs/billing/b.md`, 'OUTSIDE-ONE', 'OUTSIDE-ONE Settlement ledger rules MUST hold. Settlement ledger rules.'),
	]);
	embedded = 0;
	prompts = [];
	_setVectorPassForTest({ embedQuery: async () => { embedded += 1; throw new Error('no embedding in this test'); } });
});

test.afterEach(async () => {
	_setVectorPassForTest(undefined);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const scopes = {
	module:    { kind: 'module',    value: `${REPO}/docs/pay`, repoPath: REPO, lookupPath: `${REPO}/docs/pay` } as ResolvedScope,
	file:      { kind: 'file',      value: `${REPO}/docs/pay/one.md`, repoPath: REPO, lookupPath: REPO, filePath: `${REPO}/docs/pay/one.md` } as ResolvedScope,
	repo:      { kind: 'repo',      value: REPO, repoPath: REPO, lookupPath: REPO } as ResolvedScope,
	workspace: { kind: 'workspace', value: REPO, repoPath: REPO, lookupPath: REPO } as ResolvedScope,
};

const ctxFor = (scope: ResolvedScope | undefined): ExplorationRunnerContext => ({
	connectionExecution: savedAnalysisExecution(REPO), runId: 'r1', repoPath: REPO, closureRepos: [REPO],
	...(scope !== undefined ? { scope } : {}),
	readDep: () => undefined, ignoreFilter: permissiveIgnoreFilter(REPO),
});

const exp = (type: string, params: Record<string, unknown>): Exploration => ({ id: 'e1', type, purpose: 'p', params }) as Exploration;

const model = {
	completeStructured: async (messages: LLMMessage[]) => {
		prompts.push(String(messages[1]!.content));
		return { subject: 'x', topic: 'x', constraints: [], decisions: [], notFoundNote: 'none' };
	},
} as unknown as LLMProvider;
const routing = { router: { resolveProviderForRole: () => ({ provider: model }) } } as unknown as RoutingSeamContext;

/** Which of the markers a run's evidence shows: the one-shot runner's prompt, or the multi-turn prepare's user turn. */
async function shown(type: 'doc.decision.trace' | 'doc.constraint.enumerate', scope: ResolvedScope | undefined, mode: 'one-shot' | 'multi-turn'): Promise<string[]> {
	const params = type === 'doc.decision.trace' ? { topic: 'settlement ledger rules' } : { subject: 'settlement ledger rules' };
	let text: string;
	if (mode === 'one-shot') {
		prompts = [];
		const run = type === 'doc.decision.trace' ? runDocDecisionTrace : runDocConstraintEnumerate;
		await runWithRoutingContext(routing, () => run(exp(type, params), ctxFor(scope)) as Promise<unknown>);
		text = prompts.join('\n');
	} else {
		const prepared = await getNarrowRunner(type)!.prepare(exp(type, params), ctxFor(scope)) as { kind: string; userTurn?: string };
		text = prepared.userTurn ?? '';
	}
	return ['AREA-ONE', 'AREA-TWO', 'OUTSIDE-ONE'].filter(m => text.includes(m));
}

test('the adapters for doc.mention, doc.decision-trace and doc.constraint-enumerate forward the area for a module and a file scope and no area for a repo or workspace scope, on both execution modes', async () => {
	// doc.mention (a deterministic lookup: the same runner on both modes)
	const mention = async (scope: ResolvedScope | undefined): Promise<string[]> => {
		const out = await runDocMention(exp('doc.mention', { subject: 'settlement ledger rules' }), ctxFor(scope)) as DocMentionOutput;
		return out.hits.map(h => h.heading).sort();
	};
	assert.deepEqual(await mention(scopes.module), ['AREA-ONE', 'AREA-TWO']);
	assert.deepEqual(await mention(scopes.file), ['AREA-ONE']);
	for (const scope of [scopes.repo, scopes.workspace, undefined]) {
		assert.ok((await mention(scope)).includes('OUTSIDE-ONE'), 'no area: the whole repository competes');
	}

	for (const type of ['doc.decision.trace', 'doc.constraint.enumerate'] as const) {
		for (const mode of ['one-shot', 'multi-turn'] as const) {
			const label = `${type} ${mode}`;
			const mod = await shown(type, scopes.module, mode);
			assert.ok(mod.length > 0 && mod.every(m => m.startsWith('AREA')), `${label} module: only the area's sections: ${mod.join(',')}`);
			assert.deepEqual(await shown(type, scopes.file, mode), ['AREA-ONE'], `${label} file`);
			for (const [name, scope] of [['repo', scopes.repo], ['workspace', scopes.workspace], ['none', undefined]] as const) {
				assert.ok((await shown(type, scope, mode)).includes('OUTSIDE-ONE'), `${label} ${name}: no area, the outside section is retrieved`);
			}
		}
	}
});

test('complete file-scope and module-scope docs plans return no section outside the area through the step executor and the one-shot executor', async () => {
	const { executeSavedPlan, stepSavedPlan } = await import('../../__tests__/fixtures/saved-exploration-executor.js');
	for (const scope of [scopes.module, scopes.file]) {
		const plan = { answerType: 'adherence-check', synthesisHint: 'h', explorations: [exp('doc.mention', { subject: 'settlement ledger rules' })] } as never;
		const args = { connectionExecution: savedAnalysisExecution(REPO), runId: 'r1', repoPath: REPO, closureRepos: [REPO], repoLastIndexedAtMs: 1n, plan, scope };
		const oneShot = await executeSavedPlan(args);
		const stepped = await stepSavedPlan(args);
		assert.equal(stepped.kind, 'done', 'a deterministic plan completes in the step executor');
		if (stepped.kind !== 'done') return;
		for (const [mode, results] of [['one-shot executor', oneShot.results], ['step executor', stepped.executed.results]] as const) {
			const out = results[0]!.output as unknown as DocMentionOutput;
			assert.ok(out.hits.length > 0, `${mode} ${scope.kind}: the area has matches`);
			assert.ok(out.hits.every(h => !h.file.includes('/billing/')), `${mode} ${scope.kind}: no section outside the area`);
		}
	}
});

test('an area with no candidate performs no embedding on either execution mode', async () => {
	const empty = { kind: 'module', value: `${REPO}/docs/none`, repoPath: REPO, lookupPath: `${REPO}/docs/none` } as ResolvedScope;
	_setVectorPassForTest({ embedQuery: async () => { embedded += 1; return [0.1]; } });
	embedded = 0;
	assert.deepEqual(await shown('doc.decision.trace', empty, 'multi-turn'), []);
	assert.deepEqual(await shown('doc.constraint.enumerate', empty, 'one-shot'), []);
	const out = await runDocMention(exp('doc.mention', { subject: 'settlement ledger rules' }), ctxFor(empty)) as DocMentionOutput;
	assert.deepEqual(out.hits, []);
	assert.equal(embedded, 0, 'the query was never embedded');
});
