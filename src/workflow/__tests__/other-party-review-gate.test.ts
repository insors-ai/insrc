/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Approval requires a review by the party that did not author the work: a
 * design review for a DEF, HLD or LLD, a code review for a BUILD record. The
 * rule lives in `approveArtifactByJsonPath`, so it holds through
 * `approveWorkflowTarget` and through the TUI approve service alike.
 * (LLD-1716f77ba9ba017b-S001, tests T5, T6, T7, T8, T18; plan task t10.)
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { approveThroughPipeline as tuiApprove } from './helpers/approve-pipeline.js';
import { approvalStateOf, lifecycleOfMeta } from '../artifact-core/approval-view.js';
import { approveWorkflowTarget, ReviewBlockedError } from '../gates.js';
import { approveJson } from './helpers/approve.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';
import { blockedMeta, recordReviewSync, reviewedMeta } from './lifecycle-fixtures.js';
import { approveTarget } from './helpers/approve.js';
import { validCodeReview, type ReviewVerdict } from './helpers/valid-code-review.js';

const HASH = 'abcd1234ef567890';
type Party = 'controller' | 'daemon';

function repo() {
	const root = mkdtempSync(join(tmpdir(), 'insrc-party-gate-'));
	const dir = join(root, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	return { root, dir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** A review as a fixture describes it: who did it and whether it blocks. */
interface ReviewDesc { readonly by: Party; readonly block: boolean }

/** A head. A `review` in its meta is the lifecycle review it describes, with its report as the review entry of the head's log. */
function write(dir: string, name: string, meta: Record<string, unknown>): string {
	const { review: rv, ...rest } = meta as { review?: ReviewDesc } & Record<string, unknown>;
	const id = name.replace(/\.json$/, '');
	let state: Record<string, unknown> = {};
	if (rv !== undefined) {
		const findings = rv.block ? [{ severity: 'HIGH', claimId: 'c1', kind: 'inventory', premise: 'wrong', evidence: 'e', action: 'a', fixability: 'manual' }] : [];
		const report = recordReviewSync(join(dir, '..', '..'), id, {
			artifact: 'x', stage: 'x', verdict: rv.block ? 'block' : 'pass', findings: findings as never,
			counts: { high: findings.length, med: 0, low: 0 }, reviewedAt: '2026-10-05T00:00:00.000Z', model: 'm', reviewedBy: rv.by,
		});
		state = (rv.block ? blockedMeta : reviewedMeta)({ report, party: rv.by });
	}
	const p = join(dir, name);
	// a BUILD names the files it changed, and the code review must cover them
	const body = rest['workflow'] === 'build' ? { changeLog: [{ target: { file: 'src/a.ts' } }, { target: { file: 'src/b.ts' } }] } : {};
	writeFileSync(p, JSON.stringify({ meta: { epicHash: HASH, ...rest, ...state }, body, citations: [] }, null, 2));
	return p;
}

const review = (by: Party, opts: { block?: boolean } = {}): ReviewDesc => ({ by, block: opts.block === true });

const metaOf = (p: string) => (JSON.parse(readFileSync(p, 'utf8')) as { meta: Record<string, unknown> }).meta;
const isApproved = (p: string): boolean => approvalStateOf(metaOf(p)) === 'approved';
/** The reason the approval was given over a block or a missing review, or undefined. */
const overrideOf = (p: string): string | undefined => ((lifecycleOfMeta(metaOf(p))?.['approval'] as { override?: { reason: string } } | undefined)?.override)?.reason;

/** The terminal's approve runs at the daemon, which answers a review block as its kind and summary (the full message stays on the in-process error). */
async function blockedAtDaemon(fn: () => Promise<unknown>, summary: RegExp): Promise<void> {
	await assert.rejects(fn(), (e: unknown) => { assert.ok(e instanceof Error && e.name === 'ReviewBlockedError', `got ${String(e)}`); assert.match((e as { summary: string }).summary, summary); return true; });
}

/** A call that must be withheld by the review rule, with the summary and message it gives. */
async function blocked(fn: () => Promise<unknown>, summary: RegExp, message?: RegExp): Promise<void> {
	await assert.rejects(fn(), (e: unknown) => {
		assert.ok(e instanceof ReviewBlockedError, `got ${String(e)}`);
		assert.match(e.summary, summary);
		assert.match(e.message, /approve with an override reason/);
		if (message !== undefined) assert.match(e.message, message);
		return true;
	});
}

const DESIGN = [['DEF', `DEF-${HASH}.json`, 'define'], ['HLD', `HLD-${HASH}.json`, 'design.epic'], ['LLD', `LLD-${HASH}-s1.json`, 'design.story']] as const;
const NO_REVIEW_KINDS = [['ISSUE', `ISSUE-${HASH}.json`, 'issue'], ['SPEC', `SPEC-${HASH}.json`, 'brainstorm'], ['PLAN', `PLAN-${HASH}-s1.json`, 'plan']] as const;

// --- T5 ---------------------------------------------------------------------------

for (const [kind, name, workflow] of DESIGN) {
	test(`T5 a ${kind} with no review is withheld; an override reason approves it and is written on the artifact`, async () => {
		const r = repo();
		try {
			const p = write(r.dir, name, { workflow, storyId: 's1', authoredBy: 'controller' });
			await blocked(() => approveJson(p), /approval requires a review; none was run/, /needs a daemon review \(run insrc_review_step/);
			assert.ok(!isApproved(p));
			await blocked(() => approveJson(p, ''), /none was run/);

			await approveJson(p, 'read it myself');
			assert.ok(isApproved(p));
			assert.equal(overrideOf(p), 'read it myself');
		} finally { r.cleanup(); }
	});
}

test('T5 the message names the reviewer that is needed: a controller review for daemon-authored work', async () => {
	const r = repo();
	try {
		const byDaemon = write(r.dir, `DEF-${HASH}.json`, { workflow: 'define', authoredBy: 'daemon' });
		await blocked(() => approveJson(byDaemon), /none was run/, /needs a controller review \(run insrc_review_step\)/);
		const unknown = write(r.dir, `HLD-${HASH}.json`, { workflow: 'design.epic' });
		await blocked(() => approveJson(unknown), /none was run/, /needs a review \(run insrc_review_step\)/);
	} finally { r.cleanup(); }
});

for (const [kind, name, workflow] of NO_REVIEW_KINDS) {
	test(`T5 an ${kind} with no review is approved on the approval alone`, async () => {
		const r = repo();
		try {
			const p = write(r.dir, name, { workflow, storyId: 's1', authoredBy: 'controller' });
			await approveJson(p);
			assert.ok(isApproved(p));
			assert.equal(overrideOf(p), undefined, 'nothing was overridden');
		} finally { r.cleanup(); }
	});
}

// --- T6 ---------------------------------------------------------------------------

for (const [kind, name, workflow] of DESIGN) {
	for (const party of ['controller', 'daemon'] as const) {
		const other: Party = party === 'controller' ? 'daemon' : 'controller';

		test(`T6 a ${kind} authored AND reviewed by the ${party} is withheld; an override approves it and is recorded`, async () => {
			const r = repo();
			try {
				const p = write(r.dir, name, { workflow, storyId: 's1', authoredBy: party, review: review(party) });
				await blocked(() => approveJson(p), new RegExp(`review was done by the party that authored the work \\(${party}\\)`), new RegExp(`needs a ${other} review`));
				assert.ok(!isApproved(p));
				await approveJson(p, 'accepted as is');
				assert.ok(isApproved(p));
				assert.equal(overrideOf(p), 'accepted as is');
			} finally { r.cleanup(); }
		});

		test(`T6 a ${kind} authored by the ${party} and reviewed by the ${other} with nothing blocking is approved`, async () => {
			const r = repo();
			try {
				const p = write(r.dir, name, { workflow, storyId: 's1', authoredBy: party, review: review(other) });
				await approveJson(p);
				assert.ok(isApproved(p));
				assert.equal(overrideOf(p), undefined);
			} finally { r.cleanup(); }
		});
	}
}

test('T6 an other-party review whose verdict BLOCKS still withholds without an override', async () => {
	const r = repo();
	try {
		const p = write(r.dir, `LLD-${HASH}-s1.json`, { workflow: 'design.story', storyId: 's1', authoredBy: 'controller', review: review('daemon', { block: true }) });
		await blocked(() => approveJson(p), /1 HIGH · 0 MED unresolved/);
		assert.ok(!isApproved(p));
		await approveJson(p, 'finding is wrong');
		assert.ok(isApproved(p));
	} finally { r.cleanup(); }
});

test('T6 an unknown author never withholds by itself', async () => {
	const r = repo();
	try {
		const unknownAuthor = write(r.dir, `DEF-${HASH}.json`, { workflow: 'define', review: review('controller') });
		await approveJson(unknownAuthor);
		assert.ok(isApproved(unknownAuthor));
	} finally { r.cleanup(); }
});

test('T6 the same-party rule applies to any artifact that carries a review, also one that needs none', async () => {
	const r = repo();
	try {
		const p = write(r.dir, `PLAN-${HASH}-s1.json`, { workflow: 'plan', storyId: 's1', authoredBy: 'daemon', review: review('daemon') });
		await blocked(() => approveJson(p), /authored the work \(daemon\)/);
	} finally { r.cleanup(); }
});

// --- T7: a BUILD record -----------------------------------------------------------

function writeCR(dir: string, storyId: string, meta: Record<string, unknown>, verdict = 'pass'): void {
	// bound to the BUILD of the Story as it is now (a Story without one binds to nothing)
	const buildJson = join(dir, `BUILD-${HASH}-${storyId}.json`);
	const build: unknown = existsSync(buildJson) ? JSON.parse(readFileSync(buildJson, 'utf8')) : {};
	writeFileSync(join(dir, `CR-${HASH}-${storyId}.json`), JSON.stringify(validCodeReview(build, verdict as ReviewVerdict, { meta, counts: { high: verdict === 'block' ? 1 : 0, med: 0, low: 0 } })));
}
const build = (dir: string, author?: Party) => write(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1', ...(author !== undefined ? { authoredBy: author } : {}) });

for (const enforce of [false, true]) {
	test(`T7 a BUILD record whose Story has no code review is withheld (enforcement ${enforce ? 'on' : 'off'})`, async () => {
		const r = repo();
		try {
			const p = build(r.dir, 'controller');
			const out = await approveTarget({ repoPath: r.root, artifactPath: p }, { enforce });
			assert.deepEqual(out.approved, []);
			assert.deepEqual(out.skipped, [{ path: p, reason: 'completion requires a code review; none was run' }]);
			assert.ok(!isApproved(p));

			const over = await approveTarget({ repoPath: r.root, artifactPath: p, overrideReview: 'tested by hand' }, { enforce });
			assert.deepEqual(over.approved.map(a => a.path), [p]);
			assert.equal(overrideOf(p), 'tested by hand');
		} finally { r.cleanup(); }
	});

	for (const party of ['controller', 'daemon'] as const) {
		const other: Party = party === 'controller' ? 'daemon' : 'controller';
		test(`T7 a BUILD record written AND code-reviewed by the ${party} is withheld; reviewed by the ${other} it completes (enforcement ${enforce ? 'on' : 'off'})`, async () => {
			const r = repo();
			try {
				const p = build(r.dir, party);
				writeCR(r.dir, 's1', { reviewedBy: party });
				const out = await approveTarget({ repoPath: r.root, artifactPath: p }, { enforce });
				assert.deepEqual(out.approved, []);
				assert.equal(out.skipped.length, 1);
				assert.equal(out.skipped[0]!.reason, `the code review was done by the party that authored the work (${party})`);
				assert.ok(!isApproved(p));

				writeCR(r.dir, 's1', { reviewedBy: other });
				const ok = await approveTarget({ repoPath: r.root, artifactPath: p }, { enforce });
				assert.deepEqual(ok.approved.map(a => a.path), [p]);
				assert.deepEqual(ok.skipped, []);
				assert.equal(overrideOf(p), undefined);
			} finally { r.cleanup(); }
		});
	}
}

test('T7 for a BUILD record too, an unknown author or reviewer does not withhold, and an older code review is read by its model label', async () => {
	const r = repo();
	try {
		const p = build(r.dir);                       // an older record: no author
		writeCR(r.dir, 's1', { model: 'client' });
		assert.equal((await approveTarget({ repoPath: r.root, artifactPath: p }, { enforce: false })).approved.length, 1);

		const q = write(r.dir, `BUILD-${HASH}-s2.json`, { workflow: 'build', storyId: 's2', authoredBy: 'controller' });
		writeCR(r.dir, 's2', {});                   // a code review that names no reviewer
		assert.equal((await approveTarget({ repoPath: r.root, artifactPath: q }, { enforce: false })).approved.length, 1);

		const s = write(r.dir, `BUILD-${HASH}-s3.json`, { workflow: 'build', storyId: 's3', authoredBy: 'controller' });
		writeCR(r.dir, 's3', { model: 'client' });  // reviewed by the controller, by its label
		assert.equal((await approveTarget({ repoPath: r.root, artifactPath: s }, { enforce: false })).skipped.length, 1);
	} finally { r.cleanup(); }
});

test('T7 the party of a code review is its lifecycle review\'s when it has one', async () => {
	const r = repo();
	try {
		const p = build(r.dir, 'controller');
		// a code review whose lifecycle review says the controller did it, over a label that says the daemon
		writeCR(r.dir, 's1', { reviewedBy: 'daemon', ...reviewedMeta({ party: 'controller' }) });
		const out = await approveTarget({ repoPath: r.root, artifactPath: p }, { enforce: false });
		assert.equal(out.skipped[0]?.reason, 'the code review was done by the party that authored the work (controller)');
		writeCR(r.dir, 's1', { reviewedBy: 'controller', ...reviewedMeta({ party: 'daemon' }) });
		assert.equal((await approveTarget({ repoPath: r.root, artifactPath: p }, { enforce: false })).approved.length, 1);
	} finally { r.cleanup(); }
});

test('T7 a code review that cannot be read is no code review', async () => {
	const r = repo();
	try {
		const p = build(r.dir, 'controller');
		writeFileSync(join(r.dir, `CR-${HASH}-s1.json`), '{ not json');
		const out = await approveTarget({ repoPath: r.root, artifactPath: p }, { enforce: false });
		assert.deepEqual(out.skipped.map(s => s.reason), ['completion requires a code review; none was run']);
	} finally { r.cleanup(); }
});

test('T7 the TUI approve service applies the same rules: it calls the same function', async () => {
	const r = repo();
	try {
		const p = build(r.dir, 'controller');
		await blockedAtDaemon(() => tuiApprove(p, false), /completion requires a code review; none was run/);
		writeCR(r.dir, 's1', { reviewedBy: 'controller' });
		await blockedAtDaemon(() => tuiApprove(p, false), /code review was done by the party that authored the work \(controller\)/);
		assert.ok(!isApproved(p));
		const out = await tuiApprove(p, false, 'approved from the TUI');
		assert.equal(out.approval.path, p);
		assert.equal(overrideOf(p), 'approved from the TUI');

		const def = write(r.dir, `DEF-${HASH}.json`, { workflow: 'define', authoredBy: 'controller' });
		await blockedAtDaemon(() => tuiApprove(def, false), /approval requires a review; none was run/);
		stampOtherPartyReview(def);
		await tuiApprove(def, false);
		assert.ok(isApproved(def));
	} finally { r.cleanup(); }
});

// --- T8: a batch -------------------------------------------------------------------

test('T8 a batch approval lists every withheld artifact in skipped[] with its reason, and approves the rest', async () => {
	const r = repo();
	try {
		const reviewed   = write(r.dir, `DEF-${HASH}.json`, { workflow: 'define', authoredBy: 'controller', review: review('daemon') });
		const unreviewed = write(r.dir, `HLD-${HASH}.json`, { workflow: 'design.epic', authoredBy: 'controller' });
		const sameParty  = write(r.dir, `LLD-${HASH}-s1.json`, { workflow: 'design.story', storyId: 's1', authoredBy: 'daemon', review: review('daemon') });
		const blocking   = write(r.dir, `LLD-${HASH}-s2.json`, { workflow: 'design.story', storyId: 's2', authoredBy: 'controller', review: review('daemon', { block: true }) });
		const plan       = write(r.dir, `PLAN-${HASH}-s1.json`, { workflow: 'plan', storyId: 's1', authoredBy: 'controller' });

		const out = await approveTarget({ repoPath: r.root, epicHash: HASH }, { enforce: false });
		assert.deepEqual(out.approved.map(a => a.path).sort(), [reviewed, plan].sort());
		const reasons = Object.fromEntries(out.skipped.map(s => [s.path, s.reason]));
		assert.deepEqual(reasons, {
			[unreviewed]: 'approval requires a review; none was run',
			[sameParty]:  'the review was done by the party that authored the work (daemon)',
			[blocking]:   '1 HIGH · 0 MED unresolved',
		});
		assert.equal(out.approved.length + out.skipped.length, 5, 'nothing is dropped');
		for (const p of [unreviewed, sameParty, blocking]) assert.ok(!isApproved(p));

		// With an override reason the same batch approves the three it withheld.
		const over = await approveTarget({ repoPath: r.root, epicHash: HASH, overrideReview: 'batch override' }, { enforce: false });
		assert.deepEqual(over.approved.map(a => a.path).sort(), [unreviewed, sameParty, blocking].sort());
		for (const p of [unreviewed, sameParty, blocking]) assert.equal(overrideOf(p), 'batch override');
	} finally { r.cleanup(); }
});

// --- T18: the shared helper's review is one the gate accepts ----------------------

for (const [kind, name, workflow] of [...DESIGN, ['BUILD', `BUILD-${HASH}-s1.json`, 'build']] as const) {
	for (const author of ['controller', 'daemon', undefined] as const) {
		test(`T18 a ${kind} fixture (author: ${author ?? 'none'}) stamped with the shared helper is approved with no override`, async () => {
			const r = repo();
			try {
				const p = write(r.dir, name, { workflow, storyId: 's1', ...(author !== undefined ? { authoredBy: author } : {}) });
				await assert.rejects(approveJson(p), ReviewBlockedError, 'without the helper it is withheld');
				stampOtherPartyReview(p);
				await approveJson(p);
				assert.ok(isApproved(p));
				assert.equal(overrideOf(p), undefined);
			} finally { r.cleanup(); }
		});
	}
}
