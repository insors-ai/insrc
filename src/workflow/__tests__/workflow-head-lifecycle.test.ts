/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Every workflow head has a lifecycle from its first write and through any rewrite, and no production content write of a delivery
 * kind can create one without it.
 *
 * Run: npx tsx --test src/workflow/__tests__/workflow-head-lifecycle.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { handleWorkflowStep } from '../../daemon/steps/workflow-step/handler.js';
import { _clearWorkflowStateStoreForTests } from '../../daemon/steps/workflow-step/state-store.js';
import { runWorkflowServerSide } from '../../daemon/workflow-rpc.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../shared/types.js';
import { ARTIFACT_WRITE_INVENTORY, checkNewHeadLifecycles, storeFirstCallsWithoutWriter } from '../artifact-write-inventory.js';
import type { InventoryEntry } from '../artifact-write-inventory.js';
import { registerWorkflowRunners } from '../index.js';
import { withWorkflowLifecycle, writeArtifact } from '../storage.js';
import './helpers/converted-repos.js';

type Lc = { status: string; revision: { number: number; contentHash: string }; signoffs: unknown[]; approval?: unknown };
type Head = { meta: { lifecycle?: Lc; revision?: number }; body: unknown };
const read = (path: string): Head => JSON.parse(readFileSync(path, 'utf8')) as Head;
const head = (text: string, meta: object = {}) => ({ meta: { workflow: 'stub', ...meta }, body: { text }, citations: [] });
const withTemp = (run: (dir: string) => void | Promise<void>) => async (): Promise<void> => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-head-lifecycle-'));
	try { await run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const by = { id: 'github:alice', kind: 'person', properties: {} };
const SIGNOFF = { revision: 1, request: { entityId: 'acme/demo#9', type: 'GH_ISSUE', relation: 'cites' }, state: 'open', actors: [], at: '2026-10-20T12:00:00.000Z' };

/** A head on disk, as `write` wrote it, approved at its revision; `signoffs` are the entries the approved lifecycle holds. */
function approvedHead(path: string, signoffs: unknown[]): Lc {
	writeArtifact(path, withWorkflowLifecycle(path, head('first')), 'content');
	const stored = read(path);
	const lifecycle = { ...stored.meta.lifecycle!, status: 'approved', approval: { by, at: '2026-10-20T12:00:00.000Z', revision: 1 }, signoffs };
	writeArtifact(path, { ...stored, meta: { ...stored.meta, lifecycle } } as never, 'meta-only');
	return lifecycle;
}

test('the storage helper: a first write gets a draft lifecycle; a rewrite with unchanged content keeps the lifecycle; a rewrite with changed content gets a draft and keeps Signoff entries, with no Signoff entries and with them', withTemp(dir => {
	// a first write is a draft at revision 1
	const first = join(dir, 'first.json');
	writeArtifact(first, withWorkflowLifecycle(first, head('one')), 'content');
	assert.equal(read(first).meta.lifecycle?.status, 'draft');
	assert.equal(read(first).meta.lifecycle?.revision.number, 1);
	assert.notEqual(read(first).meta.lifecycle?.revision.contentHash, '');

	// a prior head with no lifecycle gets a draft
	const legacy = join(dir, 'legacy.json');
	writeArtifact(legacy, head('one'), 'content');
	assert.equal(read(legacy).meta.lifecycle, undefined, 'control: a raw content write adds none');
	writeArtifact(legacy, withWorkflowLifecycle(legacy, head('one')), 'content');
	assert.equal(read(legacy).meta.lifecycle?.status, 'draft');

	for (const signoffs of [[], [SIGNOFF]]) {
		const name = `s${signoffs.length}`;
		// unchanged content keeps the whole lifecycle
		const same = join(dir, `${name}-same.json`);
		const stored = approvedHead(same, signoffs);
		writeArtifact(same, withWorkflowLifecycle(same, head('first')), 'content');
		assert.deepEqual(read(same).meta.lifecycle, stored);

		// changed content is a draft for the new revision: the approval goes and the entries stay
		const changed = join(dir, `${name}-changed.json`);
		approvedHead(changed, signoffs);
		writeArtifact(changed, withWorkflowLifecycle(changed, head('second')), 'content');
		const lifecycle = read(changed).meta.lifecycle!;
		assert.equal(lifecycle.status, 'draft');
		assert.equal(lifecycle.revision.number, 2);
		assert.equal(lifecycle.approval, undefined);
		assert.deepEqual(lifecycle.signoffs, signoffs);
		assert.equal(read(changed).meta.revision, 2);
	}
}));

class FakeProvider implements LLMProvider {
	private readonly queue: unknown[];
	constructor(responses: unknown[]) { this.queue = [...responses]; }
	readonly supportsTools = false;
	get capabilities() { return { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false }; }
	async complete(): Promise<never> { throw new Error('unused'); }
	async *stream(): AsyncIterable<string> { throw new Error('unused'); }
	async embed(): Promise<number[]> { return []; }
	async completeStructured<T>(_m: LLMMessage[], _s: StructuredSchema): Promise<T> { return this.queue.shift() as T; }
}
const STEPS = [{ id: 's1', runner: 'echo.a', params: {} }, { id: 's2', runner: 'echo.b', params: {} }, { id: 's3', runner: 'echo.c', params: {} }];
const STUB = { body: { title: 'Stub', summary: 'A stub run [[c1]].', bulletList: ['one [[c1]]'] }, citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }] };
const payload = (env: unknown): Record<string, unknown> => JSON.parse((env as { content: { text: string }[] }).content[0]!.text) as Record<string, unknown>;

