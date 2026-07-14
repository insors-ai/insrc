/**
 * plans/docs-module.md Phase 7. Tests for the docs_* tool surface:
 *   - docs_retrieve         -- hybrid retrieval wrapper
 *   - docs_project_context  -- LiveProjectContext markdown wrapper
 *   - docs_summary_get      -- single summary fetch
 *   - docs_family_list      -- per-family list
 *
 * Fixture: seeded LMDB with 4 doc entities across two families +
 * pre-baked DocSummary rows.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../../../../../db/graph/store.js';
import { writeDocSummary } from '../../../../../db/doc-summaries.js';
import { upsertEntities } from '../../../../../db/entities.js';
import { addRepo } from '../../../../../db/repos.js';
import type { Entity, RegisteredRepo } from '../../../../../shared/types.js';
import type { DocSummary } from '../../../../../shared/analyze-types.js';
import type { ToolDeps } from '../../../types.js';

import {
	docsFamilyListTool,
	docsProjectContextTool,
	docsRetrieveTool,
	docsSummaryGetTool,
} from '../index.js';

const REPO = '/repo/alpha';
const NOW = '2026-07-07T12:00:00.000Z';
let dir: string;

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeDoc(file: string, name: string, body = `# ${name}\nContent about ${name}`): Entity {
	return {
		id:        makeEntityId(REPO, file, 'document', name),
		kind:      'document',
		name,
		language:  'markdown',
		repoId:    1,
		repo:      REPO,
		file,
		startLine: 1,
		endLine:   body.split('\n').length,
		body,
		embedding: [],
		indexedAt: NOW,
		artifact:  true,
	};
}

function makeSummary(overrides: Partial<DocSummary> = {}): DocSummary {
	return {
		title:           overrides.title           ?? 'Test Doc',
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

const DEPS: ToolDeps = {
	closureRepos: [REPO],
	runId:        'test-run',
	sessionId:    'test-session',
} as unknown as ToolDeps;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-docs-tools-'));
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
// docs_retrieve
// ---------------------------------------------------------------------------

test('docs_retrieve returns matching doc sections + citations', async () => {
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/classifier.md`, 'classifier',
			'The classifier picks the target and scope from the user prompt.'),
		makeDoc(`${REPO}/design/planner.md`, 'planner',
			'Planner emits a Plan Task with invariant checks.'),
	]);
	const result = await docsRetrieveTool.execute({ query: 'classifier' }, DEPS);
	assert.equal(result.success, true);
	const data = result.data as { count: number; results: unknown[] };
	assert.ok(data.count >= 1);
	assert.match(result.output as string, /classifier/);
	assert.match(result.output as string, /cite: \{ kind: 'section'/);
});

test('docs_retrieve fails when session has no closure repo', async () => {
	const result = await docsRetrieveTool.execute(
		{ query: 'x' },
		{ closureRepos: [] } as unknown as ToolDeps,
	);
	assert.equal(result.success, false);
	assert.match(result.error ?? '', /closure repo/);
});

test('docs_retrieve honours filenameHint boost', async () => {
	await upsertEntities(null, [
		makeDoc(`${REPO}/design/a.md`, 'a', 'analyze framework classifier'),
		makeDoc(`${REPO}/plans/b.md`, 'b', 'analyze framework classifier'),
	]);
	const result = await docsRetrieveTool.execute(
		{ query: 'classifier', filenameHint: 'plans/' },
		DEPS,
	);
	assert.equal(result.success, true);
	const data = result.data as { results: Array<{ file: string }> };
	assert.equal(data.results[0]!.file, `${REPO}/plans/b.md`);
});

// ---------------------------------------------------------------------------
// docs_project_context
// ---------------------------------------------------------------------------

test('docs_project_context returns zero-doc context when nothing is summarised', async () => {
	const result = await docsProjectContextTool.execute({}, DEPS);
	assert.equal(result.success, true);
	const data = result.data as { totalDocs: number };
	assert.equal(data.totalDocs, 0);
	assert.match(result.output as string, /Family breakdown/);
});

test('docs_project_context rolls up decisions + constraints with citations', async () => {
	const d1 = makeDoc(`${REPO}/design/a.md`, 'a');
	const d2 = makeDoc(`${REPO}/design/b.md`, 'b');
	await upsertEntities(null, [d1, d2]);
	await writeDocSummary(null, d1.id, REPO, makeSummary({
		keyDecisions: ['use qwen3.6'],
		keyConstraints: ['no direct cloud REST'],
	}));
	await writeDocSummary(null, d2.id, REPO, makeSummary({
		keyDecisions: ['scope-picker for slash commands'],
		keyConstraints: ['every prompt validated at boot'],
	}));
	const result = await docsProjectContextTool.execute({}, DEPS);
	assert.equal(result.success, true);
	assert.match(result.output as string, /use qwen3\.6/);
	assert.match(result.output as string, /no direct cloud REST/);
	// Citations present
	assert.match(result.output as string, new RegExp(`cite: entity ${d1.id}`));
});

// ---------------------------------------------------------------------------
// docs_summary_get
// ---------------------------------------------------------------------------

test('docs_summary_get returns markdown rendered summary', async () => {
	const d = makeDoc(`${REPO}/design/foo.md`, 'foo');
	await upsertEntities(null, [d]);
	await writeDocSummary(null, d.id, REPO, makeSummary({
		title: 'Foo Design',
		keyDecisions: ['pick M scope by default'],
		keyConstraints: ['do not paraphrase'],
		subjects: ['analyze', 'shaper'],
	}));

	const result = await docsSummaryGetTool.execute({ entityId: d.id }, DEPS);
	assert.equal(result.success, true);
	assert.match(result.output as string, /Foo Design/);
	assert.match(result.output as string, /pick M scope by default/);
	assert.match(result.output as string, /do not paraphrase/);
	assert.match(result.output as string, /analyze, shaper/);
});

test('docs_summary_get returns failure when no summary exists', async () => {
	const d = makeDoc(`${REPO}/design/foo.md`, 'foo');
	await upsertEntities(null, [d]);
	const result = await docsSummaryGetTool.execute({ entityId: d.id }, DEPS);
	assert.equal(result.success, false);
	assert.equal(result.error, 'no-summary');
});

// ---------------------------------------------------------------------------
// docs_family_list
// ---------------------------------------------------------------------------

test('docs_family_list returns every summarised doc in a family', async () => {
	const d1 = makeDoc(`${REPO}/design/a.md`, 'a');
	const d2 = makeDoc(`${REPO}/design/b.md`, 'b');
	const p1 = makeDoc(`${REPO}/plans/p1.md`, 'p1');
	await upsertEntities(null, [d1, d2, p1]);
	await writeDocSummary(null, d1.id, REPO, makeSummary({ title: 'A', family: 'design' }));
	await writeDocSummary(null, d2.id, REPO, makeSummary({ title: 'B', family: 'design' }));
	await writeDocSummary(null, p1.id, REPO, makeSummary({ title: 'P1', family: 'plans' }));

	const design = await docsFamilyListTool.execute({ family: 'design' }, DEPS);
	assert.equal(design.success, true);
	const designData = design.data as { count: number; docs: Array<{ title: string }> };
	assert.equal(designData.count, 2);
	const titles = designData.docs.map(d => d.title).sort();
	assert.deepEqual(titles, ['A', 'B']);

	const plans = await docsFamilyListTool.execute({ family: 'plans' }, DEPS);
	const plansData = plans.data as { count: number };
	assert.equal(plansData.count, 1);
});

test('docs_family_list skips placeholder rows', async () => {
	const d = makeDoc(`${REPO}/design/foo.md`, 'foo');
	await upsertEntities(null, [d]);
	await writeDocSummary(null, d.id, REPO, makeSummary({
		errorCode: 'llm-unavailable',
		family:    'design',
	}));
	const result = await docsFamilyListTool.execute({ family: 'design' }, DEPS);
	const data = result.data as { count: number };
	assert.equal(data.count, 0);
});
