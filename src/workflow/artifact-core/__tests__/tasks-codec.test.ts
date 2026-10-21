import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ArtifactIds } from '../../artifact-ids.js';
import { codecFor } from '../codecs.js';
import type { CodecContext } from '../codecs.js';
import { ArtifactShapeError } from '../types.js';
import type { TaskPayload, TasksPayload } from '../../tasks/types.js';
import { H } from './store-kit.js';

const ctx: CodecContext = { workflow: 'plan', runId: 'r', repoPath: '/r', createdAt: '2026-10-21T00:00:00.000Z', epicCreatedAt: '2026-10-19T00:00:00.000Z', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1 };
const task: TaskPayload = { title: 'Add the input', summary: 'an input', size: 'M', order: 2, acceptanceChecks: ['renders'], tests: [{ level: 'unit', name: 'input.test.ts: renders' }], planTaskId: 't2' };
const tasks: TasksPayload = { planRevision: 3, taskIds: ['t1', 't2'], nextNumber: 3 };
const TASK = ArtifactIds.make({ kind: 'TASK', epicHash: H, story: 's1', task: 't2' });
const TASKS = ArtifactIds.make({ kind: 'TASKS', epicHash: H, story: 's1' });
const head = (body: unknown) => ({ meta: {}, body: body as Record<string, unknown>, citations: [] });

describe('tasks-codec', () => {
	it('the TASK and TASKS codecs round-trip a Task payload and a Tasks payload and refuse a malformed body', () => {
		for (const [kind, id, body] of [['TASK', TASK, task], ['TASKS', TASKS, tasks]] as const) {
			const key = ArtifactIds.parse(id)!;
			const codec = codecFor(kind);
			const written = codec.encode({ body: body as unknown as Record<string, unknown>, citations: [] }, key, ctx);
			assert.deepEqual(written.body, body, `${kind} encodes its body as given`);
			assert.deepEqual(codec.decode(written).body, body, `${kind} decodes what it encoded`);
		}

		// a missing or wrongly typed field is refused on read and on write, naming the field
		const bad: Array<[string, unknown, RegExp]> = [
			['TASK', { ...task, title: undefined }, /title/],
			['TASK', { ...task, summary: 3 }, /summary/],
			['TASK', { ...task, size: 'XL' }, /size/],
			['TASK', { ...task, order: 0 }, /order/],
			['TASK', { ...task, acceptanceChecks: 'renders' }, /acceptanceChecks/],
			['TASK', { ...task, tests: [{ level: 'manual', name: 'x' }] }, /tests/],
			['TASK', { ...task, planTaskId: undefined }, /planTaskId/],
			['TASK', { ...task, planTaskId: 'row-2' }, /planTaskId/],
			['TASK', [], /body/],
			['TASKS', { ...tasks, planRevision: '3' }, /planRevision/],
			['TASKS', { ...tasks, taskIds: [1] }, /taskIds/],
			['TASKS', { ...tasks, nextNumber: 0 }, /nextNumber/],
			['TASKS', { taskIds: [] }, /planRevision/],
		];
		for (const [kind, body, field] of bad) {
			const codec = codecFor(kind as 'TASK' | 'TASKS');
			assert.throws(() => codec.decode(head(body)), (e: Error) => e instanceof ArtifactShapeError && field.test(e.message), `${kind} decode ${JSON.stringify(body).slice(0, 60)}`);
			const key = ArtifactIds.parse(kind === 'TASK' ? TASK : TASKS)!;
			assert.throws(() => codec.encode({ body: body as Record<string, unknown>, citations: [] }, key, ctx), ArtifactShapeError, `${kind} encode`);
		}

		// no other kind's codec checks a body
		for (const kind of ['EPIC', 'STORY', 'DIAG', 'LLD', 'PLAN'] as const) assert.doesNotThrow(() => codecFor(kind).decode(head({ anything: 1 })), kind);
	});
});
