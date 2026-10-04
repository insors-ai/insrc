/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-b2e16601 / ISSUE-0855311b — where a code-review record is filed.
 *
 * Run: npx tsx --test src/workflow/code-review/__tests__/subject-paths.test.ts
 *
 * The record must land in the SAME folder as the Story's BUILD record and its
 * other artifacts. Each test composes both paths and compares them, so a change
 * that moves one writer without the other fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { codeReviewSubjectPathArgs } from '../subject-paths.js';
import { buildArtifactPaths, buildRecordFolderArgs, codeReviewArtifactPaths, writeAtomic } from '../../storage.js';
import type { CodeReviewSubject } from '../types.js';

const HASH = 'c0ffee00d15ea5e5';
const STORY = 'S001';
const ISSUE_CREATED = '2026-10-01T11:34:59.990Z';
const BUILD_CREATED = '2026-10-04T09:40:27.183Z';

function withRepo(fn: (repo: string) => void): void {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-cr-paths-'));
	try { fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

function seedMeta(repo: string, id: string, meta: Record<string, unknown>): void {
	writeAtomic(join(repo, '.insrc/artifacts', `${id}.json`), JSON.stringify({ meta }));
}

function subject(repo: string, over: Partial<CodeReviewSubject> = {}): CodeReviewSubject {
	return { repoPath: repo, epicHash: HASH, storyId: STORY, changedFiles: [], approvedLld: null, approvedPlan: null, buildRecord: null, ...over };
}

function crMd(s: CodeReviewSubject): string {
	const a = codeReviewSubjectPathArgs(s);
	return codeReviewArtifactPaths(s.repoPath, s.epicHash, s.storyId, a.createdAtISO, a.workItemKind, a.epicSlug).md;
}

/** The folder the Story's BUILD record is written to (standalone flag as persisted). */
function buildMd(repo: string, standalone: boolean, own: string): string {
	const a = buildRecordFolderArgs(repo, HASH, STORY, standalone, own);
	return buildArtifactPaths(repo, HASH, STORY, a.createdAtISO, a.workItemKind, a.epicSlug).md;
}

test('0855311b — a subject holding NO LLD and NO build record still files the review in the story\'s folder', () => {
	withRepo((repo) => {
		// The MCP review path hands the subject no build record. It used to answer
		// docs/epics/<hash>-E<today>/.
		seedMeta(repo, `ISSUE-${HASH}`, { createdAt: ISSUE_CREATED, epicSlug: 'bug-docs-review-pane', standalone: true });
		seedMeta(repo, `BUILD-${HASH}-${STORY}`, { createdAt: BUILD_CREATED, standalone: true, sizeClass: 'trivial' });

		const md = crMd(subject(repo));
		assert.equal(md, join(repo, 'docs/standalone', `bug-docs-review-pane-E20261001${HASH.slice(0, 8)}`, STORY, 'CR.md'));
		assert.equal(dirname(md), dirname(buildMd(repo, true, BUILD_CREATED)), 'the review sits beside the BUILD record');
	});
});

test('b2e16601 — the label comes from the definition head, not from what the LLD stored', () => {
	withRepo((repo) => {
		const lldCreated = '2026-10-02T09:29:49.864Z';
		seedMeta(repo, `ISSUE-${HASH}`, { createdAt: ISSUE_CREATED, epicSlug: 'the-head-label', standalone: true });
		seedMeta(repo, `LLD-${HASH}-${STORY}`, { createdAt: lldCreated, epicSlug: 'a-label-the-lld-coined', standalone: true });
		const approvedLld = { meta: { epicSlug: 'a-label-the-lld-coined', createdAt: lldCreated, standalone: true }, body: {} } as unknown as CodeReviewSubject['approvedLld'];

		const md = crMd(subject(repo, { approvedLld }));
		assert.ok(md.includes('/the-head-label-E'), md);
		assert.ok(!md.includes('a-label-the-lld-coined'), md);
		assert.equal(dirname(md), dirname(buildMd(repo, true, BUILD_CREATED)), 'one folder for the review and the BUILD record');
	});
});

test('0855311b — an LLD-only Small story: the review lands beside the LLD', () => {
	withRepo((repo) => {
		const lldCreated = '2026-10-04T05:42:33.978Z';
		seedMeta(repo, `LLD-${HASH}-${STORY}`, { createdAt: lldCreated, epicSlug: 'lock-insrc-chat', standalone: true });
		const approvedLld = { meta: { epicSlug: 'lock-insrc-chat', createdAt: lldCreated, standalone: true }, body: {} } as unknown as CodeReviewSubject['approvedLld'];
		assert.equal(
			crMd(subject(repo, { approvedLld })),
			join(repo, 'docs/standalone', `lock-insrc-chat-E20261004${HASH.slice(0, 8)}`, STORY, 'CR.md'),
		);
	});
});

test('an epic-parented story is unchanged: epic split, the DEF\'s label and anchor', () => {
	withRepo((repo) => {
		const defCreated = '2026-07-18T00:00:00.000Z';
		seedMeta(repo, `DEF-${HASH}`, { createdAt: defCreated, epicSlug: 'tag-filtering' });
		const approvedLld = { meta: { epicSlug: 'tag-filtering', createdAt: '2026-07-19T00:00:00.000Z', epicCreatedAt: defCreated }, body: {} } as unknown as CodeReviewSubject['approvedLld'];
		assert.equal(
			crMd(subject(repo, { approvedLld })),
			join(repo, 'docs/epics', `tag-filtering-E20260718${HASH.slice(0, 8)}`, STORY, 'CR.md'),
		);
	});
});

test('with nothing on disk the subject\'s own LLD is still the fallback (anchor, split and label)', () => {
	withRepo((repo) => {
		// No artifacts under .insrc at all — a subject built in a test, or a repo
		// whose store is unreadable. The held LLD's anchor, flag and label are used.
		const created = '2026-07-18T00:00:00.000Z';
		const approvedLld = { meta: { epicSlug: 'tag-filtering', createdAt: created, epicCreatedAt: created, standalone: true }, body: {} } as unknown as CodeReviewSubject['approvedLld'];
		const a = codeReviewSubjectPathArgs(subject(repo, { approvedLld }));
		assert.equal(a.createdAtISO, created);
		assert.equal(a.workItemKind, 'standalone');
		assert.equal(a.epicSlug, 'tag-filtering', 'the held label is the last resort, never a raw hash');
	});
});
