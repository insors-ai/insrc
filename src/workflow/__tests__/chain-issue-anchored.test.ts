/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-149283b0d0455a43 / s1 / t4 — the chain report for an ISSUE-anchored
 * work item: the definition head is read as a discriminated DEF-or-ISSUE value
 * (DEF wins), the story list is the one implied story, the story path comes
 * from the LLD's own meta (docs/standalone), and the report carries
 * definitionKind. DEF-anchored behaviour is covered by chain.test.ts and
 * chain-report-tracker.test.ts and must stay green unchanged.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildChainReport, formatChainReport } from '../chain.js';
import { artifactJsonPath, defineArtifactId, issueArtifactId, lldArtifactId } from '../storage.js';
import { writeAtomic } from '../storage.js';
import { approveReviewed, writeDefine } from './helpers/chain-fixtures.js';
import { markApprovedSync } from './lifecycle-fixtures.js';

const HASH = 'b4c5d6e7f8091a2b';
const CREATED = '2026-10-03T14:09:32.294Z';
const SLUG = 'story-list-readers-do-not-recognise';

function writeIssue(repo: string, hash: string, opts: { approved?: boolean; rejected?: boolean } = {}): string {
	const json = artifactJsonPath(repo, issueArtifactId(hash));
	mkdirSync(dirname(json), { recursive: true });
	writeAtomic(json, JSON.stringify({
		meta: {
			workflow: 'issue', runId: 'iss-1', schemaVersion: 1,
			issueHash: hash, epicHash: hash, epicSlug: SLUG,
			createdAt: CREATED, epicCreatedAt: CREATED, standalone: true, magnitude: 'sized',
		},
		body: { title: 'Make the story-list readers recognise an ISSUE-anchored work item', reproduction: 'x', rootCause: 'x', fixIntent: 'x' },
		citations: [],
	}, null, 2));
	if (opts.approved === true) markApprovedSync(json);
	return json;
}

function writeStandaloneLld(repo: string, hash: string, storyId: string, opts: { approved?: boolean } = {}): string {
	const json = artifactJsonPath(repo, lldArtifactId(hash, storyId));
	mkdirSync(dirname(json), { recursive: true });
	writeAtomic(json, JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'lld-1', schemaVersion: 1,
			epicHash: hash, epicSlug: SLUG, storyId,
			createdAt: '2026-11-16T08:00:00.000Z', epicCreatedAt: CREATED, standalone: true, sizeClass: 'bugfix',
		},
		body: {},
		citations: [],
	}, null, 2));
	if (opts.approved === true) markApprovedSync(json);
	return json;
}

function seedIssueRepo(opts: { approved?: boolean; lld?: boolean; lldApproved?: boolean } = {}): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-issue-'));
	writeIssue(repo, HASH, { approved: opts.approved === true });
	if (opts.lld === true) writeStandaloneLld(repo, HASH, 's1', { approved: opts.lldApproved === true });
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('chain report for an ISSUE-anchored item returns the implied s1 with its LLD state', () => {
	const s = seedIssueRepo({ approved: true, lld: true, lldApproved: true });
	try {
		const r = buildChainReport(s.repo, HASH);
		assert.equal(r.definitionKind, 'issue');
		assert.equal(r.define.exists, true);
		assert.equal(r.define.approved, true);
		assert.equal(r.hld.exists, false);
		assert.equal(r.stories.length, 1);
		assert.equal(r.stories[0]!.id, 's1');
		assert.equal(r.stories[0]!.title, 'Make the story-list readers recognise an ISSUE-anchored work item');
		assert.equal(r.stories[0]!.hasLld, true);
		assert.equal(r.stories[0]!.approved, true);
		assert.equal(r.stories[0]!.stale, false);
	} finally { s.cleanup(); }
});

