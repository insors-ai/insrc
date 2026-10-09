/**
 * The run checks its scope once before it plans (Story s7, task t13).
 *
 * After the run context is built and before the planner is asked, runAnalyze
 * resolves the intent's scope with the function every plan task uses. For a
 * docs run this is the first place the index is checked.
 *
 * Whole runs over a sandboxed graph store. The model is a stand-in that gives
 * each schema its smallest valid answer, so the run context builds; it keeps
 * the roles it was asked for, which is how the planner's call is seen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { AnalyzeScopeRef, AnalyzeTarget } from '../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import { runAnalyze } from '../driver.js';
import { purgeRunForTests, readRunRecord } from '../persistence.js';
import type { AnalyzeRunEvent, RunRecord } from '../types.js';

let sandbox: string;
/** A directory that no registered repo contains. */
let unregistered: string;
/** A registered repo with stored entities. */
let indexed: string;

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'analyze-scope-before-plan-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	unregistered = join(sandbox, 'proj');
	indexed = join(sandbox, 'reg');
	for (const dir of [unregistered, indexed]) {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'notes.md'), '# notes\n', 'utf8');
	}
	// The registry is readable and holds a repo, so the indexed check is live.
	await addRepo(null, { path: indexed, name: indexed, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	const fixtureFile = `${indexed}/index.ts`;
	await upsertEntities(null, [{
		id: makeEntityId(indexed, fixtureFile, 'function', 'fn'), repo: indexed, file: fixtureFile, kind: 'function', name: 'fn',
		language: 'typescript', startLine: 1, endLine: 3,
	} as unknown as Entity]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

/** The smallest value a JSON schema accepts. */
function smallest(schema: unknown): unknown {
	const s = (schema ?? {}) as Record<string, unknown>;
	if (s['const'] !== undefined) return s['const'];
	if (Array.isArray(s['enum'])) return s['enum'][0];
	const type = Array.isArray(s['type']) ? s['type'][0] : s['type'];
	const properties = s['properties'] as Record<string, unknown> | undefined;
	if (type === 'object' || properties !== undefined) {
		const out: Record<string, unknown> = {};
		for (const key of (s['required'] as string[] | undefined) ?? Object.keys(properties ?? {})) out[key] = smallest(properties?.[key]);
		return out;
	}
	if (type === 'array') return Array.from({ length: (s['minItems'] as number | undefined) ?? 0 }, () => smallest(s['items']));
	if (type === 'string') return 'x'.repeat(Math.max(1, (s['minLength'] as number | undefined) ?? 1));
	if (type === 'number' || type === 'integer') return (s['minimum'] as number | undefined) ?? 0;
	if (type === 'boolean') return false;
	return null;
}

interface Run {
	readonly result:  Awaited<ReturnType<typeof runAnalyze>>;
	readonly events:  AnalyzeRunEvent[];
	/** The roles a model was asked for, in order. */
	readonly roles:   string[];
	readonly record:  RunRecord | null;
}

async function run(target: AnalyzeTarget, scopeRef: AnalyzeScopeRef): Promise<Run> {
	const runId = `scope-before-plan-${target}-${Math.floor(Math.random() * 1e9).toString(16)}`;
	const roles: string[] = [];
	const model = { completeStructured: async (_m: unknown, schema: unknown) => smallest(schema) } as unknown as LLMProvider;
	const routing = { router: { resolveProviderForRole: (role: string) => { roles.push(role); return { provider: model }; } } } as unknown as RoutingSeamContext;
	const events: AnalyzeRunEvent[] = [];
	try {
		const result = await runWithRoutingContext(routing, () => runAnalyze(
			{ runId, userPrompt: 'what is here', scopeRef, targetHint: target, scopeHint: 'S' },
			{ onEvent: e => { events.push(e); } },
		));
		return { result, events, roles, record: readRunRecord(runId) };
	} finally {
		purgeRunForTests(runId);
	}
}

const plannerStarted = (r: Run): boolean => r.events.some(e => e.type === 'stage-substep' && e.substep === 'planner');
const outcome = (r: Run): string => r.result.ok ? 'ok' : `${r.result.stage}/${r.result.error.code}`;

test("a docs run on a scope in no registered repo ends at stage 'plan' with 'scope-not-indexed' before the planner is called; a refused pairing still ends at 'classify'; a generic run is not checked (mutation: remove the check before planning)", async () => {
	// --- a docs run on a directory that no registered repo contains ---
	const docs = await run('docs', { kind: 'repo', value: unregistered });
	assert.equal(outcome(docs), 'plan/scope-not-indexed');
	if (docs.result.ok) return;
	assert.match(docs.result.error.message, /no registered repo contains the scope path/);
	// The failure carries what the scope error carries: the path, and that it is registered nowhere.
	assert.deepEqual(docs.result.error.data, { scopePath: unregistered, registeredAs: undefined });
	assert.equal(docs.result.intent?.target, 'docs');
	// The run context WAS built (its two model steps ran) and the planner was not asked.
	assert.deepEqual(docs.roles, ['analyze.decompose', 'analyze.synthesize']);
	assert.ok(!docs.roles.includes('analyze.plan'));
	assert.equal(plannerStarted(docs), false, "the 'planner' step never started");
	assert.ok(!docs.events.some(e => e.type === 'plan-accepted'));
	// The record says the same, and 'done' fired once.
	assert.deepEqual([docs.record?.status, docs.record?.stage, docs.record?.error?.code], ['failed', 'plan', 'scope-not-indexed']);
	assert.equal(docs.events.filter(e => e.type === 'done').length, 1);

	// --- a docs run on an indexed repo: checked, passes, and the planner is asked ---
	const docsIndexed = await run('docs', { kind: 'repo', value: indexed });
	assert.deepEqual(docsIndexed.roles, ['analyze.decompose', 'analyze.synthesize', 'analyze.plan']);
	assert.equal(plannerStarted(docsIndexed), true);
	// (The stand-in's smallest answer is not a plan: the planner's own, known failure.)
	assert.equal(outcome(docsIndexed), 'plan/plan-builder-schema-unrecoverable');

	// --- a generic run is not checked: on the same unregistered directory it reaches the planner ---
	const generic = await run('generic', { kind: 'repo', value: unregistered });
	assert.deepEqual(generic.roles, ['analyze.decompose', 'analyze.synthesize', 'analyze.plan']);
	assert.equal(plannerStarted(generic), true);
	assert.notEqual(outcome(generic), 'plan/scope-not-indexed');

	// --- infra and data do not read the stored graph: not refused on an unregistered directory ---
	for (const target of ['infra', 'data'] as const) {
		const r = await run(target, { kind: 'repo', value: unregistered });
		assert.ok(r.roles.includes('analyze.plan'), `${target}: the planner was asked`);
		assert.notEqual(outcome(r), 'plan/scope-not-indexed', target);
	}

	// --- a code, infra or data run on an indexed repo plans as before ---
	for (const target of ['code', 'infra', 'data'] as const) {
		const r = await run(target, { kind: 'repo', value: indexed });
		assert.deepEqual(r.roles, ['analyze.decompose', 'analyze.synthesize', 'analyze.plan'], target);
		assert.equal(plannerStarted(r), true, target);
	}
	// A code run on the unregistered directory is refused by the context builder, as before: no model at all.
	const code = await run('code', { kind: 'repo', value: unregistered });
	assert.equal(outcome(code), 'plan/scope-not-indexed');
	assert.deepEqual(code.roles, []);

	// --- a pairing the family's row refuses still ends at 'classify', before anything is built ---
	for (const [target, scopeRef] of [
		['docs', { kind: 'symbol', value: `${join(indexed, 'index.ts')}#fn` }],
		['infra', { kind: 'file', value: join(indexed, 'notes.md') }],
		['code', { kind: 'connection', value: 'ledger-db' }],
	] as const) {
		const r = await run(target, scopeRef);
		assert.equal(outcome(r), 'classify/scope-ref-kind-target-mismatch', target);
		assert.deepEqual(r.roles, [], target);
		assert.ok(!r.events.some(e => e.type === 'stage-started' && e.stage === 'plan'), target);
		assert.deepEqual([r.record?.status, r.record?.stage, r.record?.error?.code], ['failed', 'classify', 'scope-ref-kind-target-mismatch'], target);
	}
});
