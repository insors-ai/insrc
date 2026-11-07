/**
 * capability.reuse-check on a named area (Story 65b643840a294422/s1, task
 * t10): the named module, file or symbol is the subject of the check even
 * when no word of the capability appears in it, a ranked child never
 * replaces it, and a symbol subject is read by its entity id. Both
 * execution modes: the one-shot runner (model passed in) and the
 * multi-turn prepare/finalize pair. Real graph store and directory tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { savedAnalysisExecution } from '../../connection-access.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';
import { resolveScopeForTarget, type ResolvedScope } from '../../context/scope.js';
import type { Entity, LLMMessage, LLMProvider } from '../../../shared/types.js';
import { finalizeCapabilityReuseCheck, prepareCapabilityReuseCheck, runCapabilityReuseCheck } from '../capability-reuse-check.js';
import { getNarrowRunner } from '../executor.js';
import type { CapabilityReuseCheckOutput, Exploration, ExplorationRunnerContext } from '../types.js';

let sandbox: string;
let repo: string;
const file = (...parts: string[]): string => join(repo, ...parts);

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'capability-reuse-anchor-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	for (const dir of ['src/pay/refund', 'src/billing', 'src/empty']) mkdirSync(join(repo, dir), { recursive: true });
	const files = ['src/pay/settle.ts', 'src/pay/refund/refund.ts', 'src/billing/invoice.ts'];
	for (const f of files) writeFileSync(join(repo, f), '');
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	const fileEntity = (f: string): Record<string, unknown> => ({ id: `f-${f}`, repo, file: file(f), kind: 'file', name: f.split('/').pop(), language: 'typescript', startLine: 1, endLine: 1 });
	const fn = (id: string, f: string, name: string): Record<string, unknown> => ({ id, repo, file: file(f), kind: 'function', name, language: 'typescript', startLine: 1, endLine: 2, exported: true });
	await upsertEntities(null, [
		...files.map(fileEntity),
		fn('e-settle', 'src/pay/settle.ts', 'settlePayment'),
		fn('e-refund', 'src/pay/refund/refund.ts', 'refundPayment'),
		fn('e-invoice', 'src/billing/invoice.ts', 'sendInvoice'),
	] as unknown as Entity[]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

function ctxFor(scope: ResolvedScope): ExplorationRunnerContext {
	return {
		connectionExecution: savedAnalysisExecution(repo), runId: 'r1', repoPath: repo, closureRepos: [repo], scope,
		readDep: () => undefined, ignoreFilter: permissiveIgnoreFilter(repo),
	};
}

const exp = (capability: string): Exploration =>
	({ id: 'e1', type: 'capability.reuse-check', purpose: 'p', params: { capability } }) as Exploration;

/** A model that records what it was shown and calls every candidate in the user turn a partial match. */
function recordingModel(): { provider: LLMProvider; turns: string[] } {
	const turns: string[] = [];
	const provider = {
		completeStructured: async (messages: LLMMessage[]) => {
			const turn = String(messages[1]!.content);
			turns.push(turn);
			const paths = [...turn.matchAll(/path: (\S+)/g)].map(m => m[1]!);
			return { verdicts: paths.map(path => ({ path, verdict: 'partial-match', rationale: 'r' })) };
		},
	} as unknown as LLMProvider;
	return { provider, turns };
}

/**
 * The check on both execution modes: the one-shot runner (the model is passed in)
 * and the multi-turn pair (the narrow runner's prepare, then finalize with the
 * verdicts an outer model gives for the candidates the user turn lists).
 */
async function bothModes(capability: string, scope: ResolvedScope): Promise<{ oneShot: CapabilityReuseCheckOutput; multiTurn: CapabilityReuseCheckOutput; oneShotTurn: string; multiTurnTurn: string }> {
	const model = recordingModel();
	const oneShot = await runCapabilityReuseCheck(exp(capability), ctxFor(scope), model.provider);
	const narrow = getNarrowRunner('capability.reuse-check');
	assert.ok(narrow !== undefined, 'the multi-turn mode has a narrow runner for it');
	const prepared = await narrow.prepare(exp(capability), ctxFor(scope)) as Awaited<ReturnType<typeof prepareCapabilityReuseCheck>>;
	assert.equal(prepared.kind, 'narrow-llm');
	if (prepared.kind !== 'narrow-llm') throw new Error('unreachable');
	const paths = [...prepared.userTurn.matchAll(/path: (\S+)/g)].map(m => m[1]!);
	const multiTurn = finalizeCapabilityReuseCheck(prepared.prepared, { verdicts: paths.map(path => ({ path, verdict: 'partial-match' as const, rationale: 'r' })) }, undefined, 'r1');
	return { oneShot, multiTurn, oneShotTurn: model.turns[0]!, multiTurnTurn: prepared.userTurn };
}

const scopeOf = (kind: 'module' | 'file' | 'symbol', value: string): Promise<ResolvedScope> => resolveScopeForTarget({ kind, value }, 'code');

