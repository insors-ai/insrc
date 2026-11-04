/**
 * Epic c2ba6fa6, Story s10, t7 -- the document-relations pass over a real
 * indexed repository with a fake mid-tier provider that records its calls:
 * calls are serial and only for new or changed documents (a reindex of an
 * unchanged repository sends none); a document edited, or a full index begun,
 * while it is examined publishes nothing; an unavailable provider records the
 * cause, arms the scheduler's retry, and the retry recovers with no file
 * event; a proposal's value is checked, resolved and cleared of links the
 * document already writes.
 *
 * Run: npx tsx --test src/indexer/__tests__/doc-relations-pass.test.ts
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
import { beginFullIndexState } from '../../db/index-state.js';
import { deleteDocRelationRowInTxn, readDocRelationQualityInTxn, readDocRelationRowsInTxn, storedFilesInTxn, writeDocRelationRowInTxn } from '../../db/doc-relations.js';
import type { DbClient } from '../../db/client.js';
import type { Entity, IndexJob, LLMMessage, LLMProvider } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import { CliExitError } from '../../agent/providers/cli-provider.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { examineDocument, runDocRelationsPass, type DocRelationsPassDeps } from '../doc-relations-pass.js';
import { DocRelationsOutputInvalid, type DocRelationsSelection } from '../doc-relations-provider.js';
import type { SchedulerClock } from '../subsystem-scheduler.js';

useTemporaryLance();

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;
let store: string;
let repo: string;
let svc: IndexerService;

const FILES: Record<string, string> = {
	'docs/a.md': '# A\nThe lexer turns text into tokens.\n',
	'docs/b.md': '# B\nSee [a](a.md); the lexer again.\n',
	'src/lexer.ts': 'export function lex(s: string): string[] { return [s]; }\n',
};
const write = (rel: string, text: string): void => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };

/** A fake mid-tier provider: answers per document from `answer`, records documents and peak concurrency. */
function fakeProvider(answer: (doc: string, sources: string[]) => unknown) {
	const calls: string[] = [];
	let inFlight = 0;
	let peak = 0;
	const provider = {
		capabilities: {},
		async completeStructured<T>(messages: LLMMessage[]): Promise<T> {
			inFlight++; peak = Math.max(peak, inFlight);
			try {
				const user = String(messages.find(m => m.role === 'user')!.content);
				const doc = /^DOCUMENT: (.+)$/m.exec(user)![1]!;
				const sources = [...user.matchAll(/^- ([0-9a-f]{32}) /gm)].map(m => m[1]!);
				calls.push(doc);
				await new Promise(r => setTimeout(r, 5));
				return answer(doc, sources) as T;
			} finally { inFlight--; }
		},
	} as unknown as LLMProvider;
	return { provider, calls, peak: () => peak };
}
const using = (provider: LLMProvider, modelId = 'm1') => (): DocRelationsSelection => ({ ok: true, provider, modelId });
const pass = (deps: Partial<DocRelationsPassDeps> & Pick<DocRelationsPassDeps, 'select'>) => runDocRelationsPass({ repoPath: repo, ...deps });
const sectionOf = async (rel: string): Promise<Entity> => (await findEntitiesByFile(db, join(repo, rel))).find(e => e.kind === 'section')!;
const rows = async () => readDocRelationRowsInTxn(await getGraphStore(), (await lookupRepoId(repo))!);
const quality = async () => readDocRelationQualityInTxn(await getGraphStore(), (await lookupRepoId(repo))!);
const lexerAnswer = (_doc: string, sources: string[]) => ({ proposals: [{ source: sources.find(s => s !== '')!, target: 'src/lexer.ts#lex', rationale: 'names the lexer' }] });

