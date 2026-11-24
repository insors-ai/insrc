/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The BUILD approval check of ISSUE-1b3caadf04023d33 (s1/t5): checkBuildEpicImpact on its own, and as part of approving a BUILD.
 *
 * Run: npx tsx --test src/workflow/__tests__/epic-impact-build-check.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkBuildEpicImpact, EPIC_IMPACT_MIN_PARAGRAPH_CHARS } from '../epic-impact-build-check.js';
import { EPIC_IMPACT_LABEL } from '../epic-built-state.js';
import { approvalStateOf } from '../artifact-core/approval-view.js';
import { ARTIFACTS_DIR, artifactJsonPath, buildArtifactId, lldArtifactId } from '../storage.js';
import { approveTarget } from './helpers/approve.js';
import { approvedMeta, draftMeta, writeHead } from './lifecycle-fixtures.js';
import type { EpicImpactAnalysis } from '../artifacts/epic-impact.js';

const HASH = 'c1d2e3f4a5b6c7d8';
const AT = '2026-01-01T00:00:00.000Z';
const ANALYSIS: EpicImpactAnalysis = { applies: true, storiesCovered: ['s1', 's2'], findings: 'x', sources: ['y'] };
const GOOD = `${EPIC_IMPACT_LABEL} s1 changed the store this Story reads and s2 added the writer it reuses; both keep working and the root keys are unchanged.`;

function repoWith(lld: { approved?: boolean; epicImpact?: unknown } | undefined, summary: string, story = 's3'): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-impact-build-'));
	if (lld !== undefined) {
		writeHead(repo, lldArtifactId(HASH, story), {
			meta: { workflow: 'design.story', storyId: story, epicHash: HASH, createdAt: AT, ...(lld.approved === false ? draftMeta() : approvedMeta()) },
			body: lld.epicImpact === undefined ? {} : { epicImpact: lld.epicImpact },
			citations: [],
		});
	}
	writeHead(repo, buildArtifactId(HASH, story), {
		meta: { workflow: 'build', storyId: story, epicHash: HASH, createdAt: AT, ...draftMeta() },
		body: { summary, tasks: [], changeLog: [{ target: { file: 'src/a.ts' } }] },
		citations: [],
	});
	return repo;
}
const buildPath = (repo: string, story = 's3'): string => artifactJsonPath(repo, buildArtifactId(HASH, story));
const clean = (...repos: string[]): void => { for (const r of repos) rmSync(r, { recursive: true, force: true }); };

test("epic-impact-build-check.test.ts: checkBuildEpicImpact does not apply to a Story with no approved LLD, whose LLD has no epicImpact or whose epicImpact says it does not apply, and for a later Story refuses a BUILD summary with no 'Epic impact:' paragraph, one that is under the minimum length, or one that does not name each Story the LLD's analysis covered as a whole token inside that paragraph, and passes one that does, and never throws on an unreadable record", () => {
	const none = repoWith(undefined, 'anything');
	const draft = repoWith({ approved: false, epicImpact: ANALYSIS }, 'anything');
	const absent = repoWith({}, 'anything');
	const notApplying = repoWith({ epicImpact: { applies: false, reason: 'first', storiesCovered: [], findings: '', sources: [] } }, 'anything');
	const later = (summary: string): string => repoWith({ epicImpact: ANALYSIS }, summary);
	const repos: string[] = [none, draft, absent, notApplying];
	try {
		for (const r of [none, draft, absent, notApplying]) assert.deepEqual(checkBuildEpicImpact(r, buildPath(r)), { applies: false });

		const run = (summary: string): ReturnType<typeof checkBuildEpicImpact> => { const r = later(summary); repos.push(r); return checkBuildEpicImpact(r, buildPath(r)); };
		const refused = (summary: string): string => { const c = run(summary); assert.ok(c.applies && !c.ok, `refused: ${summary.slice(0, 40)}`); return c.applies && !c.ok ? c.reason : ''; };

		assert.match(refused('Did the thing, all tests green.'), /has no "Epic impact:" paragraph/);
		assert.match(refused(`Intro.\n\nnote: ${GOOD}`), /has no "Epic impact:" paragraph/, 'the label must start the paragraph');
		assert.match(refused(`${EPIC_IMPACT_LABEL} s1 s2`), new RegExp(`under the ${EPIC_IMPACT_MIN_PARAGRAPH_CHARS} minimum`));
		assert.match(refused(GOOD.replace('s2 added', 'S2 added').replace('s1 changed', 's10 changed')), /does not name s1, s2/, 'whole-token match: s10 and S2 do not name s1 or s2');
		assert.match(refused(`${GOOD}`.replace('and s2 added', 'and s2x added')), /does not name s2/);
		// the Stories must be inside the labelled paragraph, not elsewhere in the summary
		assert.match(refused(`Built s1 and s2.\n\n${EPIC_IMPACT_LABEL} ${'It changes nothing relevant to the others at all. '.repeat(3)}`), /does not name s1, s2/);

		assert.deepEqual(run(GOOD), { applies: true, ok: true });
		assert.deepEqual(run(`Summary of the build.\n\n${GOOD}\n\nMore.`), { applies: true, ok: true }, 'the paragraph may follow others');
		assert.deepEqual(run(`${GOOD.replace('s1 changed', '`s1` changed').replace('and s2 added', 'and (s2) added')}`), { applies: true, ok: true }, 'punctuation around an id is fine');

		// an unreadable record never throws and does not apply
		const bad = repoWith({ epicImpact: ANALYSIS }, GOOD); repos.push(bad);
		writeFileSync(buildPath(bad), '{ not json');
		assert.doesNotThrow(() => checkBuildEpicImpact(bad, buildPath(bad)));
		assert.deepEqual(checkBuildEpicImpact(bad, buildPath(bad)), { applies: false });
		assert.deepEqual(checkBuildEpicImpact(bad, '/nonexistent/BUILD-nothing.json'), { applies: false });
	} finally { clean(...repos); }
});

