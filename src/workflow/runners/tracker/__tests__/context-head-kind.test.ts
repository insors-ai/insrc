/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f9d4ab4c90c0b4c s1/t2 unit tests: the tracker context assemblers branch
 * on the work item's head kind. A DEF head produces a context byte-identical to
 * the pre-change shape; an ISSUE head carries headKind 'issue' plus a
 * prerendered epicBodyMd (renderIssueEpicBody) and the implied s1 story.
 *
 * Run: npx tsx --test src/workflow/runners/tracker/__tests__/context-head-kind.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assemblePushContext, assembleSyncContext, assemblePostContext } from '../context.js';
import { artifactJsonPath, defineArtifactId, issueArtifactId, lldArtifactId } from '../../../storage.js';
import { patchTrackerMeta } from '../../../tracker/refs.js';
import { bindArtifact } from '../../../tracker/binding.js';
import { ArtifactIds } from '../../../artifact-ids.js';
import { approvedMeta } from '../../../__tests__/lifecycle-fixtures.js';
import { IMPLIED_ISSUE_STORY_ID } from '../../../storage.js';
import type { StepRunnerContext } from '../../../types.js';
import type { IssueArtifact } from '../../../artifacts/issue.js';
import type { DefineArtifact } from '../../../artifacts/define.js';

const HASH = '5f9d4ab4c90c0b4c';
const SLUG = 'issue-anchored-item';
const CREATED = '2026-11-16T07:14:04.399Z';

interface Fx { repo: string; def: string; issue: string; cleanup: () => void }

function seed(): Fx {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-ctx-head-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const cfg = join(repo, 'repo-config.json');
	writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
	const prior = process.env['INSRC_REPO_CONFIG'];
	process.env['INSRC_REPO_CONFIG'] = cfg;
	const base = { repoPath: repo, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, epicCreatedAt: CREATED };
	const put = (id: string, doc: unknown): string => {
		const p = artifactJsonPath(repo, id);
		writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
		return p;
	};
	const def = put(defineArtifactId(HASH), {
		meta: { workflow: 'define', runId: 'd1', ...base, schemaVersion: 1, ...approvedMeta() },
		body: {
			flavor: 'enhancement',
			problem: 'DEF heads keep their exact pre-change context. Second sentence stays.',
			nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'DEF story one', userValue: 'uv', acceptanceCriteria: [{ id: 'ac1', given: 'g', when: 'w', then: 't' }] }],
			openQuestions: [],
		},
		citations: [],
	} as unknown as never);
	const issue = put(issueArtifactId(HASH), {
		meta: { workflow: 'issue', runId: 'i1', ...base, schemaVersion: 1, issueHash: HASH, standalone: true, magnitude: 'sized', ...approvedMeta() },
		body: { title: 'ISSUE title verbatim', reproduction: 'steps', rootCause: 'cause', fixIntent: 'fix' },
		citations: [],
	} as unknown as never) as string;
	put(lldArtifactId(HASH, IMPLIED_ISSUE_STORY_ID), {
		meta: { workflow: 'design.story', runId: 'l1', ...base, storyId: IMPLIED_ISSUE_STORY_ID, hldBaseRunId: 'h1', hldEffectiveHash: 'deadbeefcafe0000', hldAmendmentsApplied: [], schemaVersion: 1, ...approvedMeta() },
		body: { chosenAlternative: 'a1', contractDetails: { surfaceLevel: 'internal', api: [] }, testStrategy: { testFramework: 'node:test', testLevels: [] } },
		citations: [],
	} as unknown as never);
	return { repo, def, issue, cleanup: () => { process.env['INSRC_REPO_CONFIG'] = prior; rmSync(repo, { recursive: true, force: true }); } };
}

function ctx(fx: Fx, workflow: string, params: Record<string, unknown> = {}): StepRunnerContext {
	return { intent: { repoPath: fx.repo, workflow, params: { epicHash: HASH, ...params } } } as unknown as StepRunnerContext;
}