test('chain report story path for an ISSUE-anchored item is the standalone folder', () => {
	const s = seedIssueRepo({ approved: true, lld: true, lldApproved: false });
	try {
		const r = buildChainReport(s.repo, HASH);
		const path = r.stories[0]!.path;
		assert.ok(path !== undefined, 'an existing LLD always has a path');
		assert.ok(path.includes('/docs/standalone/'), `must be under docs/standalone, got ${path}`);
		assert.ok(!path.includes('/docs/epics/'), `must NOT be under docs/epics, got ${path}`);
		assert.ok(path.includes(SLUG), `carries the ISSUE's slug folder, got ${path}`);
	} finally { s.cleanup(); }
});

test('chain report prefers a DEF when a DEF and an ISSUE share a hash', () => {
	const s = seedIssueRepo({ approved: true });
	try {
		writeDefine(s.repo, HASH);   // unapproved DEF at the same hash
		const r = buildChainReport(s.repo, HASH);
		assert.equal(r.definitionKind, 'def');
		assert.equal(r.define.approved, false, 'the DEF head answers, not the approved ISSUE');
		assert.deepEqual(r.stories.map(x => x.id), ['s1', 's2'], 'the DEF story list is used');
	} finally { s.cleanup(); }
});

test('definitionKind is issue for an ISSUE head and def for a DEF head', () => {
	const issue = seedIssueRepo({ approved: true });
	const defRepo = mkdtempSync(join(tmpdir(), 'insrc-chain-def-'));
	try {
		assert.equal(buildChainReport(issue.repo, HASH).definitionKind, 'issue');
		writeDefine(defRepo, HASH);
		assert.equal(buildChainReport(defRepo, HASH).definitionKind, 'def');
		const neither = mkdtempSync(join(tmpdir(), 'insrc-chain-none-'));
		try {
			assert.equal(buildChainReport(neither, HASH).definitionKind, undefined);
		} finally { rmSync(neither, { recursive: true, force: true }); }
	} finally { issue.cleanup(); rmSync(defRepo, { recursive: true, force: true }); }
});

