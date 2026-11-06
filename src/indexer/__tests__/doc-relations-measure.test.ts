/**
 * Epic c2ba6fa6, Story s10, t8 -- the measurement against the hand-checked
 * set. The set's validation (duplicates, conflicting labels, canonical
 * identity, at least 100 distinct implied links) and the normalisation of
 * proposals; the figures over the population readers admit; docRelations.measure
 * queueing a measurement whose figures switch proposals on or leave them off;
 * a provider failure that records no figures.
 *
 * Run: npx tsx --test src/indexer/__tests__/doc-relations-measure.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import { findEntitiesByFile } from '../../db/entities.js';
import { documentRelations, readDocRelationQualityInTxn, storedFilesInTxn, switchOf, writeDocRelationQualityInTxn } from '../../db/doc-relations.js';
import type { DbClient } from '../../db/client.js';
import type { IndexJob, LLMMessage, LLMProvider } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import { CliExitError } from '../../agent/providers/cli-provider.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { examineDocument, runDocRelationsPass } from '../doc-relations-pass.js';
import {
	canonicalTarget,
	checkDocRelationsSet,
	computeDocRelationFigures,
	DocRelationsSetInvalid,
	parseCheckedSet,
	runDocRelationsMeasurement,
} from '../doc-relations-measure.js';
import { docRelationsSetHash } from '../doc-relations-read.js';
import { measureDocRelations } from '../../daemon/doc-relations-rpc.js';
import { methodClasses } from '../../daemon/threads/method-class.js';
import type { DocRelationsSelection } from '../doc-relations-provider.js';

useTemporaryLance();

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;
let store: string;
let repo: string;
let svc: IndexerService;
const N = 110;

const write = (rel: string, text: string): void => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
const writeSet = (links: unknown[]): void => write('.insrc/doc-relations-checked.json', JSON.stringify({ links }));
const p = (from: string, to: string): string => `${from}\0${to}`;

/** A fake provider proposing, for docs/guide.md, the first `right` modules and `wrong` other files. */
function proposer(right: number, wrong: number): LLMProvider {
	return {
		capabilities: {},
		async completeStructured<T>(messages: LLMMessage[]): Promise<T> {
			const user = String(messages.find(m => m.role === 'user')!.content);
			const source = /^- ([0-9a-f]{32})  lines /m.exec(user)![1]!;   // the document's section
			const proposals = [
				...Array.from({ length: right }, (_, i) => ({ source, target: `src/m${i}.ts`, rationale: `module ${i}` })),
				...Array.from({ length: wrong }, (_, i) => ({ source, target: `src/x${i}.ts`, rationale: 'wrong' })),
				{ source, target: 'docs/other.md', rationale: 'already linked' },
			];
			return { proposals } as T;
		},
	} as unknown as LLMProvider;
}
const using = (provider: LLMProvider) => (): DocRelationsSelection => ({ ok: true, provider, modelId: 'm1' });

