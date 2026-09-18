/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S002 (Epic add-bugfix-triage-category-insrc-framework, sc2) — the durable,
 * inspectable IssueArtifact: record family + renderer + storage paths, the
 * additive 'ISSUE' ArtifactKind, plus the orchestrator wiring that turns a
 * converged capture output into exactly one persisted IssueArtifact.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	ISSUE_SCHEMA_VERSION,
	isIssueBody,
	renderIssueMarkdown,
	type IssueArtifact,
	type IssueArtifactBody,
} from '../artifacts/issue.js';
import { issueArtifactId, issueArtifactPaths, pathsForWorkflow, writeAtomic } from '../storage.js';
import { isStoryScopedKind, resolveArtifactMdPath, deriveWorkItemIdentity, type ArtifactKind } from '../path-scheme.js';
import { finalizeArtifact, prepareDecompose, prepareSynthesize } from '../orchestrator.js';
import type { WorkflowIntent } from '../types.js';

const ISSUE_HASH   = 'abcd1234ef567890';
const ISSUE_CREATED = '2026-09-18T10:00:00.000Z';

function issueBody(overrides: Partial<IssueArtifactBody> = {}): IssueArtifactBody {
	return {
		title:        'Pager drops the final row on the last page',
		reproduction: 'Open a list with exactly one full page + 1 item; the last item is never shown.',
		rootCause:    'An off-by-one in the page-slice bound in the pager component.',
		fixIntent:    'Correct the slice bound so the final item renders on the last page.',
		...overrides,
	};
}

function issueArtifact(overrides: Partial<IssueArtifactBody> = {}): IssueArtifact {
	return {
		meta: {
			workflow:      'issue',
			runId:         'wf-issue-run',
			repoPath:      '/tmp/repo',
			createdAt:     ISSUE_CREATED,
			attribution:   { outputs: [{ role: '(client)', tier: 'core', runner: 'cli-claude', model: 'client' }] },
			elapsedMs:     5,
			repoIndexedAt: null,
			schemaVersion: ISSUE_SCHEMA_VERSION,
			issueHash:     ISSUE_HASH,
			epicSlug:      'pager-off-by-one',
			standalone:    true,
			// Routing/linking metadata that must NEVER leak into the rendered body.
			magnitude:     'sized',
			parentRef:     { storyId: 'S0PARENTREF9', slug: 'the-parent-slug' },
		},
		body:      issueBody(overrides),
		citations: [{ id: 'c1', kind: 'code', ref: 'src/cli/pager.ts:42' }],
	};
}

// ---------------------------------------------------------------------------
// Renderer + guard unit
// ---------------------------------------------------------------------------

