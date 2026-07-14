/**
 * plans/docs-module.md Phase 7. Tests for the adherence-check
 * runner's constraint-sourcing priority:
 *   1. params.constraintsSource -> upstream task's `constraints`
 *   2. params.constraints (inline)
 *   3. params.constraintIds -> LiveProjectContext keyConstraints
 *
 * Priority 1 + 2 already covered by the code adherence-check
 * runtime's existing pattern; this file focuses on priority 3
 * (constraintIds -- new in Phase 7).
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
import type { TemplateExecuteArgs } from '../../../executor/types.js';

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
		upstreamOutputs:  new Map<string, unknown>(),
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
	const resolved = await _resolveConstraintsForTest(args, args.task.params as Record<string, unknown>);
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
	const resolved = await _resolveConstraintsForTest(args, args.task.params as Record<string, unknown>);
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
	const resolved = await _resolveConstraintsForTest(args, args.task.params as Record<string, unknown>);
	assert.equal(resolved.length, 1);
	assert.equal(resolved[0]!.constraint, 'real constraint');
});

test('constraintIds fall through when the priority-1 upstream is missing', async () => {
	const d = makeDoc(`${REPO}/design/a.md`, 'a');
	await upsertEntities(null, [d]);
	await writeDocSummary(null, d.id, REPO, makeSummary({
		keyConstraints: ['fell-through'],
	}));

	// Both `constraintsSource` referenced AND `constraintIds` provided.
	// Since the source task isn't in upstreamOutputs, priority 1 misses;
	// priority 3 takes over.
	const args = makeExecuteArgs({
		constraintsSource: 'missing-taskId',
		constraintIds:     [d.id],
	});
	const resolved = await _resolveConstraintsForTest(args, args.task.params as Record<string, unknown>);
	assert.equal(resolved.length, 1);
	assert.equal(resolved[0]!.constraint, 'fell-through');
});

// ---------------------------------------------------------------------------
// Priority 1 wins over priority 2 + 3 when upstream produces valid constraints
// ---------------------------------------------------------------------------

test('priority-1 upstream overrides both inline and constraintIds', async () => {
	const d = makeDoc(`${REPO}/design/a.md`, 'a');
	await upsertEntities(null, [d]);
	await writeDocSummary(null, d.id, REPO, makeSummary({
		keyConstraints: ['from-summary'],
	}));

	const args = makeExecuteArgs({
		constraintsSource: 't-upstream',
		constraints:       [{ constraint: 'inline-constraint' }],
		constraintIds:     [d.id],
	});
	(args.upstreamOutputs as Map<string, unknown>).set('t-upstream', {
		constraints: [
			{ constraint: 'from-upstream', sourceEntityId: 'up-eid', file: '/u.md', heading: 'U' },
		],
	});
	const resolved = await _resolveConstraintsForTest(args, args.task.params as Record<string, unknown>);
	assert.equal(resolved.length, 1);
	assert.equal(resolved[0]!.constraint, 'from-upstream');
});

// ---------------------------------------------------------------------------
// None of the three -> empty
// ---------------------------------------------------------------------------

test('returns empty when no constraints source is provided', async () => {
	const args = makeExecuteArgs({});
	const resolved = await _resolveConstraintsForTest(args, args.task.params as Record<string, unknown>);
	assert.equal(resolved.length, 0);
});
