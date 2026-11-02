/**
 * Epic c2ba6fa6, Story s8, t4 -- subsystem summaries through the cheap-tier
 * provider. A TypeScript repository indexed by the real IndexerService, then
 * runSubsystemPass with an injected provider standing in for the cheap tier
 * (buildSummariserProvider): summaries are written only for new memberships,
 * an unchanged subsystem keeps its summary and costs no call; the calls are
 * never concurrent; a failing call leaves that summary empty and the others
 * written; a generation that advances while summaries are written stops them.
 *
 * Run: npx tsx --test src/indexer/__tests__/subsystem-summaries.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../db/repos.js';
import { readSubsystems, writeSubsystemSummary } from '../../db/subsystems.js';
import type { DbClient } from '../../db/client.js';
import type { LLMMessage, LLMProvider } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { runSubsystemPass, summariseSubsystem, SUMMARY_PART_CHARS } from '../subsystem-pass.js';

useTemporaryLance();

const FILES: Record<string, string> = {
	'src/parse/lexer.ts':  "import { token } from './tokens.js';\nexport function lex(s: string): string[] { return [token(s)]; }\n",
	'src/parse/tokens.ts': "export function token(s: string): string { return s; }\n",
	'src/store/db.ts':     "import { row } from './rows.js';\nimport { lex } from '../parse/lexer.js';\nexport function load(s: string): string {\n  const parts = lex(s);\n  return row(parts[0]!);\n}\n",
	'src/store/rows.ts':   "export function row(s: string): string { return s; }\n",
};

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;
let store: string;
let repo: string;
let svc: IndexerService;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s8-sum-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s8-sum-repo-')));
	for (const [f, text] of Object.entries(FILES)) {
		mkdirSync(dirname(join(repo, f)), { recursive: true });
		writeFileSync(join(repo, f), text);
	}
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-02T00:00:00.000Z', status: 'pending' });
	svc = new IndexerService(db, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' }]);
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

/** A provider standing in for the cheap tier: records each call and how many ran at once. */
function recordingProvider(opts: { failFor?: string; during?: () => Promise<void> } = {}) {
	const calls: string[] = [];
	let active = 0, maxActive = 0;
	const provider = {
		capabilities: {},
		async completeStructured<T>(messages: LLMMessage[]): Promise<T> {
			const user = String(messages.find(m => m.role === 'user')?.content ?? '');
			const name = /^Subsystem: (.*)$/m.exec(user)![1]!;
			calls.push(name);
			active++; maxActive = Math.max(maxActive, active);
			try {
				await new Promise(r => setTimeout(r, 15));
				if (opts.during !== undefined) await opts.during();
				if (name === opts.failFor) throw new Error('the cheap tier is down');
				return { summary: `${name} summary` } as T;
			} finally { active--; }
		},
	} as unknown as LLMProvider;
	return { provider, calls, maxActive: () => maxActive };
}

/** Add a file and let the settle run, as the watcher and the settle pass would: a new, complete generation. */
async function addFile(rel: string, text: string): Promise<void> {
	writeFileSync(join(repo, rel), text);
	await svc.processJob({ kind: 'file', filePath: join(repo, rel), event: 'add' });
	await runCrossFileResolver({ db, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'settle', committedFiles: [join(repo, rel)] });
}

const summaries = async () => new Map((await readSubsystems(repo)).subsystems.map(s => [s.name, s.summary]));

test('s8 t4: summaries are written only for new memberships; an unchanged subsystem keeps its summary and causes no call', async () => {
	const first = recordingProvider();
	const r1 = await runSubsystemPass({ db, repoPath: repo, provider: first.provider });
	assert.deepEqual([...first.calls].sort(), ['src/parse', 'src/store']);
	assert.equal(r1.summariesWritten, 2);
	assert.deepEqual(await summaries(), new Map([['src/parse', 'src/parse summary'], ['src/store', 'src/store summary']]));

	await addFile('src/store/cache.ts', "import { row } from './rows.js';\nexport function cached(s: string): string { return row(s); }\n");
	const second = recordingProvider();
	const r2 = await runSubsystemPass({ db, repoPath: repo, provider: second.provider });
	assert.equal(r2.ran, true);
	assert.deepEqual(second.calls, ['src/store'], 'only the subsystem whose members changed');
	assert.equal((await summaries()).get('src/parse'), 'src/parse summary', 'kept from the first pass');
});

test('s8 t4: the summary calls are made one at a time', async () => {
	const rec = recordingProvider();
	await runSubsystemPass({ db, repoPath: repo, provider: rec.provider });
	assert.equal(rec.calls.length, 2);
	assert.equal(rec.maxActive(), 1, 'never two model calls at once');
});

test('s8 t4: a failing call leaves that summary empty and the others written', async () => {
	const rec = recordingProvider({ failFor: 'src/store' });
	const r = await runSubsystemPass({ db, repoPath: repo, provider: rec.provider });
	assert.deepEqual([r.summariesWritten, r.summariesFailed], [1, 1]);
	assert.deepEqual(await summaries(), new Map([['src/parse', 'src/parse summary'], ['src/store', null]]));
});

test('s8 t4: a generation that advances while summaries are written stops further calls; the summary already made is kept for its membership', async () => {
	let advanced = false;
	const rec = recordingProvider({ during: async () => {
		if (advanced) return;
		advanced = true;
		await addFile('src/store/cache.ts', "export function cached(s: string): string { return s; }\n");
	} });
	const r = await runSubsystemPass({ db, repoPath: repo, provider: rec.provider });
	assert.equal(r.stopped, true);
	assert.equal(rec.calls.length, 1, 'no call after the generation moved');
	assert.equal(r.summariesWritten, 1, 'the summary made for a membership is written: its row (id = membership) still exists');
	const got = await summaries();
	assert.equal(got.get(rec.calls[0]!), `${rec.calls[0]} summary`);
	assert.equal([...got.values()].filter(v => v === null).length, 1, 'the other subsystem waits for the next pass');
});

