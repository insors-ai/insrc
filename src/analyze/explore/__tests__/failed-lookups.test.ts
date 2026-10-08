/**
 * A lookup that cannot run is reported as failed, with what it had found,
 * and never as a lookup that found nothing (LLD-b9d5c5c40df5a574-s1, task t7).
 *
 * The rule for a lookup's catch clauses: a clause may return a result only
 * when it handles one named, expected condition AND the result's record says
 * so. Every other clause rethrows, so the executor reports the lookup as
 * failed. The table in this file is the classification of every clause; a
 * test counts the clauses in the source so one added later cannot go
 * unclassified.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDb } from '../../../db/client.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { _classifyShaperErrorForTest as classifyForDaemon } from '../../../daemon/analyze-rpc.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import type { Entity, EntityKind, LLMProvider } from '../../../shared/types.js';
import { ShaperToolLoopExhausted, _runToolLoopForTest } from '../../context/driver.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';
import { retrieveDocSections } from '../../docs-retrieval.js';
import { _classifyShaperErrorForTest as classifyForPlanTree } from '../../orchestrator/driver.js';

import { runCapabilityReuseCheck } from '../capability-reuse-check.js';
import { runConceptResolve } from '../concept-resolve.js';
import { runConfigTrace } from '../config-trace.js';
import { runDbConnectionsList } from '../db-connections-list.js';
import { runDbTableDescribe } from '../db-table-describe.js';
import { runDbTablesList } from '../db-tables-list.js';
import { runDocMention } from '../doc-mention.js';
import { prepareDocConstraintEnumerate, runSharedDocConstraintEnumerate } from '../doc-constraint-enumerate.js';
import { runSharedDocDecisionTrace } from '../doc-decision-trace.js';
import { _getRunnersForTest, _overrideRunnerForTest, executePlan, failedOutput } from '../executor.js';
import { runFreeformProbe } from '../freeform-probe.js';
import { LookupFailedError } from '../lookup-failed.js';
import { manifestBodyUnparsable, runManifestsLocate } from '../manifests-locate.js';
import { runModuleProfile } from '../module-profile.js';
import { runSearchText } from '../search-text.js';
import type { Exploration, ExplorationOutput, ExplorationRunner, ExplorationRunnerContext, ExplorationType, FailedExplorationOutput } from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPLORE = join(HERE, '..');
const NOW = '2026-10-08T10:00:00.000Z';
const isRoot = process.getuid?.() === 0;
const noRoot = { skip: isRoot ? 'permission checks do not apply to root' : false };

// ---------------------------------------------------------------------------
// The classification of every catch clause in the lookup files
// ---------------------------------------------------------------------------

type ClauseClass = `expected: ${string}` | 'rethrow';

/**
 * One row per catch clause that REMAINS in a lookup file, in source order.
 * `after` is text found within the few lines after the clause, so a row is
 * tied to its clause and not just to a count.
 *
 * Fourteen of the twenty-five clauses the design counted are gone: each
 * returned an empty or placeholder result for a lookup that could not run,
 * and was removed so the error reaches the executor. They are listed below
 * the table.
 */
