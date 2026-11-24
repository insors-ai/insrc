/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f9d4ab4c90c0b4c s1/t7 integration tests: linkDocsToIssues on an ISSUE
 * head rewrites docs/standalone/<slug>-E<anchor>/ISSUE.md via
 * renderIssueMarkdownWithTracker (marker + canonical body + **Tracker:**
 * line) and S001/LLD.md; no docs/epics entry; with no ref, ISSUE.md is
 * byte-identical to renderIssueMarkdown. tracker.post variants on the pushed
 * ISSUE fixture: lld+s1 posts to the adopted story ref; hld/amendment/non-s1
 * refuse.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/link-issue-docs.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { linkDocsToIssues } from '../link.js';
import { renderIssueMarkdown, renderIssueMarkdownWithTracker } from '../../artifacts/issue.js';
import { artifactJsonPath, issueArtifactId, lldArtifactId, issueArtifactPaths, lldArtifactPaths, workItemAnchorCreatedAt, workItemKindOf, IMPLIED_ISSUE_STORY_ID } from '../../storage.js';
import { writeAtomic } from '../../storage.js';
import { bindUnitIssue } from '../link.js';
import { assemblePostContext } from '../../runners/tracker/context.js';
import { markApprovedSync } from '../../__tests__/lifecycle-fixtures.js';

const HASH = '5f9d4ab4c90c0b4c';
const SLUG = 'issue-anchored-item';
const CREATED = '2026-11-16T07:14:04.399Z';