test('both first-write sites give a new head a draft lifecycle', withTemp(async dir => {
	// the turn-by-turn synthesize phase
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const stepRepo = join(dir, 'step');
	const start = payload(await handleWorkflowStep({ phase: 'start', workflow: 'stub', focus: 'a first write', repo: stepRepo } as never));
	const plan = payload(await handleWorkflowStep({ phase: 'plan', state: start['state'], plan: { workflow: 'stub', steps: STEPS } } as never));
	const done = payload(await handleWorkflowStep({ phase: 'synthesize', state: plan['state'], artifact: STUB } as never));
	assert.equal(done['next'], 'done', JSON.stringify(done));
	const stepHead = read((done['path'] as string).replace(/\.md$/, '.json'));
	assert.equal(stepHead.meta.lifecycle?.status, 'draft');
	assert.equal(stepHead.meta.lifecycle?.revision.number, 1);

	// the daemon's own run
	const runRepo = join(dir, 'run');
	const run = await runWorkflowServerSide({ workflow: 'stub', focus: 'a first write', repoPath: runRepo, repoIndexedAt: null, params: {} }, new FakeProvider([{ workflow: 'stub', steps: STEPS }, STUB]), { runId: 'first-write', epicKey: 'first-write', modelLabel: 'ollama:test', review: false });
	const runHead = read(run.path.replace(/\.md$/, '.json'));
	assert.equal(runHead.meta.lifecycle?.status, 'draft');
	assert.equal(runHead.meta.lifecycle?.revision.number, 1);
}));

function productionSources(root: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(root, { withFileTypes: true })) {
		const path = join(root, name.name);
		if (name.isDirectory()) { if (name.name !== '__tests__' && name.name !== 'node_modules') out.push(...productionSources(path)); }
		else if (name.name.endsWith('.ts')) out.push(path);
	}
	return out;
}

test('guard: a production content write of a delivery kind cannot create a head without a lifecycle', () => {
	const readSource = (file: string): string | undefined => (existsSync(file) ? readFileSync(file, 'utf8') : undefined);
	assert.deepEqual(checkNewHeadLifecycles(ARTIFACT_WRITE_INVENTORY, readSource), []);
	const unguarded = productionSources('src').flatMap(path => storeFirstCallsWithoutWriter(readFileSync(path, 'utf8')).map(call => `${path}: ${call}`));
	assert.deepEqual(unguarded, []);

	// controls: the checks do fail on what they guard against
	const entry = (over: Partial<InventoryEntry>): InventoryEntry => ({ file: 'w.ts', class: 'content', via: 'writeArtifact', note: 'x', ...over });
	const bare = () => "writeArtifact(p, JSON.parse(raw), 'content');";
	const problems = (over: Partial<InventoryEntry>, source: string = bare()): string[] => checkNewHeadLifecycles([entry(over)], () => source);
	assert.match(problems({}).join(), /says nothing about the lifecycle/, 'a new content writer has to say');
	assert.match(problems({ newHead: 'settled' }).join(), /writes without withWorkflowLifecycle/);
	assert.deepEqual(problems({ newHead: 'settled' }, "writeArtifact(p, withWorkflowLifecycle(p, a), 'content');"), []);
	assert.match(problems({ newHead: 'carried' }).join(), /builds no draft lifecycle/);
	assert.match(problems({ newHead: 'store-first' }).join(), /through the store first/);
	assert.match(problems({ newHead: { exempt: ' ' } }).join(), /needs a reason/);
	assert.match(checkNewHeadLifecycles([entry({ class: 'mixed', sites: [{ fn: 'a', kind: 'content' }] })], bare).join(), /w\.ts a: says nothing/);
	assert.equal(storeFirstCallsWithoutWriter('persistBuildRecord(repo, rec);').length, 1);
	assert.equal(storeFirstCallsWithoutWriter('persistBuildRecord(repo, rec, undefined);').length, 1);
	assert.equal(storeFirstCallsWithoutWriter('persistBuildRecord(repo, rec, writer);').length, 0);
	assert.equal(storeFirstCallsWithoutWriter('ensureBuildRecordOnCompletion(repo, ref);').length, 1);
});