test('formatChainReport labels an ISSUE head and leaves DEF output unchanged', () => {
	const issue = seedIssueRepo({ approved: true, lld: true, lldApproved: true });
	const defRepo = mkdtempSync(join(tmpdir(), 'insrc-chain-def-'));
	try {
		const issueText = formatChainReport(buildChainReport(issue.repo, HASH));
		assert.ok(issueText.includes('## Issue (bugfix)'), `ISSUE head must be labelled, got:\n${issueText}`);
		assert.ok(!issueText.includes('## Define\n'), 'an ISSUE head does not render the Define heading');

		writeDefine(defRepo, HASH);
		const defText = formatChainReport(buildChainReport(defRepo, HASH));
		assert.ok(defText.includes('## Define\n'), 'a DEF head keeps the Define heading');
		assert.ok(!defText.includes('## Issue (bugfix)'), 'a DEF head never shows the Issue label');
	} finally { issue.cleanup(); rmSync(defRepo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t5 — next-action rules for an ISSUE head
// ---------------------------------------------------------------------------

test('unapproved ISSUE yields approve-define naming the ISSUE document', () => {
	const s = seedIssueRepo({ approved: false });
	try {
		const r = buildChainReport(s.repo, HASH);
		assert.equal(r.nextAction.kind, 'approve-define');
		if (r.nextAction.kind === 'approve-define') {
			assert.ok(r.nextAction.command.includes(`ISSUE.md`), `names the ISSUE document, got ${r.nextAction.command}`);
			assert.ok(r.nextAction.command.includes(SLUG), 'the command carries the ISSUE folder path');
		}
	} finally { s.cleanup(); }
});

test('rejected ISSUE yields run-define that reruns the issue stage', () => {
	const s = seedIssueRepo({});
	try {
		// flip the seeded ISSUE to rejected
		const json = artifactJsonPath(s.repo, issueArtifactId(HASH));
		const a = JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown> };
		a.meta['lifecycle'] = { status: 'rejected', revision: { number: 1 } };
		writeFileSync(json, JSON.stringify(a, null, 2));
		const r = buildChainReport(s.repo, HASH);
		assert.equal(r.nextAction.kind, 'run-define');
		if (r.nextAction.kind === 'run-define') {
			assert.ok(r.nextAction.command.includes("workflow=issue"), `reruns the issue stage, got ${r.nextAction.command}`);
			assert.ok(!r.nextAction.command.includes("workflow=define "), 'does not advise the define stage');
		}
	} finally { s.cleanup(); }
});

test('next actions follow run-lld, approve-lld then the tracker steps and never name an HLD, amendment or stale step (ISSUE-5f9d4ab4c90c0b4c s1/t5 moved tracker steps into the ISSUE branch)', () => {
	// approved ISSUE, no LLD yet
	const noLld = seedIssueRepo({ approved: true });
	try {
		const r = buildChainReport(noLld.repo, HASH);
		assert.equal(r.nextAction.kind, 'run-lld');
		if (r.nextAction.kind === 'run-lld') {
			assert.equal(r.nextAction.storyId, 's1');
			assert.ok(r.nextAction.command.includes('"storyId":"s1"'), 'targets the implied story explicitly');
			assert.ok(r.nextAction.command.includes('"epicHash":"' + HASH + '"'), 'keeps the ISSUE anchor');
		}
	} finally { noLld.cleanup(); }

	// approved ISSUE + unapproved LLD
	const unapprovedLld = seedIssueRepo({ approved: true, lld: true, lldApproved: false });
	try {
		const r = buildChainReport(unapprovedLld.repo, HASH);
		assert.equal(r.nextAction.kind, 'approve-lld');
		if (r.nextAction.kind === 'approve-lld') assert.equal(r.nextAction.storyId, 's1');
	} finally { unapprovedLld.cleanup(); }

	// approved ISSUE + approved LLD, unpushed -> push-tracker (ISSUE-5f9d4ab4c90c0b4c s1/t5)
	const done = seedIssueRepo({ approved: true, lld: true, lldApproved: true });
	try {
		const r = buildChainReport(done.repo, HASH);
		assert.equal(r.nextAction.kind, 'push-tracker', JSON.stringify(r.nextAction));
	} finally { done.cleanup(); }

	// the forbidden kinds never appear for an ISSUE head at any stage
	for (const opts of [{}, { approved: true }, { approved: true, lld: true }, { approved: true, lld: true, lldApproved: true }]) {
		const s = seedIssueRepo(opts);
		try {
			const r = buildChainReport(s.repo, HASH);
			assert.ok(
				!['run-hld', 'approve-hld', 'review-amendment', 'refresh-stale'].includes(r.nextAction.kind),
				`ISSUE head must never yield ${r.nextAction.kind} (tracker steps ARE allowed since ISSUE-5f9d4ab4c90c0b4c s1/t5)`,
			);
		} finally { s.cleanup(); }
	}
});

test('the DEF-anchored next-action sequence is unchanged', () => {
	const defRepo = mkdtempSync(join(tmpdir(), 'insrc-chain-def-seq-'));
	try {
		// no DEF at all -> run-define (define wording, not issue)
		const none = buildChainReport(defRepo, HASH);
		assert.equal(none.nextAction.kind, 'run-define');
		if (none.nextAction.kind === 'run-define') assert.ok(none.nextAction.command.includes('workflow=define '));

		// unapproved DEF -> approve-define naming the DEF md
		writeDefine(defRepo, HASH);
		const unapproved = buildChainReport(defRepo, HASH);
		assert.equal(unapproved.nextAction.kind, 'approve-define');
		if (unapproved.nextAction.kind === 'approve-define') assert.ok(unapproved.nextAction.command.includes('DEF.md'));

		// approved DEF, no HLD -> run-hld (unchanged)
		approveReviewed(artifactJsonPath(defRepo, defineArtifactId(HASH)));
		const noHld = buildChainReport(defRepo, HASH);
		assert.equal(noHld.nextAction.kind, 'run-hld');
	} finally { rmSync(defRepo, { recursive: true, force: true }); }
});