test('s8 t4: a summary is stored only on a subsystem row with its id (its membership)', async () => {
	const rec = recordingProvider({ failFor: 'src/store' });
	await runSubsystemPass({ db, repoPath: repo, provider: rec.provider });
	const storeSub = (await readSubsystems(repo)).subsystems.find(s => s.name === 'src/store')!;

	assert.equal(await writeSubsystemSummary(repo, 'no-such-membership', 'late', 'cheap'), false, 'no row with that id: refused');
	assert.equal(await writeSubsystemSummary(repo, storeSub.id, 'current', 'cheap'), true);
	assert.equal((await summaries()).get('src/store'), 'current');
});

test('s8 review: a summary that failed is retried by the next pass at the same generation', async () => {
	await runSubsystemPass({ db, repoPath: repo, provider: recordingProvider({ failFor: 'src/store' }).provider });
	assert.equal((await summaries()).get('src/store'), null);

	const again = recordingProvider();
	const r = await runSubsystemPass({ db, repoPath: repo, provider: again.provider });
	assert.deepEqual([r.ran, r.reason, r.summariesWritten], [false, 'up-to-date', 1], 'the groups are current; the missing summary is written');
	assert.equal(r.subsystems, (await readSubsystems(repo)).subsystems.length, 'the up-to-date result counts the stored subsystems');
	assert.ok(r.subsystems > 0);
	assert.deepEqual(again.calls, ['src/store'], 'only the subsystem without a summary');
	assert.equal((await summaries()).get('src/store'), 'src/store summary');
});

test('s8 review: each summary waits for code work and none starts once the daemon is stopping', async () => {
	// Stopping: two summaries are pending, and none is asked for.
	const stopping = recordingProvider();
	const halted = await runSubsystemPass({ db, repoPath: repo, provider: stopping.provider, shouldStop: () => true });
	assert.equal(halted.ran, true, 'the groups are still written');
	assert.deepEqual([stopping.calls.length, halted.summariesWritten, halted.stopped], [0, 0, true]);
	assert.deepEqual([...(await summaries()).values()], [null, null]);

	// Waiting: one wait per summary, and one more when code work arrived just before a call.
	let waits = 0;
	let busyOnce = true;
	const rec = recordingProvider();
	const r = await runSubsystemPass({
		db, repoPath: repo, provider: rec.provider,
		waitForCodeIdle: async () => { waits++; },
		isCodeIdle: () => { if (busyOnce) { busyOnce = false; return false; } return true; },
		shouldStop: () => false,
	});
	assert.deepEqual([r.ran, r.reason], [false, 'up-to-date'], 'the stopped summaries are retried at the same generation');
	assert.equal(rec.calls.length, 2);
	assert.equal(waits, 3);
	assert.equal(r.summariesWritten, 2);
});

test('s8 review: a subsystem too large for one message is summarised in parts, every file read, then combined', async () => {
	const files = Array.from({ length: 3000 }, (_v, i) => `gen/very/long/directory/name/for/generated/code/file-${String(i).padStart(5, '0')}.ts`);
	const sub = { id: 'big', name: 'gen', files, entityCount: files.length, summary: null, connections: [{ to: 'x', weight: 1, kinds: { CALLS: 1 } }] };
	const exportsOf = new Map(files.map(f => [f, [`fn${f.slice(-8, -3)}`]]));
	const asked: string[] = [];
	let active = 0, maxActive = 0;
	const summary = await summariseSubsystem(sub, exportsOf, new Map([['x', 'other']]), async (content) => {
		active++; maxActive = Math.max(maxActive, active);
		await new Promise(r => setTimeout(r, 1));
		active--;
		asked.push(content);
		return `summary ${asked.length}`;
	});
	assert.ok(asked.length > 2, `parts, then a combining message (got ${asked.length} messages)`);
	assert.ok(asked.every(c => c.length <= SUMMARY_PART_CHARS + 200), 'every message fits');
	for (const f of files) assert.ok(asked.some(c => c.includes(f)), `${f} is read`);
	assert.match(asked.at(-1)!, /^Subsystem: gen\n\nIts files, summarised in parts:/);
	assert.match(asked.at(-1)!, /- other: 1 CALLS/, 'the connections are in the combining message');
	assert.equal(summary, `summary ${asked.length}`);
	assert.equal(maxActive, 1, 'one call at a time');
});

test('s8 review: part summaries too long to combine two to a message are combined as they are, with no call that rewrites them one by one', async () => {
	const files = Array.from({ length: 3000 }, (_v, i) => `gen/very/long/directory/name/for/generated/code/file-${String(i).padStart(5, '0')}.ts`);
	const sub = { id: 'big', name: 'gen', files, entityCount: files.length, summary: null, connections: [] };
	const asked: string[] = [];
	await summariseSubsystem(sub, new Map(), new Map(), async (content) => {
		asked.push(content);
		return 'x'.repeat(Math.ceil(SUMMARY_PART_CHARS * 0.6));   // longer than half a message
	});
	const parts = asked.filter(c => / -- part \d+ of \d+ of its files/.test(c)).length;
	assert.ok(parts >= 2, `the files need several parts (got ${parts})`);
	assert.equal(asked.filter(c => c.includes('-- summaries of some of its parts')).length, 0, 'no round that cannot shrink');
	assert.equal(asked.length, parts + 1, 'the parts, then one combining message');
	assert.match(asked.at(-1)!, /^Subsystem: gen\n\nIts files, summarised in parts:/);
});
