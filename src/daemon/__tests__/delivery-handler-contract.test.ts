/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Source-scan contract test for the 'workflow.delivery' and
 * 'workflow.deliveryEvidence' IPC entries (E1 s5, sc7). The handler map lives
 * inside main() and is not headlessly bootable, so — the
 * artifact-feedback-handler-contract idiom — each entry is checked against the
 * source text, and the module it lazy-imports is loaded for real so a wrong
 * path or export name fails here rather than on the first IPC call.
 *
 * Run: npx tsx --test src/daemon/__tests__/delivery-handler-contract.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// The handler map is built in handler-runtime.ts (moved out of index.ts's main(), Epic 86197ac6 s2/t1).
const indexSrc = readFileSync(resolve(HERE, '..', 'handler-runtime.ts'), 'utf8');

/** Slice out one `'<method>': async (...) => { ... }` handler body. */
function handlerBody(method: string): string {
	const key = `'${method}':`;
	const start = indexSrc.indexOf(key);
	assert.ok(start >= 0, `no '${method}' handler registered in the index.ts handler map`);
	const rest = indexSrc.slice(start + key.length);
	const nextKey = rest.search(/\n\t\t'[a-zA-Z.]+':/);
	return nextKey >= 0 ? rest.slice(0, nextKey) : rest;
}

for (const [method, fn] of [['workflow.delivery', 'handleDelivery'], ['workflow.deliveryEvidence', 'handleDeliveryEvidence']] as const) {
	test(`index.ts registers '${method}', which lazy-imports ${fn} and passes INSRC_REPO`, async () => {
		const body = handlerBody(method);
		const imported = /await import\('([^']+)'\)/.exec(body)?.[1];
		assert.equal(imported, '../workflow/delivery/handlers.js');
		assert.match(body, new RegExp(`const \\{ ${fn} \\} = await import`));
		assert.match(body, new RegExp(`return ${fn}\\(`));
		assert.match(body, /process\.env\['INSRC_REPO'\]/);
		const mod = await import(resolve(HERE, '..', imported.replace(/\.js$/, '.ts'))) as Record<string, unknown>;
		assert.equal(typeof mod[fn], 'function', `${imported} exports ${fn}`);
	});
}

test('workflow.delivery carries unit (including status unmigrated), planRowId, taskOrder, unmigrated and needs-migration through the snapshot', async () => {
	const { handleDelivery } = await import('../../workflow/delivery/handlers.js');
	const h = '1111111111111111';
	const repo = mkdtempSync(join(tmpdir(), 'insrc-delivery-contract-'));
	try {
		const dir = join(repo, '.insrc', 'artifacts');
		mkdirSync(dir, { recursive: true });
		const by = { id: 'insrc:system', kind: 'system', properties: {} };
		const lifecycle = (status: string) => ({ status, revision: { number: 1, contentHash: '', at: 't', by }, signoffs: [], ...(status === 'approved' ? { approval: { revision: 1, by, at: '2026-11-01T00:00:00.000Z' } } : {}) });
		const meta = { createdAt: '2026-11-01T00:00:00.000Z', epicCreatedAt: '2026-11-01T00:00:00.000Z', epicHash: h };
		const put = (id: string, m: object, body: object): void => writeFileSync(join(dir, `${id}.json`), JSON.stringify({ meta: { ...meta, ...m }, body, citations: [] }));
		put(`DEF-${h}`, { lifecycle: lifecycle('approved') }, { stories: [{ id: 's1', title: 'One' }] });
		put(`EPIC-${h}`, {}, {});   // no lifecycle: not migrated
		put(`STORY-${h}-s1`, { storyId: 's1', lifecycle: lifecycle('draft') }, {});
		put(`PLAN-${h}-s1`, { storyId: 's1', lifecycle: lifecycle('approved') }, { tasks: [{ id: 't9', title: 'Row', order: 3 }] });
		put(`TASKS-${h}-s1`, { storyId: 's1', lifecycle: lifecycle('draft') }, { planRevision: 1, taskIds: ['t4'], nextNumber: 5 });
		put(`TASK-${h}-s1-t4`, { storyId: 's1', lifecycle: lifecycle('approved') }, { planTaskId: 't9', order: 3, title: 'Row' });
		put(`LLD-${h}-s1`, { storyId: 's1' }, { goal: 'g' });   // no lifecycle: not migrated

		const answer = handleDelivery({ repo }, undefined);
		assert.ok(!('error' in answer), JSON.stringify(answer));
		const snapshot = JSON.parse(JSON.stringify(answer)) as typeof answer;   // what crosses the IPC boundary
		const items = 'items' in snapshot ? snapshot.items : [];
		const epic = items.find(i => i.kind === 'epic');
		const story = items.find(i => i.kind === 'story');
		const task = items.find(i => i.kind === 'task');
		assert.deepEqual(epic?.unit, { artifactId: `EPIC-${h}`, status: 'unmigrated' });
		assert.deepEqual(story?.unit, { artifactId: `STORY-${h}-s1`, status: 'draft' });
		assert.deepEqual(task?.unit, { artifactId: `TASK-${h}-s1-t4`, status: 'approved' });
		assert.equal(task?.planRowId, 't9');
		assert.equal(task?.taskOrder, 3);
		assert.equal(story?.tasks[0]?.taskOrder, 3);
		assert.equal(story?.evidence.find(e => e.artifactId === `LLD-${h}-s1`)?.approval.state, 'unmigrated');
		assert.ok(epic?.attentionReasons.includes('needs-migration'), JSON.stringify(epic?.attentionReasons));
		assert.ok(story?.attentionReasons.includes('needs-migration'), JSON.stringify(story?.attentionReasons));
		assert.ok(!story?.attentionReasons.includes('pending-decision'), 'the unmigrated LLD is no pending decision');
		assert.ok(story?.notices.some(n => n.code === 'needs-migration' && n.artifactIds.includes(`LLD-${h}-s1`)), JSON.stringify(story?.notices));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
