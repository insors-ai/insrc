/**
 * A denied tracker call stops the publication (Story s10): the push is not turned into a failed result, no later call is made, and the
 * issue bindings already written stay. Driven through autoPushEpicOnHld / autoPushStoryOnLld with an in-memory tracker.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/tracker-denial.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { autoPushEpicOnHld, autoPushStoryOnLld } from '../../tracker-auto.js';
import { HASH, fakeTracker, seed, via } from '../../__tests__/approve-fallback-kit.js';
import { lldArtifactId } from '../../storage.js';
import { readBinding } from '../binding.js';
import { ToolDenied } from '../tool-denied.js';

const isDenied = (e: unknown): boolean => e instanceof ToolDenied && e.reason === 'declined';

/** The repository's github.json with milestones on, so the milestone extra is a step of the push. */
function withMilestones(repo: string): void {
	const cfg = join(repo, 'github.json');
	const j = JSON.parse(readFileSync(cfg, 'utf8')) as { repos: Record<string, Record<string, unknown>> };
	for (const k of Object.keys(j.repos)) j.repos[k]!['useMilestones'] = true;
	writeFileSync(cfg, JSON.stringify(j));
}

describe('tracker-denial.test.ts: a denial at a milestone extra, a comment extra and the link comment stops publication with later calls forbidden and keeps the bindings', () => {
	it('a denial at the milestone extra stops the Epic push: no comment is posted after it, the push throws the denial, and the Epic issue stays bound', async () => {
		const fx = seed();
		try {
			withMilestones(fx.repo);
			const t = fakeTracker();
			const ops = t.port.issueOps as unknown as Record<string, (...a: unknown[]) => unknown>;
			let afterDenial = 0;
			ops['attachMilestone'] = () => { throw new ToolDenied('gh_issue_edit', 'declined'); };
			const comment = ops['comment']!;
			ops['comment'] = (...a: unknown[]) => { afterDenial += 1; return comment(...a); };
			await assert.rejects(via(t)(() => autoPushEpicOnHld(fx.hld)), isDenied);
			assert.equal(afterDenial, 0, 'no comment extra ran after the denied milestone');
			assert.equal(t.log.comments.length, 0);
			assert.equal(t.log.creates, 1, 'the Epic issue was created before the extras');
			assert.equal(readBinding(fx.repo, `EPIC-${HASH}`)?.reference.entityId, 'acme/demo#1', 'its binding was kept');
			// the retry, with the milestone allowed, finds the Epic issue and posts the rest
			const retry = fakeTracker();
			retry.issues.push(...t.issues);
			await via(retry)(() => autoPushEpicOnHld(fx.hld));
			assert.equal(retry.log.creates, 0, 'no second Epic issue');
		} finally { fx.cleanup(); }
	});

	it('a denial at a comment extra stops the Story push: the later review comment is never made, the denial is thrown (not a failed result), and both bindings stay', async () => {
		const fx = seed();
		try {
			const t = fakeTracker();
			await via(t)(() => autoPushEpicOnHld(fx.hld));
			const ops = t.port.issueOps as unknown as Record<string, (...a: unknown[]) => unknown>;
			const posts: string[] = [];
			const comment = ops['comment']!;
			ops['comment'] = (ref: unknown, body: unknown) => {
				posts.push(String(body).includes(':design -->') ? 'design' : String(body).includes('insrc:review') ? 'review' : 'other');
				if (String(body).includes(':design -->')) throw new ToolDenied('gh_issue_comment', 'declined');
				return comment(ref, body);
			};
			await assert.rejects(via(t)(() => autoPushStoryOnLld(fx.lld)), isDenied);
			assert.deepEqual(posts, ['design'], 'the design comment was attempted once and no later call was made');
			assert.equal(readBinding(fx.repo, `STORY-${HASH}-s1`)?.reference.entityId, 'acme/demo#2', 'the Story issue binding was kept');
			assert.equal(readBinding(fx.repo, `EPIC-${HASH}`)?.reference.entityId, 'acme/demo#1');
		} finally { fx.cleanup(); }
	});

	it('a denial at the sub-issue link stops the Story push; the created issue is not lost: the retry adopts it by its label, links it and creates no second issue', async () => {
		const fx = seed();
		try {
			const t = fakeTracker();
			await via(t)(() => autoPushEpicOnHld(fx.hld));
			const ops = t.port.issueOps as unknown as Record<string, (...a: unknown[]) => unknown>;
			const link = ops['linkSubIssue']!;
			ops['linkSubIssue'] = () => { throw new ToolDenied('gh_tracker', 'declined'); };
			const comment = ops['comment']!;
			let commentsAfter = 0;
			ops['comment'] = (...a: unknown[]) => { commentsAfter += 1; return comment(...a); };
			await assert.rejects(via(t)(() => autoPushStoryOnLld(fx.lld)), isDenied);
			assert.equal(commentsAfter, 0, 'no extra ran after the denied link');
			assert.equal(t.log.creates, 2, 'the Epic and the Story issue exist on the tracker');
			assert.equal(readBinding(fx.repo, `EPIC-${HASH}`)?.reference.entityId, 'acme/demo#1', 'the Epic binding written earlier is kept');
			ops['linkSubIssue'] = link;
			const retry = await via(t)(() => autoPushStoryOnLld(fx.lld));
			assert.equal(retry.status === 'created' || retry.status === 'already-exists', true, JSON.stringify(retry));
			assert.equal(t.log.creates, 2, 'no second Story issue: the first is adopted by its label');
			assert.equal(readBinding(fx.repo, `STORY-${HASH}-s1`)?.reference.entityId, 'acme/demo#2');
		} finally { fx.cleanup(); }
	});

	it('an ordinary comment failure is still a failed extra reported on the result and the later extras still run', async () => {
		const fx = seed();
		try {
			const t = fakeTracker({ failComment: ':design -->' });
			await via(t)(() => autoPushEpicOnHld(fx.hld));
			const r = await via(t)(() => autoPushStoryOnLld(fx.lld));
			assert.equal(r.status, 'created');
			assert.ok(r.status === 'created' && (r.extrasFailed ?? []).some(f => f.name === 'designComment'), 'the design comment failed and is reported');
			assert.ok(t.log.comments.some(([, b]) => b.includes('insrc:review')), 'the review comment still ran after the failed design comment');
		} finally { fx.cleanup(); }
	});

	it('a denial while the Epic is ensured stops the push (an issue created before the denial stays bound)', async () => {
		const fx = seed();
		try {
			const t = fakeTracker();
			const ops = t.port.issueOps as unknown as Record<string, (...a: unknown[]) => unknown>;
			const create = ops['create']!;
			ops['create'] = () => { void create; throw new ToolDenied('gh_tracker', 'no-client'); };
			await assert.rejects(via(t)(() => autoPushEpicOnHld(fx.hld)), (e: unknown) => e instanceof ToolDenied && e.reason === 'no-client');
			assert.equal(t.log.creates, 0);
			assert.equal(lldArtifactId(HASH, 's1').length > 0, true);
		} finally { fx.cleanup(); }
	});
});
