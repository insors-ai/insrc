/**
 * docs/plans/docs-module.md Phase 7. Tests for how the adherence check
 * resolves its constraints from the two overrides, through the seam:
 *   1. params.constraints (inline; an empty list counts as not given)
 *   2. params.constraintIds -> LiveProjectContext keyConstraints
 * and for what it does with none. The third way, params.constraintTopic
 * (the check enumerates from the documents), is tested in
 * adherence-topic-route.test.ts. params.constraintsSource, the upstream
 * task's `constraints`, is no longer read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';
import { writeDocSummary } from '../../../../db/doc-summaries.js';
import { upsertEntities } from '../../../../db/entities.js';
import { addRepo } from '../../../../db/repos.js';
import type { Entity, RegisteredRepo } from '../../../../shared/types.js';
import type {
	ClassifiedIntent,
	DocSummary,
	PlannedTask,
} from '../../../../shared/analyze-types.js';
import type { TemplateExecuteArgs, UpstreamOutput } from '../../../executor/types.js';

import { _resolveConstraintsForTest } from '../adherence.js';

const REPO = '/repo/alpha';
const NOW = '2026-07-07T12:00:00.000Z';
let dir: string;

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeDoc(file: string, name: string): Entity {
	return {
		id:        makeEntityId(REPO, file, 'document', name),
		kind:      'document',
		name,
		language:  'markdown',
		repoId:    1,
		repo:      REPO,
		file,
		startLine: 1,
		endLine:   50,
		body:      `# ${name}`,
		embedding: [],
		indexedAt: NOW,
		artifact:  true,
	};
}

function makeSummary(overrides: Partial<DocSummary> = {}): DocSummary {
	return {
		title:           overrides.title           ?? 'Doc',
		family:          overrides.family          ?? 'design',
		kind:            overrides.kind            ?? 'design',
		subjects:        overrides.subjects        ?? ['analyze'],
		summary:         overrides.summary         ?? 'gist',
		keyDecisions:    overrides.keyDecisions    ?? [],
		keyConstraints:  overrides.keyConstraints  ?? [],
		relatedEntities: overrides.relatedEntities ?? [],
		status:          overrides.status          ?? 'current',
		summarisedAt:    overrides.summarisedAt    ?? NOW,
		modelId:         overrides.modelId         ?? 'qwen3.6:35b-a3b',
		contentHash:     overrides.contentHash     ?? 'hash-0',
		...(overrides.errorCode !== undefined ? { errorCode: overrides.errorCode } : {}),
	};
}

function makeExecuteArgs(params: Record<string, unknown>): TemplateExecuteArgs {
	const intent: ClassifiedIntent = {
		target:    'code',
		scope:     'M',
		focused:   false,
		scopeRef:  { kind: 'repo', value: REPO },
		reasoning: 'test intent',
	};
	const task: PlannedTask = {
		taskId:    't01',
		template:  'code.adherence.check',
		kind:      'leaf',
		params:    params as Record<string, unknown>,
		consumes:  [],
		produces:  ['adherence-report'],
		rationale: 'test rationale for the adherence check task',
	} as PlannedTask;
	return {
		runId:            'test-run',
		intent,
		task,
		upstreamOutputs:  new Map<string, UpstreamOutput[]>(),
	} as unknown as TemplateExecuteArgs;
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-adherence-constraints-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const r: RegisteredRepo = {
		path: REPO, name: '', addedAt: NOW, status: 'pending',
	};
	await addRepo(null, r);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Priority 2: inline constraints pass through
// ---------------------------------------------------------------------------

test('inline params.constraints pass through untouched', async () => {
	const args = makeExecuteArgs({
		constraints: [
			{ constraint: 'no direct cloud REST', sourceEntityId: 'aaa', file: '/x.md', heading: 'H' },
			{ constraint: 'boot validation is required' },
		],
	});
	const { constraints: resolved, source } = await _resolveConstraintsForTest(args, args.task.params as Record<string, unknown>, REPO);
	assert.deepEqual(source, { kind: 'inline' });
	assert.equal(resolved.length, 2);
	assert.equal(resolved[0]!.constraint, 'no direct cloud REST');
	assert.equal(resolved[0]!.sourceEntityId, 'aaa');
	assert.equal(resolved[1]!.constraint, 'boot validation is required');
});

// ---------------------------------------------------------------------------
// Priority 3: constraintIds -> LiveProjectContext hydration
// ---------------------------------------------------------------------------

test('constraintIds hydrate keyConstraints from summarised docs', async () => {
	const d1 = makeDoc(`${REPO}/design/a.md`, 'a');
	const d2 = makeDoc(`${REPO}/design/b.md`, 'b');
	await upsertEntities(null, [d1, d2]);
	await writeDocSummary(null, d1.id, REPO, makeSummary({
		title:          'A design',
		keyConstraints: ['must not block on cloud REST', 'summariser runs at index time'],
	}));
	await writeDocSummary(null, d2.id, REPO, makeSummary({
		title:          'B design',
		keyConstraints: ['every prompt validated at boot'],
	}));

	const args = makeExecuteArgs({ constraintIds: [d1.id, d2.id] });
	const { constraints: resolved, source } = await _resolveConstraintsForTest(args, args.task.params as Record<string, unknown>, REPO);
	assert.equal(source.kind, 'stored-documents');
	assert.equal(resolved.length, 3);

	const byText = new Map(resolved.map(r => [r.constraint, r]));
	assert.ok(byText.has('must not block on cloud REST'));
	assert.equal(byText.get('must not block on cloud REST')!.sourceEntityId, d1.id);
	assert.equal(byText.get('must not block on cloud REST')!.file, `${REPO}/design/a.md`);
	assert.equal(byText.get('every prompt validated at boot')!.sourceEntityId, d2.id);
});

test('constraintIds skip ids that do not resolve to summarised docs', async () => {
	const d = makeDoc(`${REPO}/design/a.md`, 'a');
	await upsertEntities(null, [d]);
	await writeDocSummary(null, d.id, REPO, makeSummary({
		keyConstraints: ['real constraint'],
	}));

	const args = makeExecuteArgs({ constraintIds: [d.id, 'nonexistent-id-1234'] });
	const { constraints: resolved, source } = await _resolveConstraintsForTest(args, args.task.params as Record<string, unknown>, REPO);
	assert.equal(source.kind, 'stored-documents');
	assert.equal(resolved.length, 1);
	assert.equal(resolved[0]!.constraint, 'real constraint');
});

test('a constraintsSource in the params is not read: beside usable ids the ids are used, and the upstream outputs are never looked at', async () => {
	const d = makeDoc(`${REPO}/design/a.md`, 'a');
	await upsertEntities(null, [d]);
	await writeDocSummary(null, d.id, REPO, makeSummary({
		keyConstraints: ['from-summary'],
	}));

	// An upstream output under the very name the parameter gives: it used to win.
	const args = makeExecuteArgs({
		constraintsSource: 't-upstream',
		constraintIds:     [d.id],
	});
	(args.upstreamOutputs as Map<string, UpstreamOutput[]>).set('t-upstream', [{
		taskId: 't-upstream', template: 'docs.constraint.enumerate', params: {},
		value: { constraints: [{ constraint: 'from-upstream', sourceEntityId: 'up-eid', file: '/u.md', heading: 'U' }] },
	}]);
	// A map that fails the test if the check so much as asks it for a value.
	const guarded = new Proxy(args.upstreamOutputs as Map<string, UpstreamOutput[]>, {
		get: (_t, prop) => { throw new Error(`the check read upstreamOutputs.${String(prop)}`); },
	});
	const { constraints: resolved, source } = await _resolveConstraintsForTest(
		{ ...args, upstreamOutputs: guarded }, args.task.params as Record<string, unknown>, REPO,
	);
	assert.deepEqual(resolved.map(r => r.constraint), ['from-summary']);
	assert.deepEqual(source, { kind: 'stored-documents', ids: [d.id] });
});

// ---------------------------------------------------------------------------
// The order of the overrides, and what an empty one means
// ---------------------------------------------------------------------------

test('an inline list wins over ids; an empty inline list counts as not given and the ids are used', async () => {
	const d = makeDoc(`${REPO}/design/a.md`, 'a');
	await upsertEntities(null, [d]);
	await writeDocSummary(null, d.id, REPO, makeSummary({
		keyConstraints: ['from-summary'],
	}));

	const both = makeExecuteArgs({ constraints: [{ constraint: 'inline-constraint' }], constraintIds: [d.id] });
	const first = await _resolveConstraintsForTest(both, both.task.params as Record<string, unknown>, REPO);
	assert.deepEqual([first.constraints.map(r => r.constraint), first.source], [['inline-constraint'], { kind: 'inline' }]);

	// It used to be taken, yield nothing, and fail the check.
	const emptyInline = makeExecuteArgs({ constraints: [], constraintIds: [d.id] });
	const second = await _resolveConstraintsForTest(emptyInline, emptyInline.task.params as Record<string, unknown>, REPO);
	assert.deepEqual([second.constraints.map(r => r.constraint), second.source], [['from-summary'], { kind: 'stored-documents', ids: [d.id] }]);
});

// ---------------------------------------------------------------------------
// None of the three -> the check has nothing to judge against
// ---------------------------------------------------------------------------

test('with no source of constraints the check throws, naming constraintTopic, constraints and constraintIds', async () => {
	for (const params of [{}, { constraints: [] }, { constraintIds: [] }, { constraintTopic: '   ' }, { constraintsSource: 't-upstream' }]) {
		const args = makeExecuteArgs(params);
		await assert.rejects(
			() => _resolveConstraintsForTest(args, args.task.params as Record<string, unknown>, REPO),
			(err: Error) => {
				assert.match(err.message, /^code\.adherence\.check: no constraints to check against\. Give one of: /, JSON.stringify(params));
				for (const name of ['params.constraintTopic', 'params.constraints', 'params.constraintIds']) assert.ok(err.message.includes(name), name);
				assert.ok(!err.message.includes('constraintsSource'));
				return true;
			},
		);
	}
});