test('renderIssueMarkdown: emits the id-marker header + one section per body field, in order', () => {
	const md = renderIssueMarkdown(issueArtifact());
	assert.match(md, /<!-- insrc:artifact ISSUE-abcd1234ef567890 -->/, 'artifact-id marker header maps md → json');
	assert.match(md, /# Pager drops the final row on the last page/);
	const repro = md.indexOf('## Reproduction');
	const cause = md.indexOf('## Root cause');
	const fix   = md.indexOf('## Fix intent');
	assert.ok(repro >= 0 && cause > repro && fix > cause, 'sections render in order');
});

test('renderIssueMarkdown: NO routing/linking metadata leaks into the GH body (k4)', () => {
	const md = renderIssueMarkdown(issueArtifact());
	// magnitude / parentRef live on meta only — never in the single-source body.
	assert.doesNotMatch(md, /sized/, 'magnitude must not appear in the issue body');
	assert.doesNotMatch(md, /S0PARENTREF9/, 'parentRef.storyId must not appear in the issue body');
	assert.doesNotMatch(md, /the-parent-slug/, 'parentRef.slug must not appear in the issue body');
	// The issueHash appears ONLY in the id marker, never as body prose.
	assert.equal(md.split('abcd1234ef567890').length - 1, 1, 'issueHash appears exactly once (the id marker)');
});

test('isIssueBody: accepts a well-formed body, rejects any missing/empty prose field', () => {
	assert.equal(isIssueBody(issueBody()), true);
	assert.equal(isIssueBody(issueBody({ title: '' })), false);
	assert.equal(isIssueBody(issueBody({ reproduction: '' })), false);
	assert.equal(isIssueBody(issueBody({ rootCause: '' })), false);
	assert.equal(isIssueBody(issueBody({ fixIntent: '' })), false);
	assert.equal(isIssueBody({ title: 'x', reproduction: 'y', rootCause: 'z' }), false, 'missing fixIntent');
	assert.equal(isIssueBody(null), false);
});

// ---------------------------------------------------------------------------
// Storage paths + the additive ArtifactKind invariant
// ---------------------------------------------------------------------------

test('issueArtifactId / issueArtifactPaths: hash-named json, nested item-root ISSUE.md under docs/standalone', () => {
	assert.equal(issueArtifactId(ISSUE_HASH), 'ISSUE-abcd1234ef567890');
	const paths = issueArtifactPaths('/tmp/repo', ISSUE_HASH, ISSUE_CREATED, 'standalone', 'pager-off-by-one');
	assert.equal(paths.json, '/tmp/repo/.insrc/artifacts/ISSUE-abcd1234ef567890.json');
	assert.match(paths.md, /^\/tmp\/repo\/docs\/standalone\/pager-off-by-one-E[0-9a-z]+\/ISSUE\.md$/);
});

test('ArtifactKind: ISSUE is an item-root singleton (NOT story-scoped); existing kinds unchanged', () => {
	assert.equal(isStoryScopedKind('ISSUE'), false, 'ISSUE is item-root, like SPEC/DEF/HLD');
	// The four existing item-root kinds stay item-root.
	for (const k of ['SPEC', 'DEF', 'HLD'] as ArtifactKind[]) {
		assert.equal(isStoryScopedKind(k), false, `${k} stays item-root`);
	}
	// The five story-scoped kinds stay story-scoped.
	for (const k of ['LLD', 'PLAN', 'BUILD', 'CR', 'EXT'] as ArtifactKind[]) {
		assert.equal(isStoryScopedKind(k), true, `${k} stays story-scoped`);
	}
	// An ISSUE path resolves to the work-item root (no S<nnn>/ segment).
	const identity = deriveWorkItemIdentity(ISSUE_HASH, ISSUE_CREATED);
	const md = resolveArtifactMdPath('/tmp/repo', identity, 'ISSUE', 'standalone', 'pager-off-by-one');
	assert.match(md, /\/docs\/standalone\/pager-off-by-one-E[0-9a-z]+\/ISSUE\.md$/);
	assert.doesNotMatch(md, /\/S\d{3}\//, 'ISSUE is item-root, never under a story subfolder');
});

test('pathsForWorkflow: workflow "issue" routes to the ISSUE.md/json keyed by meta.issueHash', () => {
	const paths = pathsForWorkflow({
		workflow: 'issue', repoPath: '/tmp/repo', epicKey: ISSUE_HASH, runId: 'wf-issue-run',
		createdAtISO: ISSUE_CREATED, issueHash: ISSUE_HASH, epicSlug: 'pager-off-by-one', standalone: true,
	});
	assert.equal(paths.json, '/tmp/repo/.insrc/artifacts/ISSUE-abcd1234ef567890.json');
	assert.match(paths.md, /\/docs\/standalone\/pager-off-by-one-E[0-9a-z]+\/ISSUE\.md$/);
	// Without a specHash-style issueHash, it fails loudly (never mis-routes).
	assert.throws(
		() => pathsForWorkflow({ workflow: 'issue', repoPath: '/tmp/repo', epicKey: 'k', runId: 'r', createdAtISO: ISSUE_CREATED }),
		/finalized without meta\.issueHash/,
	);
});

test('writeAtomic round-trip: IssueArtifact json is deep-equal + idempotent', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-issue-'));
	try {
		const artifact = issueArtifact();
		const paths = issueArtifactPaths(dir, artifact.meta.issueHash!, artifact.meta.createdAt, 'standalone', artifact.meta.epicSlug);
		const json = JSON.stringify(artifact, null, 2) + '\n';
		writeAtomic(paths.json, json);
		assert.deepEqual(JSON.parse(readFileSync(paths.json, 'utf8')), artifact);
		writeAtomic(paths.json, json);
		assert.equal(readFileSync(paths.json, 'utf8'), json);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Orchestrator wiring — the three `case 'issue'` arms
// ---------------------------------------------------------------------------

function issueIntent(magnitude: 'small' | 'sized' = 'small'): WorkflowIntent {
	return {
		workflow: 'issue', focus: 'The pager drops the last row on the final page', repoPath: '/tmp/repo',
		repoIndexedAt: null, params: { magnitude },
	};
}

/** A converged capture (s1) + audit (s2) — what the runner resumes with. */
function convergedSteps(): Record<string, unknown> {
	return {
		s1: {
			title: 'Pager drops the final row', reproduction: 'one full page + 1 item → last item hidden',
			rootCause: 'off-by-one in the page-slice bound', fixIntent: 'correct the slice bound',
			citations: [{ id: 'c1', kind: 'code', ref: 'src/cli/pager.ts:42' }],
		},
		s2: { results: [{ itemId: 'q1', verdict: 'passed', evidence: 's1.reproduction' }] },
	};
}

function synthEmit(bodyOverrides: Partial<IssueArtifactBody> = {}): Record<string, unknown> {
	return { body: issueBody(bodyOverrides), citations: [{ id: 'c1', kind: 'code', ref: 'src/cli/pager.ts:42' }] };
}

test('prepareDecompose[issue]: a fixed 2-step plan (issue.capture -> checklist.verify)', () => {
	const prompt = prepareDecompose(issueIntent());
	assert.match(prompt.systemPrompt, /issue\.capture/);
	assert.match(prompt.systemPrompt, /checklist\.verify/);
	assert.equal(typeof prompt.schema, 'object');
});

test('prepareSynthesize[issue]: supported (no throw) and grounds on the step outputs', () => {
	const prompt = prepareSynthesize(issueIntent(), convergedSteps());
	assert.match(prompt.systemPrompt, /IssueArtifact/);
	assert.match(prompt.systemPrompt, /GitHub issue body|body carries ONLY the defect prose/);
	assert.equal(typeof prompt.schema, 'object');
});

test('finalizeArtifact[issue]: converged output → exactly one IssueArtifact, magnitude on meta, approvedAt unset', () => {
	const result = finalizeArtifact(issueIntent('sized'), convergedSteps(), 'wf-issue-run', 5, synthEmit(), 'client');
	assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.failure));
	if (!result.ok) return;
	assert.equal(result.finalized.workflow, 'issue');
	const artifact = result.finalized.artifact as IssueArtifact;
	assert.equal(artifact.meta.workflow, 'issue');
	assert.ok(/^[0-9a-f]{16}$/.test(artifact.meta.issueHash ?? ''), 'mints its own run-derived issueHash');
	assert.equal(artifact.meta.magnitude, 'sized', 'magnitude carried from the seed onto meta');
	assert.equal(artifact.meta.approvedAt, undefined, 'approvedAt unset until approval');
	assert.equal(artifact.body.fixIntent, issueBody().fixIntent);
	// The rendered md is the single-source GH body (no magnitude leak).
	assert.doesNotMatch(result.finalized.renderedMd, /"magnitude"|sized\b/);
});

test('finalizeArtifact[issue]: a body failing isIssueBody is a retryable schemaFailure (no partial write)', () => {
	const bad = { body: { title: 'x', reproduction: 'y', rootCause: 'z' }, citations: [{ id: 'c1', kind: 'code', ref: 'r' }] };
	const result = finalizeArtifact(issueIntent(), convergedSteps(), 'wf-issue-run', 5, bad, 'client');
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.failure.ok, false);
});