async function setUp(): Promise<void> {
	const lines = Array.from({ length: N }, (_, i) => `The m${i} module handles part ${i}.`);
	write('docs/guide.md', `# Guide\nSee [other](other.md).\n${lines.join('\n')}\n`);
	write('docs/other.md', '# Other\nText.\n');
	for (let i = 0; i < N; i++) write(`src/m${i}.ts`, `export function m${i}(): void {}\n`);
	for (let i = 0; i < 5; i++) write(`src/x${i}.ts`, `export function x${i}(): void {}\n`);
	writeSet([
		...Array.from({ length: N }, (_, i) => ({ from: 'docs/guide.md', to: `src/m${i}.ts`, real: true })),
		{ from: 'docs/guide.md', to: 'docs/other.md', real: true },      // an extracted real link
	]);
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'pending' });
	svc = new IndexerService(db, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'ready' }]);
}
const quality = async () => readDocRelationQualityInTxn(await getGraphStore(), (await lookupRepoId(repo))!);

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s10-t8-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s10-t8-repo-')));
});
test.afterEach(async () => {
	svc?.disposeSubsystemScheduler();
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

test('s10 t8: set validation and proposal normalisation', async () => {
	assert.deepEqual(parseCheckedSet(JSON.stringify({ links: [
		{ from: './docs/a.md', to: 'docs/b.md#part', real: true },
		{ from: 'docs/a.md', to: './src/x.ts#run', real: true },
		{ from: 'docs/a.md', to: 'src/y.ts', real: false },
	] })), {
		documents: ['docs/a.md'],
		links: [
			{ from: 'docs/a.md', to: 'docs/b.md', real: true },        // a document's anchor is dropped
			{ from: 'docs/a.md', to: 'src/x.ts#run', real: true },     // a code symbol is kept
			{ from: 'docs/a.md', to: 'src/y.ts', real: false },
		],
	});
	assert.throws(() => parseCheckedSet(JSON.stringify({ links: [{ from: 'docs/a.md', to: 'src/x.ts', real: true }, { from: './docs/a.md', to: 'src/x.ts', real: true }] })), /appears twice/);
	assert.throws(() => parseCheckedSet(JSON.stringify({ links: [{ from: 'docs/a.md', to: 'src/x.ts', real: true }, { from: 'docs/a.md', to: 'src/x.ts', real: false }] })), /both real and not real/);
	assert.throws(() => parseCheckedSet(JSON.stringify({ links: [{ from: 'docs/a.md', to: '../outside.ts', real: true }] })), DocRelationsSetInvalid);
	// Aliases of one path are one link: separators and dot segments are normalised before the pair check.
	assert.throws(() => parseCheckedSet(JSON.stringify({ links: [{ from: 'docs/a.md', to: 'src/x.ts', real: true }, { from: 'docs\\a.md', to: 'src\\sub\\..\\x.ts', real: true }] })), /appears twice/);
	assert.throws(() => parseCheckedSet(JSON.stringify({ links: [{ from: 'docs/a.md', to: 'src/./x.ts', real: true }, { from: 'docs/a.md', to: 'src//x.ts', real: false }] })), /both real and not real/);
	assert.throws(() => parseCheckedSet(JSON.stringify({ links: [{ from: 'docs/a.md', to: 'src\\..\\..\\x.ts', real: true }] })), DocRelationsSetInvalid);
	assert.throws(() => parseCheckedSet('{"items": []}'), /no links array/);
	assert.equal(canonicalTarget('docs/b.md#Heading'), 'docs/b.md');
	assert.equal(canonicalTarget('src/x.ts#fn'), 'src/x.ts#fn');

	// Fewer than 100 distinct implied links -- the extracted link does not count.
	await setUp();
	writeSet([...Array.from({ length: 99 }, (_, i) => ({ from: 'docs/guide.md', to: `src/m${i}.ts`, real: true })), { from: 'docs/guide.md', to: 'docs/other.md', real: true }]);
	await assert.rejects(checkDocRelationsSet(repo), /holds 99 distinct implied real links; at least 100/);
	await assert.rejects(measureDocRelations({ repoPath: repo }, { enqueue: () => assert.fail('nothing is queued') }), DocRelationsSetInvalid);

	// Proposals are normalised to the same identity before they are compared with the set.
	const guide = (await findEntitiesByFile(db, join(repo, 'docs/guide.md'))).find(e => e.kind === 'section')!;
	const files = storedFilesInTxn(await getGraphStore(), (await lookupRepoId(repo))!);
	const answer = { capabilities: {}, async completeStructured() { return { proposals: [
		{ source: guide.id, target: './src/m1.ts', rationale: 'r' },
		{ source: guide.id, target: 'src\\m2.ts', rationale: 'r' },
		{ source: guide.id, target: 'src/sub/../m3.ts#m3', rationale: 'r' },
		{ source: guide.id, target: 'docs/other.md#Other', rationale: 'r' },     // a document's anchor is dropped: it is the written link
		{ source: guide.id, target: '../outside.ts', rationale: 'r' },
	] }; } } as unknown as LLMProvider;
	const r = await examineDocument({ provider: answer, repoPath: repo, relFile: 'docs/guide.md', text: '# Guide\n', sources: [guide], files });
	assert.deepEqual(r.admitted.map(x => x.target), ['src/m1.ts', 'src/m2.ts', 'src/m3.ts#m3']);
	assert.equal(r.repeated, 1, 'docs/other.md#Other is the written link to docs/other.md');
	assert.equal(r.unresolved, 1, 'a path outside the repository');
});

test('s10 t8: quality computation over admitted and implied links', () => {
	const written = new Set(Array.from({ length: 100 }, (_, i) => p('docs/a.md', `docs/l${i}.md`)));
	const real = new Set([...written, ...Array.from({ length: 120 }, (_, i) => p('docs/a.md', `src/m${i}.ts`))]);
	// 100 proposals that repeat the document's own links, plus 5 wrong ones.
	const proposed = new Set([...written, ...Array.from({ length: 5 }, (_, i) => p('docs/a.md', `src/wrong${i}.ts`))]);
	const f = computeDocRelationFigures({ proposed, written, real });
	assert.deepEqual([f.proposed, f.right, f.precision], [5, 0, 0], 'the repeats are cleared: 0 of 5 admitted are right');
	assert.equal(f.checked, 120, 'only implied links count toward the 100');
	assert.equal(f.recall, 0);
	assert.equal(f.extractedRecovery, 1);
	assert.equal(switchOf({ figures: { ...f, modelId: 'm', setHash: 'h', measuredAt: 'now' }, extraction: { state: 'ok', examined: 0, failed: 0, updatedAt: 'now' } }, 'm', 'h'), 'off');

	const good = computeDocRelationFigures({ proposed: new Set(Array.from({ length: 80 }, (_, i) => p('docs/a.md', `src/m${i}.ts`))), written, real });
	assert.deepEqual([good.proposed, good.right, good.found, good.precision], [80, 80, 80, 1]);
	assert.equal(good.recall, 80 / 120);
});

test('s10 t8: docRelations.measure records figures over a 100+ link fixture; below the bar reads exclude proposals', async () => {
	await setUp();
	assert.equal(methodClasses.classOf('docRelations.measure'), 'indexing');
	const queued: IndexJob[] = [];
	const answer = await measureDocRelations({ repoPath: repo }, { enqueue: j => queued.push(j) });
	const setHash = docRelationsSetHash(repo)!;
	assert.deepEqual(answer, { queued: true, setHash, checked: N });
	assert.deepEqual(queued, [{ kind: 'doc-relations-measure', repoPath: repo, setHash }]);

	// 70 right of 110 implied and 2 wrong: precision 70/72, recall 70/110 -> on.
	const on = await runDocRelationsMeasurement({ repoPath: repo, setHash, select: using(proposer(70, 2)) });
	assert.equal(on!.checked, N);
	assert.equal(on!.proposed, 72, 'the repeat of the written link is not admitted');
	assert.equal(on!.precision, 70 / 72);
	assert.equal(on!.recall, 70 / N);
	assert.equal(on!.extractedRecovery, 1);
	assert.deepEqual((await quality())!.figures, on, 'recorded');
	assert.equal(switchOf(await quality(), 'm1', setHash), 'on');
	assert.equal(switchOf(await quality(), 'm1', 'another-set'), 'off', 'a changed set is not covered');

	// 50 right: recall 50/110 -> off; the proposals the pass stores are then not read.
	const off = await runDocRelationsMeasurement({ repoPath: repo, setHash, select: using(proposer(50, 0)) });
	assert.equal(off!.recall, 50 / N);
	const state = switchOf(await quality(), 'm1', setHash);
	assert.equal(state, 'off');
	await runDocRelationsPass({ repoPath: repo, select: using(proposer(50, 0)) });
	const guide = (await findEntitiesByFile(db, join(repo, 'docs/guide.md'))).find(e => e.kind === 'section')!;
	const read = await documentRelations(guide.id, 'out', { state, modelId: 'm1' });
	assert.ok(!read.rows.some(r => r.evidence === 'model'), 'below the bar no proposal is read');
	assert.equal((await documentRelations(guide.id, 'out', { state: 'on', modelId: 'm1' })).rows.filter(r => r.evidence === 'model').length, 50, 'though they are stored');
});

test('s10 t8: measurement provider failure creates or keeps the row with extraction unavailable', async () => {
	await setUp();
	const setHash = docRelationsSetHash(repo)!;
	const signedOut = { capabilities: {}, async completeStructured() { throw new CliExitError('claude exited 1', 'not signed in'); } } as unknown as LLMProvider;
	assert.equal(await quality(), undefined, 'no quality row yet');
	assert.equal(await runDocRelationsMeasurement({ repoPath: repo, setHash, select: using(signedOut) }), undefined);
	const created = (await quality())!;
	assert.equal(created.figures, undefined, 'no figures');
	assert.equal(created.extraction.state, 'unavailable');
	assert.match(created.extraction.reason!, /claude exited 1/);

	const figures = { checked: 110, proposed: 72, right: 70, found: 70, precision: 70 / 72, recall: 70 / 110, extractedRecovery: 1, modelId: 'm1', setHash, measuredAt: '2026-11-04T00:00:00.000Z' };
	const repoId = (await lookupRepoId(repo))!;
	await withWriteTxn(t => writeDocRelationQualityInTxn(t, repoId, { figures, extraction: { state: 'ok', examined: 2, failed: 0, updatedAt: 'x' } }));
	await runDocRelationsMeasurement({ repoPath: repo, setHash, select: () => ({ ok: false, reason: 'the mid tier runs ollama, which is not a CLI provider' }) });
	assert.deepEqual((await quality())!.figures, figures, 'existing figures are kept');
	assert.equal((await quality())!.extraction.state, 'unavailable');
	assert.match((await quality())!.extraction.reason!, /not a CLI provider/);

	// A set edited after the request is not measured.
	writeSet([{ from: 'docs/guide.md', to: 'src/m0.ts', real: true }]);
	assert.equal(await runDocRelationsMeasurement({ repoPath: repo, setHash, select: using(proposer(70, 2)) }), undefined);
	assert.deepEqual((await quality())!.figures, figures);
	assert.match((await quality())!.extraction.reason!, /set changed after the measurement was requested/);
});
