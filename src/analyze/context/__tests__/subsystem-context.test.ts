/**
 * Epic c2ba6fa6, Story s8, t7 -- the analyzer's subsystem context. Over a
 * sandbox store with stored subsystems, withSubsystemContext and the real
 * runShaper (its pipeline steps stand-ins, so no model is reached): a request
 * about one module names its subsystem, summary and connections, each a stored
 * row (ac3); existing layer text is kept; the cache never holds the block, and
 * subsystems stored after a bundle was cached show on the next serve; without a
 * repository or stored subsystems the bundle is unchanged; only a file with a
 * stored subsystem row selects a subsystem; a cite at the end of a sentence,
 * with a #L anchor or of a root-level file selects too; a whole-repository
 * scope lists every subsystem without its files, keeping the full block for
 * cited ones; a store that cannot be read leaves the bundle unchanged.
 *
 * Run: npx tsx --test src/analyze/context/__tests__/subsystem-context.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _runShaperAtEntryForTest as runShaper } from '../index.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { writeSubsystemSummary, writeSubsystems } from '../../../db/subsystems.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import { PATHS } from '../../../shared/paths.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import type { ExecutedPlan, ExplorationPlan } from '../../explore/types.js';
import { _realPipelineStepsForTest, type PipelineSteps } from '../driver.js';
import { buildCompleteness } from '../../completeness.js';
import { withSubsystemContext } from '../subsystem-context.js';
import type { AnalyzeContextBundle } from '../types.js';

useTemporaryLance();

let sandbox: string;
let repo: string;
const runIds: string[] = [];
test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'insrc-s8-context-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	mkdirSync(join(repo, 'src', 'parse'), { recursive: true });
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
	await upsertEntities(null, [{ id: 'e-lex', repo, file: `${repo}/src/parse/lexer.ts`, kind: 'function', name: 'lex', language: 'typescript', startLine: 1, endLine: 3 } as unknown as Entity]);
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
	for (const id of runIds.splice(0)) rmSync(PATHS.analyzeContext(id), { recursive: true, force: true });
});

const PARSE = { id: 'p1', name: 'src/parse', files: ['src/parse/lexer.ts', 'src/parse/tokens.ts'], entityCount: 2, connections: [] };
const STORE = { id: 's1', name: 'src/store', files: ['src/store/db.ts'], entityCount: 1, connections: [{ to: 'p1', weight: 1.8, kinds: { IMPORTS: 1, CALLS: 1 } }] };
async function storeSubsystems(): Promise<void> {
	await writeSubsystems(repo, 0, [PARSE, STORE]);
	await writeSubsystemSummary(repo, 'p1', 'Turns text into tokens with lex and token.', 'cheap');
	await writeSubsystemSummary(repo, 's1', 'Loads rows, lexing their text first.', 'cheap');
}
const bundle = (over: Partial<AnalyzeContextBundle> = {}): AnalyzeContextBundle => ({ system: 'sys', focus: 'f', summary: 'sum', structure: 'existing structure', surface: 'su', artefacts: 'a', upstream: 'u', ...over });

test('s8 t7 (ac3): a request about one module names its subsystem, summary and connections, each a stored row, after the existing structure', async () => {
	await storeSubsystems();
	const out = await withSubsystemContext(bundle(), repo, join(repo, 'src/store'));
	assert.ok(out.structure.startsWith('existing structure\n\n### Subsystems'), 'the existing layer text is kept, the block follows it');
	assert.match(out.structure, /#### Subsystem src\/store\n\nLoads rows, lexing their text first\./);
	assert.match(out.structure, /Connections:\n {2}- src\/parse \(weight 1\.8; IMPORTS 1, CALLS 1\)/, 'connections by the other subsystem\'s name');
	assert.match(out.structure, /Files \(1\):\n {2}- src\/store\/db\.ts/);
	assert.doesNotMatch(out.structure, /#### Subsystem src\/parse/, 'only the subsystem of the scope');
	assert.match(out.structure, /_Note: the groups rest on an incomplete graph\._/, 'this sandbox repository has no complete graph recorded');
	for (const layer of ['system', 'focus', 'summary', 'surface', 'artefacts', 'upstream'] as const) assert.equal(out[layer], bundle()[layer]);
});

test('s8 t7: only a file with a stored subsystem row selects a subsystem; other path-like text is ignored', async () => {
	await storeSubsystems();
	const cites = bundle({ artefacts: 'see src/parse/tokens.ts:12 and docs/notes/plan.md and /etc/hosts.conf' });
	const out = await withSubsystemContext(cites, repo, undefined);
	assert.match(out.structure, /#### Subsystem src\/parse/);
	assert.doesNotMatch(out.structure, /#### Subsystem src\/store/);
	assert.deepEqual(await withSubsystemContext(bundle({ artefacts: 'see docs/notes/plan.md:3' }), repo, undefined), bundle({ artefacts: 'see docs/notes/plan.md:3' }), 'a cited path with no row selects nothing');
});

test('s8 t7: a cite at the end of a sentence, with a #L anchor, or of a root-level file selects its subsystem', async () => {
	const ROOT = { id: 'r1', name: 'main.ts', files: ['main.ts'], entityCount: 1, connections: [] };
	await writeSubsystems(repo, 0, [PARSE, STORE, ROOT]);
	const names = (b: AnalyzeContextBundle) => [...b.structure.matchAll(/#### Subsystem (\S+)/g)].map(m => m[1]);
	assert.deepEqual(names(await withSubsystemContext(bundle({ summary: 'It starts in src/parse/tokens.ts.' }), repo, undefined)), ['src/parse'], 'end of a sentence');
	assert.deepEqual(names(await withSubsystemContext(bundle({ summary: 'see src/store/db.ts#L10' }), repo, undefined)), ['src/store'], 'a #L anchor');
	assert.deepEqual(names(await withSubsystemContext(bundle({ summary: 'the entry point is main.ts:4' }), repo, undefined)), ['main.ts'], 'a root-level file');
});

test('s8 t7: a whole-repository scope lists every subsystem by name and summary without its files, keeping the full block for a cited one', async () => {
	await storeSubsystems();
	for (const scope of [repo, '.', '']) {
		const out = await withSubsystemContext(bundle({ artefacts: 'see src/store/db.ts:3' }), repo, scope);
		assert.match(out.structure, /#### Subsystem src\/parse\n\nTurns text into tokens with lex and token\.\n\nFiles: 2 \(not listed\)/, `scope '${scope}': the uncited subsystem is compact`);
		assert.doesNotMatch(out.structure, /src\/parse\/lexer\.ts/, `scope '${scope}': its files are not listed`);
		assert.match(out.structure, /#### Subsystem src\/store\n\nLoads rows[\s\S]*Files \(1\):\n {2}- src\/store\/db\.ts/, `scope '${scope}': the cited subsystem keeps its full block`);
	}
});

test('s8 t7: when the stored subsystems cannot be read the bundle is served unchanged', async () => {
	await storeSubsystems();
	await closeGraphStore();
	const notADir = join(sandbox, 'not-a-dir');
	writeFileSync(notADir, 'x');
	setGraphStorePath(join(notADir, 'graph.lmdb'));
	assert.deepEqual(await withSubsystemContext(bundle(), repo, join(repo, 'src/store')), bundle());
});

test('s8 t7: without a repository or stored subsystems the bundle is unchanged', async () => {
	assert.deepEqual(await withSubsystemContext(bundle(), repo, join(repo, 'src/parse')), bundle(), 'nothing stored yet');
	await storeSubsystems();
	assert.deepEqual(await withSubsystemContext(bundle(), null, join(repo, 'src/parse')), bundle(), 'no repository');
	assert.deepEqual(await withSubsystemContext(bundle(), repo, join(repo, 'lib')), bundle(), 'a scope no subsystem holds');
});

test('s8 t7: the cache never holds the block, and subsystems stored after a bundle was cached show on the next serve', async () => {
	const RAW = { system: 'sys', focus: 'Intent focus: none', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u' };
	let synthesized = 0;
	const steps: PipelineSteps = {
		..._realPipelineStepsForTest,
		decompose: async () => ({ answerType: 'structural-map', synthesisHint: 'h', explorations: [{ id: 'e1', type: 'module.profile', purpose: 'p', params: { path: '/x' } }] } as unknown as ExplorationPlan),
		executePlan: async (a) => ({ plan: a.plan, results: a.plan.explorations.map(e => ({ exploration: e, output: { type: e.type, completeness: buildCompleteness({ returned: 1, basis: 'graph' }) } as never, cached: false, elapsedMs: 0 })), elapsedMs: 0, cacheHits: 0, cacheMisses: 0 } as unknown as ExecutedPlan),
		synthesize: async () => { synthesized++; return RAW; },
	};
	const noModel = new Proxy({}, { get: (_t, p) => p === 'then' ? undefined : () => { throw new Error('no model'); } }) as unknown as LLMProvider;
	const fresh = () => { const id = `s8-context-${Math.floor(Math.random() * 1e9).toString(16)}`; runIds.push(id); return id; };
	const runId = fresh();
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: false, scopeRef: { kind: 'module', value: join(repo, 'src/parse') }, reasoning: 'r' };
	const serve = (id = runId) => runShaper({ promptPath: 'prompts/analyze/code.system.md', invocationMode: 'run', shaperId: 'code', inputs: { intent }, opts: { runId: id }, provider: noModel, pipelineSteps: steps });

	const first = await serve();
	assert.equal(first.structure, 'st', 'nothing stored: no block');

	await storeSubsystems();
	const second = await serve();
	assert.equal(synthesized, 1, 'the second serve is a cache hit');
	assert.match(second.structure, /^st\n\n### Subsystems[\s\S]*#### Subsystem src\/parse\n\nTurns text into tokens with lex and token\./);

	// A bundle built afresh (another run, a cache miss) gets the block too.
	const built = await serve(fresh());
	assert.equal(synthesized, 2);
	assert.match(built.structure, /^st\n\n### Subsystems/);

	const dir = PATHS.analyzeContext(runId);
	assert.ok(existsSync(dir));
	const cached = readdirSync(dir, { recursive: true }).map(String).map(f => join(dir, f)).filter(f => statSync(f).isFile()).map(f => readFileSync(f, 'utf8'));
	assert.ok(cached.length > 0 && cached.some(c => c.includes('"structure"')), 'the bundle was cached');
	assert.ok(cached.every(c => !c.includes('### Subsystems')), 'the cache never holds the block');
});