test('a capability question with no word in common with the named module still inspects that module, first, on the one-shot and the multi-turn mode', async () => {
	const dir = file('src', 'pay');
	const scope = await scopeOf('module', dir);

	// one-shot
	const model = recordingModel();
	const oneShot = await runCapabilityReuseCheck(exp('zebra crossing'), ctxFor(scope), model.provider);
	assert.equal(oneShot.candidates[0]?.path, dir, 'the named module is the first candidate');
	assert.equal(oneShot.candidates[0]?.namedByRequest, true);
	assert.match(model.turns[0]!, new RegExp(`1\\. path: ${dir}\\b`));
	assert.match(model.turns[0]!, /subject: the request named this area/);
	assert.ok(oneShot.candidates.every(c => c.path === dir || c.path.startsWith(`${dir}/`)), 'every candidate lies in the area');

	// multi-turn: prepare, then finalize with the outer model's verdicts
	const narrow = getNarrowRunner('capability.reuse-check');
	assert.ok(narrow !== undefined, 'the multi-turn mode has a narrow runner for it');
	const prepared = await narrow.prepare(exp('zebra crossing'), ctxFor(scope)) as Awaited<ReturnType<typeof prepareCapabilityReuseCheck>>;
	assert.equal(prepared.kind, 'narrow-llm');
	if (prepared.kind !== 'narrow-llm') return;
	assert.equal(prepared.prepared.profiles[0]?.path, dir);
	assert.equal(prepared.prepared.profiles[0]?.profile?.entityCount, 2, 'profiled through the containing repository: the module and its child hold two entities');
	const finalized = finalizeCapabilityReuseCheck(prepared.prepared, { verdicts: [{ path: dir, verdict: 'unrelated', rationale: 'nothing about zebras' }] }, undefined, 'r1');
	assert.equal(finalized.candidates[0]?.path, dir);
	assert.equal(finalized.candidates[0]?.verdict, 'unrelated');
});

test('a higher-ranked child does not replace the named subject, on both execution modes', async () => {
	const dir = file('src', 'pay');
	const scope = await scopeOf('module', dir);
	const { oneShot, multiTurn } = await bothModes('refund', scope);
	for (const [mode, out] of [['one-shot', oneShot], ['multi-turn', multiTurn]] as const) {
		const paths = out.candidates.map(c => c.path);
		assert.equal(paths[0], dir, `${mode}: the named module comes first`);
		assert.ok(paths.includes(file('src', 'pay', 'refund')), `${mode}: the child that matches the words is also a candidate`);
		assert.equal(out.candidates.filter(c => c.namedByRequest === true).length, 1, mode);
	}
	// a request that names nothing (workspace scope) behaves as before: ranked candidates, none marked
	const whole = await resolveScopeForTarget({ kind: 'workspace', value: repo }, 'code');
	const ranked = await bothModes('refund', whole);
	for (const out of [ranked.oneShot, ranked.multiTurn]) {
		assert.ok(out.candidates.length > 0);
		assert.ok(out.candidates.every(c => c.namedByRequest === undefined));
	}
});

test('a symbol subject is handled by entity id on both execution modes: its file is the candidate, its name the only evidence', async () => {
	const settle = file('src', 'pay', 'settle.ts');
	const scope = await scopeOf('symbol', `${settle}#settlePayment`);
	assert.equal(scope.entityId, 'e-settle');
	const { oneShot, multiTurn, oneShotTurn, multiTurnTurn } = await bothModes('zebra crossing', scope);
	for (const [mode, out, turn] of [['one-shot', oneShot, oneShotTurn], ['multi-turn', multiTurn, multiTurnTurn]] as const) {
		assert.equal(out.candidates.length, 1, mode);
		assert.deepEqual([out.candidates[0]?.path, out.candidates[0]?.entityId, out.candidates[0]?.namedByRequest], [settle, 'e-settle', true], mode);
		assert.deepEqual(out.candidates[0]?.evidenceEntities, ['settlePayment'], mode);
		assert.match(turn, /the request named this one symbol \(settlePayment\)/, mode);
	}
});

test('an empty named area is checked on both execution modes and its completeness says there was nothing in it', async () => {
	const dir = file('src', 'empty');
	const scope = await scopeOf('module', dir);
	const { oneShot, multiTurn } = await bothModes('anything at all', scope);
	for (const [mode, out] of [['one-shot', oneShot], ['multi-turn', multiTurn]] as const) {
		assert.equal(out.candidates[0]?.path, dir, `${mode}: the area is still the subject, not a short-circuit`);
		assert.match(JSON.stringify(out.completeness), /holds no stored entity/, `${mode}: the record states that the area held nothing`);
	}
});

test('a limit of one leaves the named subject as the only candidate on both execution modes, although a child matches the words better', async () => {
	const dir = file('src', 'pay');
	const scope = await scopeOf('module', dir);
	const limited = { id: 'e1', type: 'capability.reuse-check', purpose: 'p', params: { capability: 'refund', limit: 1 } } as Exploration;

	const model = recordingModel();
	const oneShot = await runCapabilityReuseCheck(limited, ctxFor(scope), model.provider);
	assert.deepEqual(oneShot.candidates.map(c => c.path), [dir], 'one-shot: only the named module is checked');

	const narrow = getNarrowRunner('capability.reuse-check');
	assert.ok(narrow !== undefined);
	const prepared = await narrow.prepare(limited, ctxFor(scope)) as Awaited<ReturnType<typeof prepareCapabilityReuseCheck>>;
	assert.equal(prepared.kind, 'narrow-llm');
	if (prepared.kind !== 'narrow-llm') return;
	assert.deepEqual(prepared.prepared.profiles.map(p => p.path), [dir], 'multi-turn: only the named module is profiled');
	assert.equal([...prepared.userTurn.matchAll(/path: (\S+)/g)].length, 1, 'and only it is put to the model');
	// the cut is stated, not silent
	assert.match(JSON.stringify(oneShot.completeness), /candidate modules/);
});