const REMAINING: Record<string, readonly { after: string; cls: ClauseClass }[]> = {
	'capability-reuse-check.ts': [
		{ after: 'the model call that judges the candidates failed', cls: 'rethrow' },
		{ after: 'module.profile failed for candidate', cls: "expected: a candidate module's profile cannot be read; it is named under skipped" },
	],
	'concept-resolve.ts': [
		{ after: 'if (depth === 0) throw err;', cls: 'expected: a directory below the repository root cannot be read; it is named under skipped (the root itself rethrows)' },
		{ after: 'a broken link, or an entry removed while the walk runs', cls: 'expected: an entry cannot be stat-ed; it is named under skipped' },
	],
	'doc-constraint-enumerate.ts': [
		{ after: 'the model call that reads the retrieved sections failed', cls: 'rethrow' },
	],
	'doc-decision-trace.ts': [
		{ after: 'the model call that reads the retrieved sections failed', cls: 'rethrow' },
	],
	'freeform-probe.ts': [
		{ after: 'if (err instanceof ShaperToolLoopExhausted) {', cls: 'rethrow' },
	],
	'manifests-locate.ts': [
		{ after: 'return undefined;', cls: "expected: a manifest's stored content is not valid YAML; the kind falls back to the file name and the file is named under skipped" },
		{ after: 'catch { return true; }', cls: 'expected: the same condition, detected for the record' },
	],
	'module-profile.ts': [
		{ after: "cannot stat '${path}'", cls: 'rethrow' },
		{ after: 'a broken link, or an entry removed while the listing runs', cls: 'expected: a child entry cannot be stat-ed; it is named under skipped' },
		{ after: 'the index still holds a file that is no longer on disk', cls: 'expected: an indexed file is no longer on disk; it is named under skipped' },
	],
};

/** The clauses removed, by file: each one swallowed an error and now the error reaches the executor. */
const REMOVED: Record<string, number> = {
	'search-text.ts': 1,          // the search failed -> empty hits
	'config-trace.ts': 1,         // the search failed -> empty hits
	'db-connections-list.ts': 1,  // the registry could not be read -> "no connections"
	'db-tables-list.ts': 4,       // registry, connection, listTables, listNamespaces -> empty listing
	'db-table-describe.ts': 5,    // registry, connection, and the three describe calls -> empty description
	'module-profile.ts': 2,       // the directory could not be listed -> empty profile; the file's size -> 0
};

const CATCH = /\bcatch\b\s*(\(|\{)/g;

function lookupFiles(): string[] {
	return readdirSync(EXPLORE).filter(f => f.endsWith('.ts') && f !== 'executor.ts' && f !== 'types.ts');
}

test('the count of catch clauses in the lookup files equals the number of classified entries', () => {
	const counted: Record<string, number> = {};
	for (const f of lookupFiles()) {
		const n = (readFileSync(join(EXPLORE, f), 'utf8').match(CATCH) ?? []).length;
		if (n > 0) counted[f] = n;
	}
	const classified = Object.fromEntries(Object.entries(REMAINING).map(([f, rows]) => [f, rows.length]));
	assert.deepEqual(counted, classified, 'every catch clause in a lookup file has a row in REMAINING, and no row is left over');

	// Each row is tied to a clause: its text follows the clause it classifies, in order.
	for (const [f, rows] of Object.entries(REMAINING)) {
		const src = readFileSync(join(EXPLORE, f), 'utf8');
		const positions = [...src.matchAll(CATCH)].map(m => m.index);
		rows.forEach((row, i) => {
			const from = positions[i]!;
			const window = src.slice(from - 200, from + 600);
			assert.ok(window.includes(row.after), `${f}: clause ${i + 1} is the one classified "${row.cls}" (looked for: ${row.after})`);
		});
	}

	// The design counted twenty-five. Eleven of them remain; the twelfth row is
	// the new clause that detects unparsable manifest content for the record.
	const remaining = Object.values(classified).reduce((a, b) => a + b, 0);
	const removed = Object.values(REMOVED).reduce((a, b) => a + b, 0);
	assert.equal(remaining, 12);
	assert.equal(removed, 14);
	assert.equal(remaining - 1 + removed, 25);
	// A removed clause is really gone: those files hold exactly what the table says.
	for (const f of Object.keys(REMOVED)) assert.equal(counted[f] ?? 0, REMAINING[f]?.length ?? 0, f);
	// Every row is one of the two classes, and an expected one names its condition.
	for (const rows of Object.values(REMAINING)) {
		for (const row of rows) assert.match(row.cls, /^(rethrow|expected: .{20,})$/);
	}
});

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

let dir: string;
let REPO: string;
let ctx: ExplorationRunnerContext;
const locked: string[] = [];
const overridden = new Map<ExplorationType, ExplorationRunner | undefined>();

function ent(kind: EntityKind, name: string, rel: string, extra: Partial<Entity> = {}): Entity {
	const file = join(REPO, rel);
	const id = createHash('sha256').update(`${REPO}\x00${file}\x00${kind}\x00${name}`).digest('hex').slice(0, 32);
	return { id, kind, name, language: 'typescript', repoId: 1, repo: REPO, file, startLine: 1, endLine: 5, body: `// ${name}`, embedding: [], indexedAt: NOW, ...extra };
}

function exp(type: ExplorationType, params: Record<string, unknown>): Exploration {
	return { id: `e-${type}`, type, purpose: 'test', params };
}

function write(rel: string, content: string): string {
	const p = join(REPO, rel);
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, content);
	return p;
}

/** Run one lookup through the real executor and return its output. */
async function throughExecutor(e: Exploration): Promise<ExplorationOutput> {
	const res = await executePlan({
		runId: 'test', repoPath: REPO, closureRepos: [REPO], repoLastIndexedAtMs: 1n,
		plan: { answerType: 'structural-map', synthesisHint: 't', explorations: [e] },
	});
	return res.results[0]!.output;
}

/** Replace a registered runner for the length of one test. */
function override(type: ExplorationType, runner: ExplorationRunner): void {
	if (!overridden.has(type)) overridden.set(type, _getRunnersForTest()[type]);
	_overrideRunnerForTest(type, runner);
}

function assertFailed(out: ExplorationOutput, requested: ExplorationType, message: RegExp): FailedExplorationOutput {
	assert.equal(out.type, 'failed', `reported as failed, not as a ${out.type} result`);
	const f = out as FailedExplorationOutput;
	assert.equal(f.requested, requested);
	assert.match(f.message, message);
	return f;
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-failed-lookups-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
	ctx = { runId: 'test', repoPath: REPO, closureRepos: [REPO], readDep: () => undefined, ignoreFilter: permissiveIgnoreFilter(REPO) } as ExplorationRunnerContext;
});