test('src/workflow/runners/tracker/context.ts assemblers — kind branches: DEF context byte-identical to pre-change baseline, ISSUE context carries headKind + prerendered epicBodyMd', async () => {
	// DEF head only: the push context has NO headKind key, the DEF body fields,
	// and the story list from the DEF — exactly the pre-change shape.
	{
		const fx = seed();
		try {
			const c = await assemblePushContext(ctx(fx, 'tracker.push'));
			assert.equal('headKind' in c, false, 'DEF push context must not carry headKind');
			assert.equal(c.epicTitle, 'DEF heads keep their exact pre-change context.');
			assert.ok(c.epicBodyMd.includes('## Problem'));
			assert.deepEqual(c.stories.map(s => s.id), ['s1']);
			assert.ok(c.stories[0]!.bodyMd.includes('## Acceptance criteria'));
			assert.equal(c.epicSlug, SLUG);
			assert.equal(c.force, false);
		} finally { fx.cleanup(); }
	}
	// ISSUE head only (no DEF file): headKind 'issue', prerendered ISSUE body,
	// the single implied story, and epicTitle = the ISSUE title verbatim.
	{
		const fx = seed();
		try {
			rmSync(fx.def, { force: true });
			const c = await assemblePushContext(ctx(fx, 'tracker.push'));
			assert.equal(c.headKind, 'issue');
			assert.equal(c.epicTitle, 'ISSUE title verbatim');
			assert.ok(c.epicBodyMd.startsWith('# ISSUE title verbatim'), c.epicBodyMd.slice(0, 80));
			assert.ok(c.epicBodyMd.includes('## Reproduction'));
			assert.ok(c.epicBodyMd.includes('## Root cause'));
			assert.ok(c.epicBodyMd.includes('## Fix intent'));
			assert.ok(!c.epicBodyMd.includes('## Problem'), 'no DEF-only sections');
			assert.deepEqual(c.stories.map(s => s.id), [IMPLIED_ISSUE_STORY_ID]);
			assert.equal(c.stories[0]!.title, 'ISSUE title verbatim');
			// an approval-time issueRef seeds both the epic ref and the s1 story ref
			patchTrackerMeta(fx.issue, { issueRef: 'acme/demo#42' });
			// finalize binds the EPIC/STORY heads via ensureUnitHead + bindArtifact; seed the head files directly
			for (const id of [ArtifactIds.make({ kind: 'EPIC', epicHash: HASH }), ArtifactIds.make({ kind: 'STORY', epicHash: HASH, story: IMPLIED_ISSUE_STORY_ID })]) {
				writeFileSync(artifactJsonPath(fx.repo, id!), JSON.stringify({ meta: { repoPath: fx.repo, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1 }, body: {}, citations: [] }, null, 2) + '\n');
			}
			assert.ok(bindArtifact(fx.repo, ArtifactIds.make({ kind: 'EPIC', epicHash: HASH }), 'acme/demo#42').ok, 'bind the EPIC head like finalize does');
			assert.ok(bindArtifact(fx.repo, ArtifactIds.make({ kind: 'STORY', epicHash: HASH, story: IMPLIED_ISSUE_STORY_ID }), 'acme/demo#42').ok, 'bind the STORY-s1 head like finalize does');
			const c2 = await assemblePushContext(ctx(fx, 'tracker.push'));
			assert.equal(c2.existingRefs?.epicRef, 'acme/demo#42');
			assert.equal(c2.existingRefs?.storyRefs?.[IMPLIED_ISSUE_STORY_ID], 'acme/demo#42');
			// sync context mirrors the kind + refs
			const s = await assembleSyncContext(ctx(fx, 'tracker.sync'));
			assert.equal(s.headKind, 'issue');
			assert.equal(s.refs.epicRef, 'acme/demo#42');
			assert.equal(s.refs.storyRefs[IMPLIED_ISSUE_STORY_ID], 'acme/demo#42');
			// post lld+s1 resolves to the root issue; hld refuses on an ISSUE head
			const p = await assemblePostContext(ctx(fx, 'tracker.post', { target: { kind: 'lld', storyId: 's1' } }));
			assert.equal(p.headKind, 'issue');
			assert.equal(p.target.issueRef, 'acme/demo#42');
			await assert.rejects(() => assemblePostContext(ctx(fx, 'tracker.post', { target: { kind: 'hld' } })), /not supported for an ISSUE-anchored/);
			await assert.rejects(() => assemblePostContext(ctx(fx, 'tracker.post', { target: { kind: 'lld', storyId: 's9' } })), /only the implied story/);
		} finally { fx.cleanup(); }
	}
	// DEF context for sync carries no headKind and reads refs from the EPIC head
	// binding only — byte-identical to the pre-change path.
	{
		const fx = seed();
		try {
			writeFileSync(artifactJsonPath(fx.repo, ArtifactIds.make({ kind: 'EPIC', epicHash: HASH })!), JSON.stringify({ meta: { repoPath: fx.repo, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1 }, body: {}, citations: [] }, null, 2) + '\n');
			assert.ok(bindArtifact(fx.repo, ArtifactIds.make({ kind: 'EPIC', epicHash: HASH }), 'acme/demo#7').ok);
			const s = await assembleSyncContext(ctx(fx, 'tracker.sync'));
			assert.equal('headKind' in s, false);
			assert.equal(s.refs.epicRef, 'acme/demo#7');
		} finally { fx.cleanup(); }
	}
});

void (0 as unknown as DefineArtifact);
void (0 as unknown as IssueArtifact);