async function setUp(): Promise<void> {
	for (const [rel, text] of Object.entries(FILES)) write(rel, text);
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'pending' });
	svc = new IndexerService(db, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'ready' }]);
}

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s10-t7-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s10-t7-repo-')));
});
test.afterEach(async () => {
	svc?.disposeSubsystemScheduler();
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

test('s10 t7: serial calls; only changed documents; reindex of an unchanged repository sends none', async () => {
	await setUp();
	const fake = fakeProvider(lexerAnswer);
	const first = await pass({ select: using(fake.provider) });
	assert.deepEqual(fake.calls.sort(), ['docs/a.md', 'docs/b.md'], 'every document the first time');
	assert.equal(fake.peak(), 1, 'one call at a time');
	assert.deepEqual([first.summariesFailed, (first as { stopped: boolean }).stopped], [0, false]);
	assert.equal((await rows()).size, 2);
	assert.equal((await quality())?.extraction.state, 'ok');

	fake.calls.length = 0;
	await pass({ select: using(fake.provider) });
	assert.deepEqual(fake.calls, [], 'nothing changed: nothing sent');

	write('docs/a.md', '# A\nThe lexer turns text into tokens, now faster.\n');
	await svc.processJob({ kind: 'file', filePath: join(repo, 'docs/a.md'), event: 'update' });
	await pass({ select: using(fake.provider) });
	assert.deepEqual(fake.calls, ['docs/a.md'], 'only the changed document');

	fake.calls.length = 0;
	await svc.processJob({ kind: 'full', repoPath: repo });   // repo.reindex: clear, carry, rebuild, restore
	await pass({ select: using(fake.provider) });
	assert.deepEqual(fake.calls, [], 'a reindex of an unchanged repository sends none');

	await pass({ select: using(fake.provider, 'm2') });
	assert.deepEqual(fake.calls.sort(), ['docs/a.md', 'docs/b.md'], 'a model change sends every document again');
	assert.equal(fake.peak(), 1);
});

test('s10 t7: stale-hash guard and superseded by a full index', async () => {
	await setUp();
	const fake = fakeProvider(lexerAnswer);
	// docs/a.md is edited and re-indexed while its value is in hand: its row is not published.
	await pass({
		select: using(fake.provider),
		beforePublish: async rel => {
			if (rel !== 'docs/a.md') return;
			write('docs/a.md', '# A\nEdited while examined.\n');
			await svc.processJob({ kind: 'file', filePath: join(repo, 'docs/a.md'), event: 'update' });
		},
	});
	assert.deepEqual([...(await rows()).keys()], ['docs/b.md'], 'the edited document has no row from the old text');

	// A full index begins while the pass holds a value: nothing more is published.
	await withWriteTxn(t => { for (const k of [...t.docRelationProposals.getKeys({})]) t.docRelationProposals.remove(k as Buffer); });
	const held = await pass({ select: using(fakeProvider(lexerAnswer).provider), beforePublish: async () => { await beginFullIndexState(repo); } });
	assert.equal((held as { grouped?: boolean }).grouped, false, 'superseded');
	assert.equal((await rows()).size, 0, 'no row published across the full index');

	// A full index that begins and finishes while a value is in hand: superseded too, though the hash is unchanged.
	const completed = await pass({ select: using(fakeProvider(lexerAnswer).provider), beforePublish: async () => { await svc.processJob({ kind: 'full', repoPath: repo }); } });
	assert.equal((completed as { grouped?: boolean }).grouped, false, 'superseded by the completed full index');
	assert.equal((await rows()).size, 0, 'nothing computed before the rebuild is published');
});

test('s10 t7: unavailable provider (resolution, not signed in) writes status and the retry recovers', async () => {
	await setUp();
	// Rows for a document that is gone and a proposal whose target vanished: pruned even with no provider.
	const repoId = (await lookupRepoId(repo))!;
	const a = await sectionOf('docs/a.md');
	await withWriteTxn(t => {
		writeDocRelationRowInTxn(t, repoId, 'docs/gone.md', { contentHash: 'h', modelId: 'm1', computedAtGeneration: 1, proposals: [] });
		writeDocRelationRowInTxn(t, repoId, 'docs/a.md', { contentHash: 'h', modelId: 'm1', computedAtGeneration: 1, proposals: [{ from: a.id, to: 'vanished', rationale: 'r' }] });
	});
	// No provider resolves.
	const refused = await pass({ select: () => ({ ok: false, reason: 'indexer.docRelations is assigned to tier cheap; this capability runs only on the mid tier' }) });
	assert.deepEqual(refused, { unavailable: true, reason: 'indexer.docRelations is assigned to tier cheap; this capability runs only on the mid tier' });
	assert.equal((await quality())?.extraction.state, 'unavailable');
	assert.match((await quality())!.extraction.reason!, /tier cheap/);
	assert.deepEqual([...(await rows()).keys()], ['docs/a.md'], 'the row of the removed document is deleted');
	assert.deepEqual((await rows()).get('docs/a.md')!.proposals, [], 'the vanished endpoint is pruned');
	await withWriteTxn(t => deleteDocRelationRowInTxn(t, repoId, 'docs/a.md'));

	// A provider that resolves but is not signed in: its first call throws.
	const signedOut = { capabilities: {}, async completeStructured() { throw new CliExitError('claude exited 1', 'Invalid API key · Please run /login'); } } as unknown as LLMProvider;
	const out = await pass({ select: using(signedOut) });
	assert.equal((out as { unavailable?: boolean }).unavailable, true);
	assert.match((await quality())!.extraction.reason!, /claude exited 1/);
	assert.equal((await quality())!.extraction.examined, 1, 'it stopped at the first document');
	assert.equal((await rows()).size, 0);

	// Through the scheduler: the non-outcome arms the retry; with the provider back, the retry runs the pass.
	let available = false;
	const fake = fakeProvider(lexerAnswer);
	const clock = new (class implements SchedulerClock {
		t = 0; timers: { at: number; fn: () => void }[] = [];
		now() { return this.t; }
		setTimeout(fn: () => void, ms: number) { const x = { at: this.t + ms, fn }; this.timers.push(x); return x; }
		clearTimeout(h: unknown) { this.timers = this.timers.filter(x => x !== h); }
	})();
	const owner = new (class extends IndexerService {
		protected override docRelationsSchedulerClock() { return clock; }
		protected override async docRelationsPass(repoPath: string) {
			return runDocRelationsPass({ repoPath, select: available ? using(fake.provider) : () => ({ ok: false, reason: 'claude is not signed in' }) });
		}
	})(db, new IndexQueue(), watcher, undefined, 600_000);
	const job: IndexJob = { kind: 'doc-relations', repoPath: repo };
	await owner.runQueuedJob(job, () => owner.processJob(job));
	assert.equal(owner._docRelationsTimersForTest().retry, 1, 'the retry is armed');
	available = true;
	const queued: IndexJob[] = [];
	(owner as unknown as { queue: { enqueue(j: IndexJob): void } }).queue.enqueue = j => { queued.push(j); };
	clock.t = 60_000;
	for (const x of [...clock.timers]) if (x.at <= clock.t) { clock.timers = clock.timers.filter(y => y !== x); x.fn(); }
	for (let i = 0; i < 50 && queued.length === 0; i++) await new Promise(r => setTimeout(r, 20));
	assert.deepEqual(queued, [job], 'the retry queues the pass with no file event');
	await owner.runQueuedJob(job, () => owner.processJob(job));
	assert.equal((await quality())?.extraction.state, 'ok', 'it recovers');
	assert.equal((await rows()).size, 2);
	owner.disposeSubsystemScheduler();
});

test('s10 t7: proposal validation, resolution and dedupe against extracted links', async () => {
	await setUp();
	const b = await sectionOf('docs/b.md');
	const s = await getGraphStore();
	const files = storedFilesInTxn(s, (await lookupRepoId(repo))!);
	const sources = await findEntitiesByFile(db, join(repo, 'docs/b.md'));
	const answer = (value: unknown) => ({ capabilities: {}, async completeStructured() { return value; } } as unknown as LLMProvider);
	const examine = (value: unknown) => examineDocument({ provider: answer(value), repoPath: repo, relFile: 'docs/b.md', text: FILES['docs/b.md']!, sources, files });

	const r = await examine({ proposals: [
		{ source: b.id, target: 'src/lexer.ts', rationale: 'the lexer module' },          // a file
		{ source: b.id, target: 'src/lexer.ts#lex', rationale: 'the lex function' },      // a symbol
		{ source: 'not-a-source', target: 'src/lexer.ts', rationale: 'x' },               // unknown source
		{ source: b.id, target: 'src/missing.ts', rationale: 'x' },                       // not a stored file
		{ source: b.id, target: 'src/lexer.ts#nope', rationale: 'x' },                    // no such symbol
		{ source: b.id, target: 'docs/a.md', rationale: 'already linked' },               // the document writes this link
	] });
	assert.deepEqual(r.admitted.map(p => p.target), ['src/lexer.ts', 'src/lexer.ts#lex']);
	assert.equal(r.unresolved, 3);
	assert.equal(r.repeated, 1);
	await assert.rejects(examine({ items: [] }), DocRelationsOutputInvalid);
	await assert.rejects(examine({ proposals: [{ source: b.id, target: 3 }] }), DocRelationsOutputInvalid);

	// Through the pass: two valid proposals and one with an unknown source publish the two; a wrong-shape
	// value leaves the earlier row and counts a failed document.
	const a = await sectionOf('docs/a.md');
	const mixed = (doc: string) => doc === 'docs/a.md'
		? { proposals: [{ source: a.id, target: 'src/lexer.ts', rationale: 'r' }, { source: a.id, target: 'src/lexer.ts#lex', rationale: 'r' }, { source: 'zz', target: 'src/lexer.ts', rationale: 'r' }] }
		: { proposals: [] };
	await pass({ select: using(fakeProvider(mixed).provider) });
	assert.equal((await rows()).get('docs/a.md')!.proposals.length, 2);
	const earlier = (await rows()).get('docs/a.md')!;
	const wrong = await pass({ select: using(fakeProvider(() => ({ nope: true })).provider, 'm2') });
	assert.equal(wrong.summariesFailed, 2, 'both documents failed their shape check');
	assert.deepEqual((await rows()).get('docs/a.md'), earlier, 'the earlier row stays');
});