test.afterEach(async () => {
	for (const [type, runner] of overridden) _overrideRunnerForTest(type, runner);
	overridden.clear();
	for (const p of locked.splice(0)) { try { chmodSync(p, 0o755); } catch { /* already gone */ } }
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// rethrow: a lookup that could not run
// ---------------------------------------------------------------------------

test('a text search that throws becomes the failed output (mutation: restore the catch that returns an empty result)', noRoot, async () => {
	write('src/ok.ts', 'needle\n');
	const vault = join(REPO, 'vault');
	mkdirSync(vault);
	writeFileSync(join(vault, 'secret.ts'), 'needle\n');
	chmodSync(vault, 0o000);
	locked.push(vault);

	// The search root cannot be read. Through the REAL executor and the real runner:
	const out = await throughExecutor(exp('search.text', { pattern: 'needle', path: vault }));
	const failed = assertFailed(out, 'search.text', /EACCES/);
	assert.equal('hits' in failed, false, 'not an empty list of hits');

	// config.trace goes through the same search.
	assertFailed(await throughExecutor(exp('config.trace', { key: 'needle', path: vault })), 'config.trace', /EACCES/);

	// The same lookups on a root they can read still succeed.
	const ok = await throughExecutor(exp('search.text', { pattern: 'needle', path: join(REPO, 'src') }));
	assert.equal(ok.type, 'search.text');

	// At the runner: it throws; it does not return.
	await assert.rejects(runSearchText(exp('search.text', { pattern: 'needle', path: vault }), ctx), /EACCES/);
	await assert.rejects(runConfigTrace(exp('config.trace', { key: 'needle', path: vault }), ctx), /EACCES/);
});

test('each class of lookup catch clause has a test: an expected condition says so in the record, anything else is a failed output', noRoot, async () => {
	const db = await getDb();

	// ===== rethrow =====

	// The data lookups: the registry cannot be read, the connection cannot be opened, the call fails.
	const poolFails = (async () => { throw new Error('registry unreadable'); }) as unknown as Parameters<typeof runDbTablesList>[2];
	const pool = (driver: unknown): Parameters<typeof runDbTablesList>[2] => (async () => ({
		list: () => [],
		acquire: async (id: string) => { if (id !== 'app') throw new Error(`unknown connection '${id}'`); return driver; },
	})) as unknown as Parameters<typeof runDbTablesList>[2];
	const boom = async (): Promise<never> => { throw new Error('connection reset'); };

	await assert.rejects(runDbConnectionsList(exp('db.connections.list', {}), ctx, poolFails), /registry unreadable/);
	await assert.rejects(runDbTablesList(exp('db.tables.list', { connectionId: 'app' }), ctx, poolFails), /registry unreadable/);
	await assert.rejects(runDbTablesList(exp('db.tables.list', { connectionId: 'gone' }), ctx, pool({})), /unknown connection 'gone'/);
	await assert.rejects(runDbTablesList(exp('db.tables.list', { connectionId: 'app' }), ctx, pool({ family: 'rdbms', kind: 'pg', listTables: boom })), /connection reset/);
	await assert.rejects(runDbTablesList(exp('db.tables.list', { connectionId: 'app' }), ctx, pool({ family: 'kv', kind: 'redis', listNamespaces: boom })), /connection reset/);
	await assert.rejects(runDbTableDescribe(exp('db.table.describe', { connectionId: 'app', target: 't' }), ctx, poolFails), /registry unreadable/);
	await assert.rejects(runDbTableDescribe(exp('db.table.describe', { connectionId: 'gone', target: 't' }), ctx, pool({})), /unknown connection 'gone'/);
	await assert.rejects(runDbTableDescribe(exp('db.table.describe', { connectionId: 'app', target: 't' }), ctx, pool({ family: 'rdbms', kind: 'pg', describe: boom })), /connection reset/);
	await assert.rejects(runDbTableDescribe(exp('db.table.describe', { connectionId: 'app', target: 't' }), ctx, pool({ family: 'kv', kind: 'redis', describeNamespace: boom })), /connection reset/);
	await assert.rejects(runDbTableDescribe(exp('db.table.describe', { connectionId: 'app', target: 't' }), ctx, pool({ family: 'file', kind: 'csv', describe: boom })), /connection reset/);

	// ...and one of them through the real executor: it is the failed output, with no empty listing.
	override('db.tables.list', (e, c) => runDbTablesList(e, c, pool({ family: 'rdbms', kind: 'pg', listTables: boom })));
	const dbOut = assertFailed(await throughExecutor(exp('db.tables.list', { connectionId: 'app' })), 'db.tables.list', /connection reset/);
	assert.equal('tables' in dbOut, false);

	// module.profile: a path that does not exist, and a directory that cannot be listed.
	assertFailed(await throughExecutor(exp('module.profile', { path: join(REPO, 'no/such/dir') })), 'module.profile', /cannot stat/);
	const sealed = join(REPO, 'sealed');
	mkdirSync(sealed);
	chmodSync(sealed, 0o000);
	locked.push(sealed);
	assertFailed(await throughExecutor(exp('module.profile', { path: sealed })), 'module.profile', /EACCES/);

	// The lookups that call a model: the call fails after the deterministic part found things.
	write('docs/policy.md', 'x');
	await upsertEntities(db, [
		ent('section', 'Refund policy', 'docs/policy.md', { language: 'markdown', artifact: true, body: '## Refund policy\n\nRefunds MUST be issued within 30 days.' }),
		ent('file', 'index.ts', 'src/pay/index.ts'),
	]);
	const modelDown = { completeStructured: async () => { throw new Error('model unavailable'); } } as unknown as LLMProvider;

	const cErr = await runSharedDocConstraintEnumerate({ subject: 'refund', repoPath: REPO, db, provider: modelDown }).then(() => null, (e: unknown) => e);
	assert.ok(cErr instanceof LookupFailedError, 'the constraint lookup throws LookupFailedError, where it returned an empty list with a note');
	assert.match(cErr.message, /the model call that reads the retrieved sections failed: model unavailable/);
	assert.deepEqual(cErr.partial, [{ source: `${join(REPO, 'docs/policy.md')} § Refund policy`, content: '## Refund policy\n\nRefunds MUST be issued within 30 days.' }],
		'the section it had retrieved goes with the failure');
	const dErr = await runSharedDocDecisionTrace({ topic: 'refund', repoPath: REPO, db, provider: modelDown }).then(() => null, (e: unknown) => e);
	assert.ok(dErr instanceof LookupFailedError);
	assert.equal(dErr.partial.length, 1);

	write('src/pay/index.ts', 'export const pay = 1;\n');
	const capErr = await runCapabilityReuseCheck(exp('capability.reuse-check', { capability: 'pay' }), ctx, modelDown).then(() => null, (e: unknown) => e);
	assert.ok(capErr instanceof LookupFailedError, 'the capability check throws, where it showed every candidate as unrelated');
	assert.match(capErr.message, /the model call that judges the candidates failed: model unavailable/);
	assert.ok(capErr.partial.length >= 1 && capErr.partial.every(p => p.content.startsWith('candidate module, not judged')));

	// The executor's conversion carries those findings to the failed output.
	const converted = failedOutput(exp('doc.constraint.enumerate', { subject: 'refund' }), cErr);
	assert.deepEqual(converted.partial, cErr.partial);
	assert.equal(converted.type, 'failed');
	// An error with nothing found has no `partial` field at all.
	assert.equal('partial' in failedOutput(exp('search.text', {}), new Error('x')), false);

	// concept.resolve: the repository root itself cannot be read.
	const gone = join(dir, 'gone-repo');
	await assert.rejects(runConceptResolve(exp('concept.resolve', { query: 'pay' }), { ...ctx, repoPath: gone, ignoreFilter: permissiveIgnoreFilter(gone) }), /ENOENT/);

	// ===== expected: the result is returned and its record says what happened =====

	// concept.resolve: a directory below the root that cannot be read, and a broken link.
	const hidden = join(REPO, 'src', 'hidden');
	mkdirSync(hidden);
	chmodSync(hidden, 0o000);
	locked.push(hidden);
	symlinkSync(join(REPO, 'nowhere'), join(REPO, 'src', 'dangling'));
	const con = await runConceptResolve(exp('concept.resolve', { query: 'pay' }), ctx);
	assert.equal(con.type, 'concept.resolve');
	assert.ok(con.hits.length > 0, 'the walk went on and found the rest');
	const conSkipped = con.completeness.skipped ?? [];
	// `sealed` is the directory locked earlier in this test: it is below the root, so it is skipped too.
	assert.deepEqual(conSkipped.map(s => s.what).sort(), [join(REPO, 'src/dangling'), hidden, sealed].sort());
	assert.match(conSkipped.find(s => s.what === hidden)!.reason, /could not be read \(EACCES\)/);
	assert.equal(con.completeness.complete, false);

	// module.profile: a child that cannot be stat-ed, and an indexed file that is no longer on disk.
	await upsertEntities(db, [ent('file', 'deleted.ts', 'src/pay/deleted.ts')]);
	symlinkSync(join(REPO, 'nowhere'), join(REPO, 'src', 'pay', 'dangling.ts'));
	const prof = await runModuleProfile(exp('module.profile', { path: join(REPO, 'src/pay') }), ctx);
	assert.deepEqual(prof.profile.filesInDir.map(f => f.file), [join(REPO, 'src/pay/index.ts')], 'the readable child is still listed');
	assert.deepEqual((prof.completeness.skipped ?? []).map(s => s.what).sort(), [join(REPO, 'src/pay/dangling.ts'), join(REPO, 'src/pay/deleted.ts')].sort());
	assert.equal(prof.completeness.complete, false);

	// manifests.locate: stored content that is not valid YAML; the kind is the file name's guess.
	await upsertEntities(db, [ent('document', 'web-deployment.yaml', 'k8s/web-deployment.yaml', { language: 'yaml', artifact: true, body: 'kind: :::not: valid: {[' })]);
	assert.equal(manifestBodyUnparsable('kubernetes', 'kind: :::not: valid: {['), true);
	assert.equal(manifestBodyUnparsable('kubernetes', 'kind: Service\n'), false);
	assert.equal(manifestBodyUnparsable('docker', 'kind: :::not: valid: {['), false, 'only kubernetes and helm content is read as YAML');
	const man = await runManifestsLocate(exp('manifests.locate', {}), ctx);
	const hit = man.hits.find(h => h.file === join(REPO, 'k8s/web-deployment.yaml'))!;
	assert.equal(hit.resourceKind, 'Deployment', 'the file name was the fallback');
	assert.deepEqual(man.completeness.skipped, [{ what: hit.file, reason: 'its stored content is not valid YAML, so its kind is a guess from the file name' }]);

	// capability.reuse-check: a candidate whose profile cannot be read is still judged, and named.
	await upsertEntities(db, [ent('file', 'pay_ghost.ts', 'src/ghost/pay_ghost.ts')]);   // in the graph, not on disk
	const judged = { completeStructured: async () => ({ verdicts: [] }) } as unknown as LLMProvider;
	const cap = await runCapabilityReuseCheck(exp('capability.reuse-check', { capability: 'pay ghost', limit: 12 }), ctx, judged);
	const ghost = (cap.completeness.skipped ?? []).find(s => s.what === join(REPO, 'src/ghost/pay_ghost.ts'));
	assert.ok(ghost, 'the candidate whose profile failed is named');
	assert.match(ghost.reason, /its profile could not be read/);
});

// ---------------------------------------------------------------------------
// The document retrieval's two passes
// ---------------------------------------------------------------------------

test('a document lookup says when the search by meaning did not run and only keyword matches are in the result', async () => {
	// The retrieval has a vector pass and a keyword pass. With no embedding
	// backend active (as in this process) the vector pass does not run. That
	// used to be silent; it is an expected condition, so the result is returned
	// and its record says what is not in it.
	const db = await getDb();
	await upsertEntities(db, [
		ent('section', 'Refund policy', 'docs/policy.md', { language: 'markdown', artifact: true, body: '## Refund policy\n\nRefunds MUST be issued within 30 days.' }),
	]);
	write('docs/policy.md', 'x');

	const report: { vectorPassSkipped?: string } = {};
	const sections = await retrieveDocSections({ db, query: 'refund', closureRepos: [REPO], report });
	assert.equal(sections.length, 1, 'the keyword pass still found the section');
	assert.match(report.vectorPassSkipped ?? '', /no embedding of the query is available/);

	const men = await runDocMention(exp('doc.mention', { subject: 'refund' }), ctx);
	assert.equal(men.hits.length, 1);
	assert.deepEqual(men.completeness.skipped, [{
		what:   "the document index's search by meaning",
		reason: "no embedding of the query is available (the embedding backend is not active); only sections that contain the query's words are included",
	}]);
	assert.equal(men.completeness.complete, false);

	// The lookups that read the sections with a model carry the same fact from prepare.
	const prep = await prepareDocConstraintEnumerate({ subject: 'refund', repoPath: REPO, db });
	if (prep.kind !== 'narrow-llm') throw new Error('the fixture has a section that mentions refund');
	assert.equal(prep.prepared.completenessFacts?.skipped?.[0]?.what, "the document index's search by meaning");

	// A caller that passes no report is unaffected.
	assert.equal((await retrieveDocSections({ db, query: 'refund', closureRepos: [REPO] })).length, 1);
});

// ---------------------------------------------------------------------------
// The free-form lookup
// ---------------------------------------------------------------------------

test('the free-form lookup at its turn limit is a failed output whose partial holds the tool results gathered', async () => {
	const gathered = [
		{ source: 'search_grep(pattern=charge)', content: 'src/pay/charge.ts:1: charge' },
		{ source: 'file_read(path=src/pay/charge.ts)', content: 'export function charge() {}' },
	];
	const exhausted = (async () => { throw new ShaperToolLoopExhausted(40, gathered); }) as unknown as Parameters<typeof runFreeformProbe>[2];

	// Through the real executor: a failed output, where it used to be an empty bundle with a note.
	override('freeform.probe', (e, c) => runFreeformProbe(e, c, exhausted));
	const out = assertFailed(await throughExecutor(exp('freeform.probe', { purpose: 'find charge', shaperId: 'code' })), 'freeform.probe', /the search did not finish: .*maxToolTurns=40/);
	assert.deepEqual(out.partial, gathered);
	assert.equal('rawBundle' in out, false);

	// Any other failure of the loop still fails the lookup, with nothing to carry.
	override('freeform.probe', (e, c) => runFreeformProbe(e, c, (async () => { throw new Error('model unavailable'); }) as unknown as Parameters<typeof runFreeformProbe>[2]));
	const other = assertFailed(await throughExecutor(exp('freeform.probe', { purpose: 'find charge', shaperId: 'code' })), 'freeform.probe', /model unavailable/);
	assert.equal(other.partial, undefined);

	// The loop itself: its limit error carries every tool call it made and what came back.
	registerBuiltinTools();
	let turn = 0;
	const alwaysCallsATool = {
		complete: async () => ({
			text: '', stopReason: 'tool_use',
			toolCalls: [{ id: `c${++turn}`, name: 'insrc_no_such_tool', input: { q: `q${turn}` } }],
		}),
	} as unknown as LLMProvider;
	const err = await _runToolLoopForTest(alwaysCallsATool, [{ role: 'user', content: 'go' }], {} as Parameters<typeof _runToolLoopForTest>[2], 3)
		.then(() => null, (e: unknown) => e);
	assert.ok(err instanceof ShaperToolLoopExhausted);
	assert.equal(err.toolResults.length, 3, 'one entry per tool call made before the limit');
	assert.match(err.toolResults[0]!.source, /^insrc_no_such_tool\(/);
	assert.match(err.toolResults[0]!.content, /Unknown tool: insrc_no_such_tool/);
});

test("a free-form answer's record has basis 'model-directed' and is not complete", async () => {
	const answered = (async () => ({
		rawBundle: { system: 's', focus: 'f', summary: 'found things', structure: '', surface: '', artefacts: '', upstream: '' },
		toolCallCount: 4,
	})) as unknown as Parameters<typeof runFreeformProbe>[2];
	const out = await runFreeformProbe(exp('freeform.probe', { purpose: 'find charge', shaperId: 'code' }), ctx, answered);
	assert.equal(out.completeness.basis, 'model-directed');
	assert.equal(out.completeness.complete, false, 'a search a model chose is never established complete');
	assert.match(out.completeness.basisNote ?? '', /a model chose what to search, in 4 tool calls/);
	assert.equal(out.rawBundle.summary, 'found things');
});

test("both mapping functions put the gathered tool results in the data of 'shaper-tool-loop-exhausted'", () => {
	const gathered = [{ source: 'search_grep(pattern=x)', content: 'a.ts:1: x' }];
	const err = new ShaperToolLoopExhausted(40, gathered);
	for (const [name, classify] of [['the plan tree', classifyForPlanTree], ['the daemon', classifyForDaemon]] as const) {
		const mapped = classify(err);
		assert.equal(mapped.code, 'shaper-tool-loop-exhausted', `${name}: the code is unchanged`);
		assert.deepEqual(mapped.data, { toolResults: gathered }, `${name}: what the tools returned is in the error's data`);
	}
	// An error built the old way carries an empty list, not undefined.
	assert.deepEqual(classifyForDaemon(new ShaperToolLoopExhausted(40)).data, { toolResults: [] });
});
