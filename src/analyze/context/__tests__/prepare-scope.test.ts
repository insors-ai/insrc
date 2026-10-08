/**
 * What the context builder does with a scope before anything else:
 * the pairing check (run mode), then resolution, for every mode; and
 * where the tool loop is told to work.
 *
 * Stand-in readers -- no LMDB, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedConnections } from '../../../daemon/db/config.js';
import type { AnalyzeScopeRef, AnalyzeTarget, ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, LLMProvider, RegisteredRepo } from '../../../shared/types.js';
import { TARGET_TO_KINDS } from '../../classifier/validate.js';
import { prepareScope, ShaperInvalidInputError, _buildToolDepsForTest } from '../driver.js';
import { ScopeKindTargetMismatchError, ScopeNotIndexedError } from '../invariants.js';
import { resolveScope, resolveScopeForTarget } from '../scope.js';
import type { ScopeDeps } from '../scope.js';
import type { ClassificationShapeInput, RunShapeInput, TaskShapeInput } from '../types.js';

const REPO = '/work/app';
const FILE = `${REPO}/src/pay.ts`;

interface Fixture { indexed: boolean }

function deps(f: Fixture = { indexed: true }): ScopeDeps & { calls: string[] } {
	const ent = { id: 'ent-settle', name: 'settle', kind: 'function', file: FILE, startLine: 3 } as unknown as Entity;
	const calls: string[] = [];
	return {
		calls,
		listRepos:           async () => { calls.push('listRepos'); return [{ path: REPO, status: f.indexed ? 'ready' : 'indexing' } as unknown as RegisteredRepo]; },
		findEntitiesByFile:  async (file) => { calls.push('findEntitiesByFile'); return f.indexed && file === FILE ? [ent] : []; },
		listEntitiesForRepo: async () => { calls.push('listEntitiesForRepo'); return f.indexed ? [ent] : []; },
		loadConnections:     async () => {
			calls.push('loadConnections');
			return { file: { connections: [] }, resolved: [{ id: 'ledger-db', kind: 'sqlite' }], warnings: [] } as unknown as LoadedConnections;
		},
	};
}

function intent(target: AnalyzeTarget, ref: AnalyzeScopeRef): ClassifiedIntent {
	return { target, scope: 'M', focused: true, focus: 'q', scopeRef: ref, reasoning: 'test' };
}
const runInput  = (target: AnalyzeTarget, ref: AnalyzeScopeRef): RunShapeInput => ({ intent: intent(target, ref) });
const classInput = (ref: AnalyzeScopeRef): ClassificationShapeInput => ({ scopeRef: ref, userPrompt: 'q' });
const taskInput = (target: AnalyzeTarget, ref: AnalyzeScopeRef): TaskShapeInput =>
	({ intent: intent(target, ref), task: { taskId: 't1' }, upstreamTasks: new Map() } as unknown as TaskShapeInput);

async function rejection(run: () => Promise<unknown>): Promise<Error> {
	try { await run(); } catch (err) { return err as Error; }
	assert.fail('expected a rejection');
}

// ---------------------------------------------------------------------------
// The pairing check
// ---------------------------------------------------------------------------

test('runShaper refuses a pairing the table does not allow before resolving the scope', async () => {
	// A code request on a data connection, arriving with a ready-made intent.
	const d = deps();
	const err = await rejection(() => prepareScope('run', runInput('code', { kind: 'connection', value: 'ledger-db' }), d));
	assert.ok(err instanceof ScopeKindTargetMismatchError, `got ${err.name}: ${err.message}`);
	assert.match(err.message, /scopeRef\.kind='connection' is incompatible with target='code'/);
	assert.match(err.message, /Allowed kinds for this target: repo, module, file, symbol, manifest-dir, workspace\./);
	// Refused BEFORE the scope was resolved: no reader was touched.
	assert.deepEqual(d.calls, []);

	// Other refused pairings.
	for (const [target, kind] of [['data', 'file'], ['infra', 'symbol'], ['docs', 'connection']] as const) {
		const d2 = deps();
		const e = await rejection(() => prepareScope('run', runInput(target, { kind, value: FILE }), d2));
		assert.ok(e instanceof ScopeKindTargetMismatchError, `${target}+${kind}`);
		assert.deepEqual(d2.calls, [], `${target}+${kind}`);
	}
});

test('runShaper accepts every pairing in the corrected table', async () => {
	const valueFor: Record<AnalyzeScopeRef['kind'], string> = {
		repo: REPO, module: `${REPO}/src`, file: FILE, symbol: `${FILE}#settle`,
		connection: 'ledger-db', 'manifest-dir': `${REPO}/deploy`, workspace: REPO,
	};
	let checked = 0;
	for (const [target, kinds] of Object.entries(TARGET_TO_KINDS) as Array<[AnalyzeTarget, ReadonlyArray<AnalyzeScopeRef['kind']>]>) {
		for (const kind of kinds) {
			const scope = await prepareScope('run', runInput(target, { kind, value: valueFor[kind] }), deps());
			assert.equal(scope.kind, kind, `${target}+${kind}`);
			checked += 1;
		}
	}
	assert.equal(checked, 6 + 4 + 3 + 4 + 7);
});

test('the pairing is checked for run mode only: classification and task inputs are not refused', async () => {
	// A classification input has no target yet; a task input was validated when its run started.
	const ref: AnalyzeScopeRef = { kind: 'connection', value: 'ledger-db' };
	assert.equal((await prepareScope('classification', classInput(ref), deps())).kind, 'connection');
	assert.equal((await prepareScope('task', taskInput('code', ref), deps())).kind, 'connection');
});

test('resolveScopeForTarget: every pairing of the table resolves to what resolveScope gives; every other pairing is refused before a reader is touched', async () => {
	const valueFor: Record<AnalyzeScopeRef['kind'], string> = {
		repo: REPO, module: `${REPO}/src`, file: FILE, symbol: `${FILE}#settle`,
		connection: 'ledger-db', 'manifest-dir': `${REPO}/deploy`, workspace: REPO,
	};
	const kinds = Object.keys(valueFor) as Array<AnalyzeScopeRef['kind']>;
	let accepted = 0;
	let refused = 0;
	for (const target of Object.keys(TARGET_TO_KINDS) as AnalyzeTarget[]) {
		for (const kind of kinds) {
			const ref: AnalyzeScopeRef = { kind, value: valueFor[kind] };
			const d = deps();
			if (TARGET_TO_KINDS[target].includes(kind)) {
				const expected = await resolveScope(ref, deps());
				assert.deepEqual(await resolveScopeForTarget(ref, target, d), expected, `${target}+${kind}`);
				// The two callers return the same thing through it.
				assert.deepEqual(await prepareScope('run', runInput(target, ref), deps()), expected, `prepareScope ${target}+${kind}`);
				accepted += 1;
			} else {
				const err = await rejection(() => resolveScopeForTarget(ref, target, d));
				assert.ok(err instanceof ScopeKindTargetMismatchError, `${target}+${kind}: got ${err.name}`);
				assert.ok(
					err.message.endsWith(`Allowed kinds for this target: ${TARGET_TO_KINDS[target].join(', ')}.`),
					`${target}+${kind}: ${err.message}`,
				);
				assert.deepEqual(d.calls, [], `${target}+${kind}`);
				refused += 1;
			}
		}
	}
	assert.equal(accepted, 6 + 4 + 3 + 4 + 7);
	assert.equal(refused, 5 * 7 - accepted);
});

test('prepareScope makes no pairing check outside run mode: a refused pairing resolves to what resolveScope gives', async () => {
	const ref: AnalyzeScopeRef = { kind: 'connection', value: 'ledger-db' };
	const expected = await resolveScope(ref, deps());
	assert.deepEqual(await prepareScope('classification', classInput(ref), deps()), expected);
	// A task input carries an intent, and the table refuses code + connection.
	assert.deepEqual(await prepareScope('task', taskInput('code', ref), deps()), expected);
	// The same input in run mode IS refused.
	const err = await rejection(() => prepareScope('run', taskInput('code', ref) as unknown as RunShapeInput, deps()));
	assert.ok(err instanceof ScopeKindTargetMismatchError, `got ${err.name}`);
});

// ---------------------------------------------------------------------------
// The scope is resolved for every mode
// ---------------------------------------------------------------------------

test('generic and classification-mode requests on a symbol in an unindexed repo fail as not indexed; on a module they proceed', async () => {
	const symbol: AnalyzeScopeRef = { kind: 'symbol', value: `${FILE}#settle` };
	const module: AnalyzeScopeRef = { kind: 'module', value: `${REPO}/src` };
	const unindexed = { indexed: false };

	// The indexed check proper runs only for the code source in run mode.
	// A symbol needs the index for EVERY source and in EVERY mode.
	const generic = await rejection(() => prepareScope('run', runInput('generic', symbol), deps(unindexed)));
	assert.ok(generic instanceof ScopeNotIndexedError, `generic: ${generic.name}: ${generic.message}`);
	assert.equal((generic as ScopeNotIndexedError).registeredAs, REPO);

	const classification = await rejection(() => prepareScope('classification', classInput(symbol), deps(unindexed)));
	assert.ok(classification instanceof ScopeNotIndexedError, `classification: ${classification.name}`);

	// The same two on a module of that repo proceed, as today.
	const g2 = await prepareScope('run', runInput('generic', module), deps(unindexed));
	assert.deepEqual(g2, { kind: 'module', value: `${REPO}/src`, repoPath: REPO, lookupPath: `${REPO}/src` });
	const c2 = await prepareScope('classification', classInput(module), deps(unindexed));
	assert.deepEqual(c2, g2);

	// And in an indexed repo the symbol resolves in both.
	assert.equal((await prepareScope('run', runInput('generic', symbol), deps())).entityId, 'ent-settle');
	assert.equal((await prepareScope('classification', classInput(symbol), deps())).entityId, 'ent-settle');
});

// ---------------------------------------------------------------------------
// The tool loop's path
// ---------------------------------------------------------------------------

test("tool loop's path for classification and task modes is the resolved lookupPath", async () => {
	const provider = {} as unknown as LLMProvider;
	const cases: ReadonlyArray<{ ref: AnalyzeScopeRef; path: string }> = [
		{ ref: { kind: 'module',     value: `${REPO}/src` },     path: `${REPO}/src` },   // its own directory, as before
		{ ref: { kind: 'file',       value: FILE },              path: REPO },            // was the file's directory
		{ ref: { kind: 'symbol',     value: `${FILE}#settle` },  path: REPO },
		{ ref: { kind: 'connection', value: 'ledger-db' },       path: REPO },            // was the working directory
	];
	for (const c of cases) {
		const forClassification = await prepareScope('classification', classInput(c.ref), deps());
		const forTask           = await prepareScope('task', taskInput('generic', c.ref), deps());
		for (const [mode, scope] of [['classification', forClassification], ['task', forTask]] as const) {
			const toolDeps = _buildToolDepsForTest({ runId: 'r1', shaperId: 'generic', invocationMode: mode, scope, provider });
			assert.equal(toolDeps.repoPath, c.path, `${mode} ${c.ref.kind}`);
			assert.deepEqual(toolDeps.closureRepos, [c.path], `${mode} ${c.ref.kind}`);
			assert.notEqual(toolDeps.repoPath, process.cwd(), `${mode} ${c.ref.kind}: not the working directory`);
		}
	}
});

test('inputs that carry neither a scope nor an intent fail as invalid input, not as a bare TypeError', async () => {
	const err = await rejection(() => prepareScope('run', {} as never, deps()));
	assert.ok(err instanceof ShaperInvalidInputError, `got ${err.name}: ${err.message}`);
	assert.match(err.message, /neither a scope nor an intent/);
});