function seed(): { repo: string; issue: ReturnType<typeof JSON.parse> & { meta: Record<string, unknown> }; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-link-issue-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const json = artifactJsonPath(repo, issueArtifactId(HASH));
	writeAtomic(json, JSON.stringify({
		meta: { workflow: 'issue', runId: 'i1', schemaVersion: 1, issueHash: HASH, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, epicCreatedAt: CREATED, standalone: true, magnitude: 'sized' },
		body: { title: 'ISSUE title', reproduction: 'steps', rootCause: 'cause', fixIntent: 'fix' },
		citations: [],
	}, null, 2));
	markApprovedSync(json);
	writeAtomic(artifactJsonPath(repo, lldArtifactId(HASH, IMPLIED_ISSUE_STORY_ID)), JSON.stringify({
		meta: { workflow: 'design.story', runId: 'l1', schemaVersion: 1, repoPath: repo, epicHash: HASH, epicSlug: SLUG, storyId: IMPLIED_ISSUE_STORY_ID, createdAt: CREATED, epicCreatedAt: CREATED, standalone: true, hldEffectiveHash: 'deadbeefcafe0000' },
		body: {
			chosenAlternative: 'a1',
			alternativesConsidered: [{ id: 'a1', reasonRejected: 'n/a' }],
			openQuestions: [],
			dataModelChanges: [],
			interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			contractDetails: { surfaceLevel: 'internal', api: [] },
			testStrategy: { testFramework: 'node:test', testLevels: [], acceptanceMapping: [] },
			hldContextSlice: { frameworkSummary: 's', ownedContracts: [], consumedContracts: [], boundary: { storyId: IMPLIED_ISSUE_STORY_ID, owns: [], consumes: [] }, adjacentBoundaries: [], rolloutPhase: 'p1' },
		},
		citations: [],
	}, null, 2));
	markApprovedSync(artifactJsonPath(repo, lldArtifactId(HASH, IMPLIED_ISSUE_STORY_ID)));
	return { repo, issue: JSON.parse(readFileSync(json, 'utf8')), cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function issueMdPath(repo: string): string {
	const meta = JSON.parse(readFileSync(artifactJsonPath(repo, issueArtifactId(HASH)), 'utf8')).meta;
	return issueArtifactPaths(repo, HASH, workItemAnchorCreatedAt(meta), workItemKindOf(meta), SLUG).md;
}

test('src/workflow/tracker/link.ts linkDocsToIssues — docs/standalone ISSUE.md contains marker + canonical body bytes + **Tracker:** line after push, byte-identical to renderIssueMarkdown without a ref; S001/LLD.md relinked; no docs/epics entry', () => {
	// no ref yet: ISSUE.md byte-identical to renderIssueMarkdown
	{
		const fx = seed();
		try {
			// write the doc as the issue stage would (no tracker line yet)
			const p = issueMdPath(fx.repo);
			mkdirSync(join(p, '..'), { recursive: true });
			writeFileSync(p, renderIssueMarkdown(fx.issue as never));
			linkDocsToIssues(fx.repo, HASH, SLUG, {});
			assert.equal(readFileSync(p, 'utf8'), renderIssueMarkdown(fx.issue as never), 'no ref -> byte-identical');
			assert.ok(!existsSync(join(fx.repo, 'docs', 'epics')), 'no docs/epics entry for an ISSUE head');
		} finally { fx.cleanup(); }
	}
	// with the ref bound: ISSUE.md carries marker + canonical body + tracker line
	{
		const fx = seed();
		try {
			bindUnitIssue({ unit: 'epic', repoPath: fx.repo, epicHash: HASH }, 'acme/demo#42');
			bindUnitIssue({ unit: 'story', repoPath: fx.repo, epicHash: HASH, storyId: IMPLIED_ISSUE_STORY_ID }, 'acme/demo#42');
			const p = issueMdPath(fx.repo);
			mkdirSync(join(p, '..'), { recursive: true });
			writeFileSync(p, renderIssueMarkdown(fx.issue as never));
			linkDocsToIssues(fx.repo, HASH, SLUG, { epicRef: 'acme/demo#42', storyRefs: { [IMPLIED_ISSUE_STORY_ID]: 'acme/demo#42' } });
			const md = readFileSync(p, 'utf8');
			const expected = renderIssueMarkdownWithTracker(fx.issue as never, 'acme/demo#42');
			assert.equal(md, expected, 'ISSUE.md == renderIssueMarkdownWithTracker(issue, ref)');
			const marker = `<!-- insrc:artifact ISSUE-${HASH} -->`;
			assert.ok(md.startsWith(marker), 'artifact marker first');
			assert.ok(md.includes('**Tracker:** [acme/demo#42](https://github.com/acme/demo/issues/42)'), 'tracker line after marker');
			assert.ok(md.includes('# ISSUE title'), 'canonical body bytes present');
			// the marker+line+canonical-body structure: marker, blank, tracker line, then the rest of renderIssueMarkdown
			const base = renderIssueMarkdown(fx.issue as never);
			assert.ok(md.includes(base.slice(marker.length).trimStart()), 'canonical body bytes byte-identical');
			assert.ok(!existsSync(join(fx.repo, 'docs', 'epics')), 'still no docs/epics entry');
			// S001/LLD.md relinked and carries the story tracker link
			const lldMd = readFileSync(lldArtifactPaths(fx.repo, HASH, IMPLIED_ISSUE_STORY_ID, workItemAnchorCreatedAt(JSON.parse(readFileSync(artifactJsonPath(fx.repo, issueArtifactId(HASH)), 'utf8')).meta), workItemKindOf(JSON.parse(readFileSync(artifactJsonPath(fx.repo, issueArtifactId(HASH)), 'utf8')).meta), SLUG).md, 'utf8');
			assert.ok(lldMd.includes('**Tracker:** [acme/demo#42](https://github.com/acme/demo/issues/42)'), 'S001/LLD.md relinked with the story tracker line: ' + lldMd.slice(0, 200));
		} finally { fx.cleanup(); }
	}
});

test('tracker.post on pushed ISSUE fixture — lld+s1 posts to adopted story ref; hld/amendment/non-s1 refuse', async () => {
	const fx = seed();
	try {
		bindUnitIssue({ unit: 'epic', repoPath: fx.repo, epicHash: HASH }, 'acme/demo#42');
		bindUnitIssue({ unit: 'story', repoPath: fx.repo, epicHash: HASH, storyId: IMPLIED_ISSUE_STORY_ID }, 'acme/demo#42');
		const cfg = join(fx.repo, 'repo-config.json');
		writeFileSync(cfg, JSON.stringify({ repos: { [fx.repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		const prior = process.env['INSRC_REPO_CONFIG'];
		process.env['INSRC_REPO_CONFIG'] = cfg;
		try {
			const ctx = (target: unknown) => ({ intent: { repoPath: fx.repo, workflow: 'tracker.post', params: { epicHash: HASH, target } } } as never);
			const ok = await assemblePostContext(ctx({ kind: 'lld', storyId: 's1' }));
			assert.equal(ok.headKind, 'issue');
			assert.equal(ok.target.issueRef, 'acme/demo#42', 'lld+s1 posts to the adopted story ref (same as root)');
			await assert.rejects(() => assemblePostContext(ctx({ kind: 'hld' })), /not supported for an ISSUE-anchored/);
			await assert.rejects(() => assemblePostContext(ctx({ kind: 'amendment', amendmentId: 'AMD-1' })), /not supported for an ISSUE-anchored/);
			await assert.rejects(() => assemblePostContext(ctx({ kind: 'lld', storyId: 's9' })), /only the implied story/);
		} finally { process.env['INSRC_REPO_CONFIG'] = prior; }
	} finally { fx.cleanup(); }
});
