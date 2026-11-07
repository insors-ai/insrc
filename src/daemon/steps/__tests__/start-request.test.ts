/**
 * The scope check the step tool's start, plan and narrow phases all make
 * (stepScope): a path that does not exist, a path of the wrong kind, a '..'
 * path into another registered repository and a scope in another repository
 * are refused before anything is read, and a relative path resolves against
 * the call's repository.
 *
 * Stand-in readers and a real temporary directory tree -- no LMDB, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LoadedConnections } from '../../db/config.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { upsertEntities } from '../../../db/entities.js';
import { handleAnalyzeStep } from '../analyze-step/handler.js';
import { decodeState, encodeState, STATE_VERSION, type StepStatePayload } from '../analyze-step/state.js';
import '../../../workflow/__tests__/helpers/converted-repos.js';
import { ScopeNotFoundError, ScopeRepoMismatchError } from '../../../analyze/context/invariants.js';
import type { ScopeDeps } from '../../../analyze/context/scope.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, RegisteredRepo } from '../../../shared/types.js';
import { stepScope } from '../analyze-step/scope.js';
import { measureResolvedScope } from '../../../analyze/measure.js';

const ROOT = mkdtempSync(join(tmpdir(), 'insrc-start-request-'));
setGraphStorePath(join(ROOT, 'graph.lmdb'));
const A = join(ROOT, 'a');
const B = join(ROOT, 'b');
mkdirSync(join(A, 'src'), { recursive: true });
mkdirSync(join(B, 'src'), { recursive: true });
writeFileSync(join(A, 'src', 'x.ts'), '');
writeFileSync(join(B, 'src', 'y.ts'), '');

function deps(): ScopeDeps {
	return {
		listRepos: async () => [A, B].map(path => ({ path, status: 'ready' }) as unknown as RegisteredRepo),
		findEntitiesByFile:  async () => [],
		listEntitiesForRepo: async (repo) => [{ id: 'e1', repo } as unknown as Entity],
		loadConnections:     async () => ({ file: { connections: [] }, resolved: [], warnings: [] }) as unknown as LoadedConnections,
	};
}

function intent(kind: 'module' | 'file' | 'workspace', value: string): Pick<ClassifiedIntent, 'target' | 'scopeRef'> {
	return { target: 'code', scopeRef: { kind, value } };
}

test('the real start, plan and narrow scope check refuses a nonexistent path, a wrong path kind, a \'..\' path into another repository and a repository mismatch', async () => {
	// start, plan and narrow all call stepScope(intent, undefined, execution, repoPath): one hook for the three phases.
	await assert.rejects(stepScope(intent('module', join(A, 'src', 'nope')), deps(), undefined, A), ScopeNotFoundError);
	await assert.rejects(stepScope(intent('file', join(A, 'src', 'nope.ts')), deps(), undefined, A), ScopeNotFoundError);
	await assert.rejects(stepScope(intent('file', join(A, 'src')), deps(), undefined, A), ScopeNotFoundError);
	await assert.rejects(stepScope(intent('module', join(A, 'src', 'x.ts')), deps(), undefined, A), ScopeNotFoundError);
	// '..' enters the other registered repository: refused for the call's repository, accepted for the other's
	const sneaky = join(A, '..', 'b', 'src', 'y.ts');
	await assert.rejects(stepScope(intent('file', sneaky), deps(), undefined, A), ScopeRepoMismatchError);
	const own = await stepScope(intent('file', sneaky), deps(), undefined, B);
	assert.equal(own.filePath, join(B, 'src', 'y.ts'));
	// a module in the other repository
	await assert.rejects(stepScope(intent('module', join(B, 'src')), deps(), undefined, A), ScopeRepoMismatchError);
	// valid scopes pass, and a relative path resolves against the call's repository
	const mod = await stepScope(intent('module', join(A, 'src')), deps(), undefined, A);
	assert.equal(mod.lookupPath, join(A, 'src'));
	const rel = await stepScope(intent('module', 'src/./'), deps(), undefined, A);
	assert.equal(rel.lookupPath, join(A, 'src'));
	assert.equal(rel.value, join(A, 'src'));
	// a workspace scope is untouched
	const ws = await stepScope(intent('workspace', A), deps(), undefined, A);
	assert.equal(ws.lookupPath, A);
	// no expected repository (a caller that does not pass one): the repository comparison is skipped, the stat still runs
	await assert.rejects(stepScope(intent('module', join(A, 'src', 'nope')), deps()), ScopeNotFoundError);
});


test('the plan phase through the real handler refuses a nonexistent path, a wrong path kind and a raw \'..\' path into another registered repository, from the state token', async () => {
	for (const repo of [A, B]) {
		await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
		await upsertEntities(null, [{ id: `e-${repo}`, repo, file: join(repo, 'src', 'x.ts'), kind: 'function', name: 'fn', language: 'typescript', startLine: 1, endLine: 2 } as unknown as Entity]);
	}
	const planWith = async (kind: 'module' | 'file', value: string) => {
		const payload: StepStatePayload = {
			version: STATE_VERSION, runId: 'req-run', repoPath: A, repoIndexedAt: null,
			intent: { target: 'code', scope: 'M', focused: true, focus: 'q', scopeRef: { kind, value }, reasoning: 'r' },
			synthesizerKey: 'code', stage: 'awaiting_plan',
		};
		const state = await encodeState(payload);
		const envelope = await handleAnalyzeStep({ phase: 'plan', state, plan: { answerType: 'structural-map', synthesisHint: 'x', explorations: [] } });
		return JSON.parse((envelope.content[0] as { text: string }).text) as { next: string; error?: { code: string; message: string } };
	};
	const missing = await planWith('module', `${A}/src/nope`);
	assert.equal(missing.next, 'error');
	assert.equal(missing.error?.code, 'scope-not-found');
	const wrongKind = await planWith('file', `${A}/src`);
	assert.equal(wrongKind.error?.code, 'scope-not-found');
	// a raw string: the '..' reaches the handler unnormalised
	const sneaky = await planWith('file', `${A}/../b/src/y.ts`);
	assert.equal(sneaky.error?.code, 'scope-repo-mismatch');
	assert.match(sneaky.error?.message ?? '', /not in the call's repository/);
});

test('a valid request mints a state whose intent has the named scope, context and scopeSource request and measures the area that scope names; an invalid one is refused at start', async () => {
	for (const repo of [A, B]) {
		await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' }).catch(() => undefined);
		await upsertEntities(null, [{ id: `e-${repo}`, repo, file: join(repo, 'src', 'x.ts'), kind: 'function', name: 'fn', language: 'typescript', startLine: 1, endLine: 2 } as unknown as Entity]);
	}
	// entities outside the module exist BEFORE the call, in two more files, so the repository is a larger size than the module
	await upsertEntities(null, [
		{ id: 'e-outside-1', repo: A, file: join(A, 'other', 'z.ts'), kind: 'function', name: 'z1', language: 'typescript', startLine: 1, endLine: 2 },
		{ id: 'e-outside-2', repo: A, file: join(A, 'other', 'w.ts'), kind: 'function', name: 'z2', language: 'typescript', startLine: 3, endLine: 4 },
	] as unknown as Entity[]);
	const start = async (request: unknown) => {
		const envelope = await handleAnalyzeStep({ phase: 'start', repo: A, request });
		return JSON.parse((envelope.content[0] as { text: string }).text) as { next: string; state: string; error?: { code: string } };
	};
	const ok = await start({ question: 'how does it work', scopeRef: { kind: 'module', value: join(A, 'src') }, context: 'background' });
	assert.equal(ok.next, 'emit_plan');
	const decoded = await decodeState(ok.state);
	assert.deepEqual(decoded.intent.scopeRef, { kind: 'module', value: join(A, 'src') });
	assert.equal(decoded.intent.context, 'background');
	assert.equal(decoded.intent.scopeSource, 'request');
	assert.equal(decoded.repoPath, A);
	// the size is the one measured from the named area, not from the whole repository
	const moduleMeasure = await measureResolvedScope(await stepScope({ target: 'code', scopeRef: { kind: 'module', value: join(A, 'src') } }, undefined, undefined, A), 'code');
	const wholeMeasure  = await measureResolvedScope(await stepScope({ target: 'code', scopeRef: { kind: 'workspace', value: A } }, undefined, undefined, A), 'code');
	assert.ok(moduleMeasure.items < wholeMeasure.items, `the module holds fewer entities (${moduleMeasure.items}) than the repository (${wholeMeasure.items})`);
	assert.equal(decoded.intent.scope, moduleMeasure.size);
	assert.notEqual(moduleMeasure.size, wholeMeasure.size, 'the module and the repository are different sizes, so the minted size can only come from the module');

	// a prompt-only call still starts, on the workspace scope
	const prompt = JSON.parse(((await handleAnalyzeStep({ phase: 'start', repo: A, focus: 'how does it work' })).content[0] as { text: string }).text) as { state: string };
	const promptState = await decodeState(prompt.state);
	assert.deepEqual(promptState.intent.scopeRef, { kind: 'workspace', value: A });
	assert.equal(promptState.intent.scopeSource, 'prompt');

	// refused at start, before any state is minted
	const missing = await start({ question: 'q', scopeRef: { kind: 'module', value: join(A, 'src', 'nope') } });
	assert.equal(missing.next, 'error');
	assert.equal(missing.error?.code, 'scope-not-found');
	const wrongKind = await start({ question: 'q', scopeRef: { kind: 'file', value: join(A, 'src') } });
	assert.equal(wrongKind.error?.code, 'scope-not-found');
	const sneaky = await start({ question: 'q', scopeRef: { kind: 'file', value: `${A}/../b/src/y.ts` } });
	assert.equal(sneaky.error?.code, 'scope-repo-mismatch');
});

test('the narrow phase through the real handler repeats the scope check on resume: a nonexistent path and a raw \'..\' path into another registered repository are refused', async () => {
	for (const repo of [A, B]) {
		await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' }).catch(() => undefined);
		await upsertEntities(null, [{ id: `e-${repo}`, repo, file: join(repo, 'src', 'x.ts'), kind: 'function', name: 'fn', language: 'typescript', startLine: 1, endLine: 2 } as unknown as Entity]);
	}
	const narrowWith = async (kind: 'module' | 'file', value: string) => {
		const state: StepStatePayload = {
			version: STATE_VERSION, runId: 'req-narrow', repoPath: A, repoIndexedAt: 1_720_000_000_000,
			intent: { target: 'code', scope: 'M', focused: true, focus: 'q', scopeRef: { kind, value }, reasoning: 'r' },
			synthesizerKey: 'adherence', stage: 'awaiting_narrow',
			plan: { answerType: 'adherence-check', synthesisHint: 'test', explorations: [{ id: 'e1', type: 'doc.decision.trace', purpose: 'p', params: { topic: 't' } }] },
			narrow: {
				explorationId: 'e1', explorationType: 'doc.decision.trace',
				preparedBlob: { topic: 't', retrievedSectionCount: 0, validEntityIds: [] },
				resumeState: { results: [], outputs: [], totalCached: 0, totalMsSoFar: 0 },
			},
		};
		const envelope = await handleAnalyzeStep({ phase: 'narrow', explorationId: 'e1', narrow: { topic: 't', decisions: [], notFoundNote: '' }, state: await encodeState(state) });
		return JSON.parse((envelope.content[0] as { text: string }).text) as { next: string; error?: { code: string } };
	};
	const missing = await narrowWith('module', `${A}/src/nope`);
	assert.equal(missing.next, 'error');
	assert.equal(missing.error?.code, 'scope-not-found');
	const wrongKind = await narrowWith('file', `${A}/src`);
	assert.equal(wrongKind.error?.code, 'scope-not-found');
	const wrongModule = await narrowWith('module', `${A}/src/x.ts`);
	assert.equal(wrongModule.error?.code, 'scope-not-found');
	const sneaky = await narrowWith('file', `${A}/../b/src/y.ts`);
	assert.equal(sneaky.error?.code, 'scope-repo-mismatch');
});

const LAYERS = { system: 's', focus: 'f', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u' };

test('a state token lacking context and scopeSource still drives the plan and bundle phases and the report says the origin was not recorded; the same intent renders the same scope line through a narrow continuation; request, prompt and older payloads differ', async () => {
	for (const repo of [A, B]) {
		await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' }).catch(() => undefined);
		await upsertEntities(null, [{ id: `e-${repo}`, repo, file: join(repo, 'src', 'x.ts'), kind: 'function', name: 'fn', language: 'typescript', startLine: 1, endLine: 2 } as unknown as Entity]);
	}
	type Source = 'request' | 'prompt' | undefined;
	const intentFor = (source: Source): StepStatePayload['intent'] => ({
		target: 'code', scope: 'M', focused: true, focus: 'q', scopeRef: { kind: 'workspace', value: A }, reasoning: 'r',
		...(source !== undefined ? { scopeSource: source } : {}),
	});
	const call = async (input: Record<string, unknown>): Promise<{ next: string; state: string; markdown?: string; report?: { scope?: unknown } }> =>
		JSON.parse(((await handleAnalyzeStep(input as never)).content[0] as { text: string }).text);

	/** plan (no explorations) -> bundle: the rendered answer's head lines */
	const viaPlan = async (source: Source): Promise<string[]> => {
		const state = await encodeState({ version: STATE_VERSION, runId: `plan-${source}`, repoPath: A, repoIndexedAt: null, intent: intentFor(source), synthesizerKey: 'code', stage: 'awaiting_plan' });
		const planned = await call({ phase: 'plan', state, plan: { answerType: 'structural-map', synthesisHint: 'x', explorations: [] } });
		assert.equal(planned.next, 'emit_bundle');
		const done = await call({ phase: 'bundle', state: planned.state, bundle: LAYERS });
		assert.equal(done.next, 'done');
		return done.markdown!.split('\n').filter(l => l.startsWith('Scope:'));
	};
	/** narrow -> bundle */
	const viaNarrow = async (source: Source): Promise<string[]> => {
		const state = await encodeState({
			version: STATE_VERSION, runId: `narrow-${source}`, repoPath: A, repoIndexedAt: 1_720_000_000_000, intent: intentFor(source),
			synthesizerKey: 'adherence', stage: 'awaiting_narrow',
			plan: { answerType: 'adherence-check', synthesisHint: 'h', explorations: [{ id: 'e1', type: 'doc.decision.trace', purpose: 'p', params: { topic: 't' } }] },
			narrow: { explorationId: 'e1', explorationType: 'doc.decision.trace', preparedBlob: { topic: 't', retrievedSectionCount: 0, validEntityIds: [] }, resumeState: { results: [], outputs: [], totalCached: 0, totalMsSoFar: 0 } },
		});
		const narrowed = await call({ phase: 'narrow', explorationId: 'e1', narrow: { topic: 't', decisions: [], notFoundNote: '' }, state });
		assert.equal(narrowed.next, 'emit_bundle');
		const done = await call({ phase: 'bundle', state: narrowed.state, bundle: LAYERS });
		assert.equal(done.next, 'done');
		return done.markdown!.split('\n').filter(l => l.startsWith('Scope:'));
	};

	const lines: Record<string, string> = {};
	for (const source of ['request', 'prompt', undefined] as const) {
		const direct = await viaPlan(source);
		const continued = await viaNarrow(source);
		assert.equal(direct.length, 1, `${source}: one scope line`);
		assert.deepEqual(continued, direct, `${source}: a narrow continuation renders the same scope line`);
		lines[String(source)] = direct[0]!;
	}
	assert.match(lines['request']!, /named by the request/);
	assert.match(lines['prompt']!, /the caller named no scope/);
	assert.match(lines['undefined']!, /whether the caller named it was not recorded/, 'a token minted before the fields existed');
	assert.equal(new Set(Object.values(lines)).size, 3, 'a structured workspace request, a prompt-only call and an older token render differently');
});

test.after(async () => { await closeGraphStore(); rmSync(ROOT, { recursive: true, force: true }); });
