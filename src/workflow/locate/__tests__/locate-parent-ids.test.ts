/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * s1/t14 — the locator maps a docs path to its work item through the stored artifacts, never through
 * the folder name, and a located parent links correctly in a repository with several epics.
 *
 * Run: npx tsx --test src/workflow/locate/__tests__/locate-parent-ids.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildDocPathIndex, refFromDocPath } from '../infer.js';
import { mapSemanticHits } from '../infer-daemon.js';
import { locateParent } from '../locate-parent.js';
import { createBugfixTrackerIssue, defaultTrackerCreateDeps, legacyParentSlug, parentRefIdentifiers } from '../../bugfix/tracker.js';
import type { IssueArtifact } from '../../artifacts/issue.js';
import type { ResolvedGithubConfig } from '../../config/github.js';
import type { WorkItemRef } from '../../types.js';
import { resolveWorkflowRef } from '../../tracker/resolve.js';
import { deriveMdPath } from '../../pending.js';
import type { Entity } from '../../../shared/types.js';

const HASH_A = '1111aaaa2222bbbb';
const HASH_B = '3333cccc4444dddd';
const CREATED_A = '2026-07-17T07:42:28.275Z';
const CREATED_B = '2026-09-02T10:00:00.000Z';

function writeJson(path: string, obj: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

/** Two epics, each with a DEF (epic issue #1 / #20) and an LLD s1 (story issue #5 / #25). */
function twoEpics(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-locate-ids-'));
	const dir = join(repo, '.insrc/artifacts');
	for (const [hash, slug, created, epicRef, storyRef] of [
		[HASH_A, 'alpha-epic', CREATED_A, 'acme/demo#1', 'acme/demo#5'],
		[HASH_B, 'beta-epic', CREATED_B, 'acme/demo#20', 'acme/demo#25'],
	] as const) {
		writeJson(join(dir, `DEF-${hash}.json`), {
			meta: { workflow: 'define', epicHash: hash, epicSlug: slug, createdAt: created, epicCreatedAt: created, schemaVersion: 1,
				tracker: { adapter: 'github', epicRef, storyRefs: { s1: storyRef } } },
			body: { stories: [{ id: 's1' }] }, citations: [],
		});
		writeJson(join(dir, `LLD-${hash}-s1.json`), {
			meta: { workflow: 'design.story', epicHash: hash, epicSlug: slug, storyId: 's1', createdAt: created, epicCreatedAt: created, schemaVersion: 1,
				tracker: { adapter: 'github', storyRef } },
			body: {},
		});
	}
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const GH: ResolvedGithubConfig = {
	type: 'github', owner: 'acme', repo: 'demo',
	epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task',
	useMilestones: false, pushTasks: false, commitArtifacts: true,
	taskIssueType: 'Task', epicIssueType: 'Epic', storyIssueType: 'Story',
	source: 'per-repo-config',
};

function bugfixIssue(parentRef: WorkItemRef): IssueArtifact {
	return {
		meta: { workflow: 'issue', runId: 'r', repoPath: '/repo', createdAt: '2026-10-20T00:00:00.000Z', elapsedMs: 1, repoIndexedAt: null,
			schemaVersion: 1, issueHash: 'abcd1234abcd1234', approvedAt: '2026-10-20T00:00:01.000Z', parentRef } as IssueArtifact['meta'],
		body: { title: 'Fix the boom', reproduction: 'do X', rootCause: 'Y', fixIntent: 'Z' },
		citations: [],
	};
}

function entity(file: string): Entity {
	return { id: file, kind: 'artifact', name: 'doc', file, repo: '/r', startLine: 1, endLine: 1, language: 'markdown', body: '' } as unknown as Entity;
}

test('a parent is located and linked correctly in a repository with several epics and no code parses a folder name into an id', async () => {
	const s = twoEpics();
	try {
		const index = buildDocPathIndex(s.repo);
		const lldA = deriveMdPath(s.repo, 'LLD', { epicHash: HASH_A, epicSlug: 'alpha-epic', epicCreatedAt: CREATED_A, storyId: 's1' });
		const lldB = deriveMdPath(s.repo, 'LLD', { epicHash: HASH_B, epicSlug: 'beta-epic', epicCreatedAt: CREATED_B, storyId: 's1' });
		const defB = deriveMdPath(s.repo, 'DEF', { epicHash: HASH_B, epicSlug: 'beta-epic', epicCreatedAt: CREATED_B });

		// a docs path maps to the epic and story its stored artifact names, whichever epic it is
		assert.deepEqual(refFromDocPath(index, lldA), { epicHash: HASH_A, storyId: 's1', slug: `STORY-${HASH_A}-s1` });
		assert.deepEqual(refFromDocPath(index, lldB), { epicHash: HASH_B, storyId: 's1', slug: `STORY-${HASH_B}-s1` });
		assert.deepEqual(refFromDocPath(index, defB), { epicHash: HASH_B, slug: `EPIC-${HASH_B}` });
		// a relative path works too, and a path no stored artifact renders to is not guessed from its folder name
		assert.equal(refFromDocPath(index, lldA.slice(s.repo.length + 1))?.epicHash, HASH_A);
		assert.equal(refFromDocPath(index, 'docs/epics/alpha-epic-E2026071711a1b2c3/s2/LLD.md'), null);
		assert.equal(refFromDocPath(index, 'docs/epics/alpha-epic-E202607179999ffff/S001/LLD.md'), null);

		// an ISSUE whose hash is shorter than an Epic's is indexed by its own id and does not abort the index
		const SHORT = 'abcd1234';
		writeJson(join(s.repo, `.insrc/artifacts/ISSUE-${SHORT}.json`), {
			meta: { workflow: 'issue', issueHash: SHORT, epicSlug: 'short-bug', createdAt: CREATED_A, epicCreatedAt: CREATED_A, schemaVersion: 1 },
			body: { title: 't', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [],
		});
		const withShort = buildDocPathIndex(s.repo);
		const issueMd = deriveMdPath(s.repo, 'ISSUE', { issueHash: SHORT, epicSlug: 'short-bug', epicCreatedAt: CREATED_A });
		assert.deepEqual(refFromDocPath(withShort, issueMd), { epicHash: SHORT, slug: `ISSUE-${SHORT}` });
		assert.equal(refFromDocPath(withShort, lldB)?.epicHash, HASH_B, 'the other epics are still indexed');

		// semantic hits map the same way
		const ranked = mapSemanticHits([entity(lldB), entity(defB), entity('src/code.ts'), entity(lldA)], index);
		assert.deepEqual(ranked.map(r => r.parentRef.epicHash), [HASH_B, HASH_B, HASH_A]);

		// the located parent resolves to its own story issue, for each epic
		const create = defaultTrackerCreateDeps();
		for (const [hash, storyIssue] of [[HASH_A, 'acme/demo#5'], [HASH_B, 'acme/demo#25']] as const) {
			const ref = refFromDocPath(index, hash === HASH_A ? lldA : lldB)!;
			assert.equal(create.resolveParentIssueRef(s.repo, ref), storyIssue, `epic ${hash}: the Story issue is linked`);
		}

		// an explicit artifact id is located deterministically and links the same way
		const located = await locateParent(
			{ touchedPaths: [], defectDescription: '', explicitRef: `STORY-${HASH_B}-s1` },
			{ repoPath: s.repo, resolveRef: resolveWorkflowRef, inferCandidates: async () => ({ graph: [], semantic: [] }),
				promptForRef: async () => null, thresholds: { graph: 0.5, semantic: 0.5 } } as never,
		);
		assert.equal(located.tier, 'deterministic');
		assert.deepEqual(located.parentRef, { epicHash: HASH_B, storyId: 's1', slug: `STORY-${HASH_B}-s1` });
		assert.equal(create.resolveParentIssueRef(s.repo, located.parentRef!), 'acme/demo#25');

		// the bugfix issue is created and linked as a sub-issue of the located parent's own Story issue, in each epic
		for (const [parent, storyIssue] of [[located.parentRef!, 'acme/demo#25'], [refFromDocPath(index, lldA)!, 'acme/demo#5']] as const) {
			const links: Array<{ parentRef: string; childId: number }> = [];
			const linked = await createBugfixTrackerIssue({ repoPath: s.repo, issueHash: 'abcd1234abcd1234' }, {
				...create,
				resolveConfig: () => GH, authOk: () => ({ ok: true }),
				readIssue: () => bugfixIssue(parent), readRecordedRef: () => null, recordRef: () => undefined,
				createIssue: () => ({ ref: 'acme/demo#99', id: 9099, typed: false }),
				linkSubIssue: (_o, _r, parentRef, childId) => { links.push({ parentRef, childId }); },
			});
			assert.equal(linked.status, 'created');
			assert.equal(linked.linked, true, `the bugfix is linked under ${storyIssue}`);
			assert.deepEqual(links, [{ parentRef: storyIssue, childId: 9099 }]);
		}

		// a stored parentRef.slug that predates the artifact ids is converted from its epicHash and storyId, or reported and skipped
		const old: { epicHash: string; storyId: string; slug: string } = { epicHash: HASH_A, storyId: 's1', slug: 'E202607171111aaaa-S001' };
		assert.equal(legacyParentSlug(old), 'E202607171111aaaa-S001', 'the old slug is reported');
		assert.deepEqual(parentRefIdentifiers(old), [`STORY-${HASH_A}-s1`], 'and converted from epicHash and storyId, with no bare label that could match another epic');
		assert.equal(create.resolveParentIssueRef(s.repo, old), 'acme/demo#5');
		assert.deepEqual(parentRefIdentifiers({ slug: 'E202607171111aaaa-S001' }), [], 'with no epicHash the old slug is skipped, not guessed');
		assert.deepEqual(parentRefIdentifiers({ epicHash: HASH_A }), [`EPIC-${HASH_A}`]);
		assert.equal(legacyParentSlug({ slug: `STORY-${HASH_A}-s1` }), undefined);
		assert.equal(create.resolveParentIssueRef(s.repo, { slug: 'E202607171111aaaa-S001' }), null);
		// a ref pinned to an epic that is gone does not fall back to the same story label in another epic
		assert.equal(create.resolveParentIssueRef(s.repo, { epicHash: 'ffffffffffffffff', storyId: 's1', slug: 'E20260101ffffffff-S001' }), null);
	} finally { s.cleanup(); }
});

test('no locate code parses a folder name into an id', () => {
	const dir = join(import.meta.dirname, '..');
	for (const f of readdirSync(dir).filter(n => n.endsWith('.ts'))) {
		const src = readFileSync(join(dir, f), 'utf8');
		assert.doesNotMatch(src, /-E\[0-9a-f\]/, `${f} must not match a work-item folder name`);
		assert.doesNotMatch(src, /\(S\\d\+\)/, `${f} must not read a story folder (S<nnn>)`);
	}
});
