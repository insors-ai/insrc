/**
 * plans/docs-module.md Section 8.4. assembleLiveProjectContext
 * rollup: family breakdown, top subjects, decisions, constraints,
 * recent activity, placeholder count.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { writeDocSummary } from '../../../db/doc-summaries.js';
import { upsertEntities } from '../../../db/entities.js';
import { addRepo } from '../../../db/repos.js';
import type { Entity, RegisteredRepo } from '../../../shared/types.js';
import type { DocSummary } from '../../../shared/analyze-types.js';

import { assembleLiveProjectContext } from '../live-project-context.js';

const REPO = '/repo/alpha';
const NOW = '2026-07-06T12:00:00.000Z';
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

function makeCodeEntity(file: string, name: string): Entity {
	return {
		id:        makeEntityId(REPO, file, 'function', name),
		kind:      'function',
		name,
		language:  'typescript',
		repoId:    1,
		repo:      REPO,
		file,
		startLine: 1,
		endLine:   10,
		body:      `function ${name}() {}`,
		embedding: [],
		indexedAt: NOW,
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

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-live-project-context-'));
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
// Empty repo
// ---------------------------------------------------------------------------

test('assembleLiveProjectContext returns zero-doc context for a repo with no summaries', async () => {
	const ctx = await assembleLiveProjectContext(null, REPO);
	assert.equal(ctx.totalDocs, 0);
	assert.equal(ctx.decisions.length, 0);
	assert.equal(ctx.constraints.length, 0);
	assert.equal(ctx.topSubjects.length, 0);
	assert.equal(ctx.recentActivity.length, 0);
	assert.equal(ctx.placeholderCount, 0);
	// Every family key present, all zero
	assert.equal(ctx.familyBreakdown.design, 0);
	assert.equal(ctx.familyBreakdown.plans, 0);
	assert.equal(ctx.familyBreakdown.other, 0);
});

// ---------------------------------------------------------------------------
// Family breakdown
// ---------------------------------------------------------------------------

test('familyBreakdown counts summaries per family', async () => {
	const d1 = makeDoc(`${REPO}/design/a.md`, 'a');
	const d2 = makeDoc(`${REPO}/design/b.md`, 'b');
	const p1 = makeDoc(`${REPO}/plans/x.md`, 'x');
	const rm = makeDoc(`${REPO}/README.md`, 'readme');
	await upsertEntities(null, [d1, d2, p1, rm]);

	await writeDocSummary(null, d1.id, REPO, makeSummary({ family: 'design' }));
	await writeDocSummary(null, d2.id, REPO, makeSummary({ family: 'design' }));
	await writeDocSummary(null, p1.id, REPO, makeSummary({ family: 'plans' }));
	await writeDocSummary(null, rm.id, REPO, makeSummary({ family: 'readme' }));

	const ctx = await assembleLiveProjectContext(null, REPO);
	assert.equal(ctx.familyBreakdown.design, 2);
	assert.equal(ctx.familyBreakdown.plans, 1);
	assert.equal(ctx.familyBreakdown.readme, 1);
	assert.equal(ctx.familyBreakdown.other, 0);
	assert.equal(ctx.totalDocs, 4);
});

// ---------------------------------------------------------------------------
// Decisions + constraints
// ---------------------------------------------------------------------------

test('decisions + constraints roll up with citations', async () => {
	const d1 = makeDoc(`${REPO}/design/a.md`, 'a');
	const d2 = makeDoc(`${REPO}/design/b.md`, 'b');
	await upsertEntities(null, [d1, d2]);

	await writeDocSummary(null, d1.id, REPO, makeSummary({
		title:          'A Design',
		family:         'design',
		keyDecisions:   ['use qwen3.6', 'shapers run serially'],
		keyConstraints: ['no direct cloud REST'],
	}));
	await writeDocSummary(null, d2.id, REPO, makeSummary({
		title:          'B Design',
		family:         'design',
		keyDecisions:   ['scope-picker for slash commands'],
		keyConstraints: ['every prompt validated at boot', 'no fence-wrap in structured output'],
	}));

	const ctx = await assembleLiveProjectContext(null, REPO);
	assert.equal(ctx.decisions.length, 3);
	assert.equal(ctx.constraints.length, 3);

	// Each decision carries its source entity id + doc title
	const decisionByText = new Map(ctx.decisions.map(d => [d.decision, d]));
	assert.ok(decisionByText.has('use qwen3.6'));
	assert.equal(decisionByText.get('use qwen3.6')!.sourceEntityId, d1.id);
	assert.equal(decisionByText.get('use qwen3.6')!.docTitle, 'A Design');
	assert.equal(decisionByText.get('use qwen3.6')!.family, 'design');

	const constraintByText = new Map(ctx.constraints.map(c => [c.constraint, c]));
	assert.equal(constraintByText.get('no direct cloud REST')!.sourceEntityId, d1.id);
	assert.equal(constraintByText.get('no fence-wrap in structured output')!.sourceEntityId, d2.id);
});

test('decisions cap respects maxDecisions option', async () => {
	const d1 = makeDoc(`${REPO}/design/a.md`, 'a');
	await upsertEntities(null, [d1]);
	await writeDocSummary(null, d1.id, REPO, makeSummary({
		keyDecisions:   ['d1', 'd2', 'd3', 'd4', 'd5'],
		keyConstraints: [],
	}));

	const ctx = await assembleLiveProjectContext(null, REPO, { maxDecisions: 2 });
	assert.equal(ctx.decisions.length, 2);
});

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

test('topSubjects tallies + sorts by document count desc', async () => {
	const d1 = makeDoc(`${REPO}/design/a.md`, 'a');
	const d2 = makeDoc(`${REPO}/design/b.md`, 'b');
	const d3 = makeDoc(`${REPO}/design/c.md`, 'c');
	await upsertEntities(null, [d1, d2, d3]);

	await writeDocSummary(null, d1.id, REPO, makeSummary({ subjects: ['analyze', 'shaper'] }));
	await writeDocSummary(null, d2.id, REPO, makeSummary({ subjects: ['analyze', 'planner'] }));
	await writeDocSummary(null, d3.id, REPO, makeSummary({ subjects: ['analyze'] }));

	const ctx = await assembleLiveProjectContext(null, REPO);
	assert.equal(ctx.topSubjects[0]!.subject, 'analyze');
	assert.equal(ctx.topSubjects[0]!.docCount, 3);
	// shaper + planner tied at 1 each; either can come next
	const rest = ctx.topSubjects.slice(1).map(s => s.subject).sort();
	assert.deepEqual(rest, ['planner', 'shaper']);
});

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

test('recentActivity sorts by summarisedAt desc + populates file path', async () => {
	const dA = makeDoc(`${REPO}/design/a.md`, 'a');
	const dB = makeDoc(`${REPO}/design/b.md`, 'b');
	const dC = makeDoc(`${REPO}/design/c.md`, 'c');
	await upsertEntities(null, [dA, dB, dC]);

	await writeDocSummary(null, dA.id, REPO, makeSummary({
		title: 'A', summarisedAt: '2026-07-01T00:00:00.000Z',
	}));
	await writeDocSummary(null, dB.id, REPO, makeSummary({
		title: 'B', summarisedAt: '2026-07-05T00:00:00.000Z',
	}));
	await writeDocSummary(null, dC.id, REPO, makeSummary({
		title: 'C', summarisedAt: '2026-07-03T00:00:00.000Z',
	}));

	const ctx = await assembleLiveProjectContext(null, REPO);
	assert.equal(ctx.recentActivity.length, 3);
	assert.equal(ctx.recentActivity[0]!.title, 'B');
	assert.equal(ctx.recentActivity[1]!.title, 'C');
	assert.equal(ctx.recentActivity[2]!.title, 'A');
	// File paths are populated from the entity table
	assert.equal(ctx.recentActivity[0]!.file, `${REPO}/design/b.md`);
});

// ---------------------------------------------------------------------------
// Code entity count
// ---------------------------------------------------------------------------

test('totalCodeEntities excludes artefacts', async () => {
	const doc = makeDoc(`${REPO}/design/a.md`, 'a');
	const fn1 = makeCodeEntity(`${REPO}/src/foo.ts`, 'foo');
	const fn2 = makeCodeEntity(`${REPO}/src/bar.ts`, 'bar');
	await upsertEntities(null, [doc, fn1, fn2]);
	await writeDocSummary(null, doc.id, REPO, makeSummary());

	const ctx = await assembleLiveProjectContext(null, REPO);
	assert.equal(ctx.totalDocs, 1);
	assert.equal(ctx.totalCodeEntities, 2);
});

// ---------------------------------------------------------------------------
// Placeholder handling
// ---------------------------------------------------------------------------

test('placeholder rows count into placeholderCount but not decisions/constraints', async () => {
	const dA = makeDoc(`${REPO}/design/a.md`, 'a');
	const dB = makeDoc(`${REPO}/design/b.md`, 'b');
	await upsertEntities(null, [dA, dB]);

	await writeDocSummary(null, dA.id, REPO, makeSummary({
		keyDecisions: ['real decision'],
	}));
	await writeDocSummary(null, dB.id, REPO, makeSummary({
		errorCode:     'llm-unavailable',
		keyDecisions:  [],
		keyConstraints: [],
		summary:        '',
	}));

	const ctx = await assembleLiveProjectContext(null, REPO);
	assert.equal(ctx.totalDocs, 2);
	assert.equal(ctx.placeholderCount, 1);
	assert.equal(ctx.decisions.length, 1);
	assert.equal(ctx.decisions[0]!.decision, 'real decision');
});