test("epic-impact-build-check.test.ts: approveWorkflowTarget over a later Story's BUILD without the paragraph returns it in skipped[] with the reason and the kind 'epic-impact-missing' (when skipKinds is set) and creates no record, approves it with an explicit overrideReview, approves one with the paragraph, and leaves a first Story's BUILD, a test record and every existing refusal as they were", async () => {
	const repos: string[] = [];
	const state = (p: string): string => approvalStateOf((JSON.parse(readFileSync(p, 'utf8')) as { meta?: unknown }).meta);
	try {
		// without the paragraph: skipped with the reason and the kind, nothing approved, no new record
		const without = repoWith({ epicImpact: ANALYSIS }, 'Did the thing.'); repos.push(without);
		const filesBefore = readdirSync(join(without, ARTIFACTS_DIR)).sort();
		const out = await approveTarget({ repoPath: without, artifactPath: buildPath(without), skipKinds: true });
		assert.equal(out.approved.length, 0);
		assert.equal(out.skipped.length, 1);
		assert.equal(out.skipped[0]!.kind, 'epic-impact-missing');
		assert.match(out.skipped[0]!.reason, /no "Epic impact:" paragraph/);
		assert.notEqual(state(buildPath(without)), 'approved');
		assert.deepEqual(readdirSync(join(without, ARTIFACTS_DIR)).sort(), filesBefore, 'no record is created');
		// without skipKinds the entry is as it always was: no kind
		const plain = await approveTarget({ repoPath: without, artifactPath: buildPath(without) });
		assert.equal(plain.skipped[0]!.kind, undefined);

		// an explicit overrideReview approves it
		const overridden = await approveTarget({ repoPath: without, artifactPath: buildPath(without), overrideReview: 'automated review unavailable' });
		assert.equal(overridden.approved.length, 1, JSON.stringify(overridden.skipped));
		assert.equal(state(buildPath(without)), 'approved');

		// with the paragraph it is approved without an override
		const withPara = repoWith({ epicImpact: ANALYSIS }, GOOD); repos.push(withPara);
		const ok = await approveTarget({ repoPath: withPara, artifactPath: buildPath(withPara), skipKinds: true });
		assert.equal(ok.approved.length, 1, JSON.stringify(ok.skipped));

		// a first Story (its LLD says the analysis does not apply) and a Story with no LLD are approved as before
		const first = repoWith({ epicImpact: { applies: false, reason: 'first', storiesCovered: [], findings: '', sources: [] } }, 'Did the thing.'); repos.push(first);
		assert.equal((await approveTarget({ repoPath: first, artifactPath: buildPath(first), skipKinds: true })).approved.length, 1);
		const noLld = repoWith(undefined, 'Did the thing.'); repos.push(noLld);
		assert.equal((await approveTarget({ repoPath: noLld, artifactPath: buildPath(noLld), skipKinds: true })).approved.length, 1);

		// a test record is still refused by kind, not by this check
		const records = repoWith({ epicImpact: ANALYSIS }, 'Did the thing.'); repos.push(records);
		const testsPath = join(records, ARTIFACTS_DIR, `TESTS-${HASH}-s3.json`);
		mkdirSync(join(records, ARTIFACTS_DIR), { recursive: true });
		writeFileSync(testsPath, JSON.stringify({ meta: { workflow: 'build', epicHash: HASH, storyId: 's3', ...draftMeta() }, body: { tasks: [] }, citations: [] }));
		const rec = await approveTarget({ repoPath: records, artifactPath: testsPath, skipKinds: true });
		assert.equal(rec.skipped.length, 1);
		assert.notEqual(rec.skipped[0]!.kind, 'epic-impact-missing');
		assert.doesNotMatch(rec.skipped[0]!.reason, /Epic impact/);
	} finally { clean(...repos); }
});
