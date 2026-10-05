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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { approve as tuiApprove } from '../../cli/services/workflow.js';
import { approveArtifactByJsonPath, approveWorkflowTarget, ReviewBlockedError } from '../gates.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';

const HASH = 'abcd1234ef567890';
type Party = 'controller' | 'daemon';

function repo() {
	const root = mkdtempSync(join(tmpdir(), 'insrc-party-gate-'));
	const dir = join(root, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	return { root, dir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function write(dir: string, name: string, meta: Record<string, unknown>): string {
	const p = join(dir, name);
	writeFileSync(p, JSON.stringify({ meta: { epicHash: HASH, ...meta }, body: {}, citations: [] }, null, 2));
	return p;
}

const review = (by: Party | undefined, opts: { block?: boolean; model?: string } = {}) => ({
	artifact: 'x', stage: 'x', verdict: opts.block === true ? 'block' : 'pass',
	findings: opts.block === true ? [{ severity: 'HIGH', claimId: 'c1', summary: 'wrong' }] : [],
	counts: { high: opts.block === true ? 1 : 0, med: 0, low: 0 }, reviewedAt: '2026-10-05T00:00:00.000Z',
	...(opts.model !== undefined ? { model: opts.model } : {}),
	...(by !== undefined ? { reviewedBy: by } : {}),
});

const metaOf = (p: string) => (JSON.parse(readFileSync(p, 'utf8')) as { meta: Record<string, unknown> }).meta;
const isApproved = (p: string): boolean => metaOf(p)['approvedAt'] !== undefined;

function blocked(fn: () => unknown, summary: RegExp, message?: RegExp): void {
	assert.throws(fn, (e: unknown) => {
		assert.ok(e instanceof ReviewBlockedError, `got ${String(e)}`);
		assert.match(e.summary, summary);
		assert.match(e.message, /approve with an override reason/);
		if (message !== undefined) assert.match(e.message, message);
		return true;
	});
}

const DESIGN = [['DEF', `DEF-${HASH}.json`, 'define'], ['HLD', `HLD-${HASH}.json`, 'design.epic'], ['LLD', `LLD-${HASH}-S001.json`, 'design.story']] as const;
const NO_REVIEW_KINDS = [['ISSUE', `ISSUE-${HASH}.json`, 'issue'], ['SPEC', `SPEC-${HASH}.json`, 'brainstorm'], ['PLAN', `PLAN-${HASH}-S001.json`, 'plan']] as const;

// --- T5 ---------------------------------------------------------------------------

for (const [kind, name, workflow] of DESIGN) {
	test(`T5 a ${kind} with no review is withheld; an override reason approves it and is written on the artifact`, () => {
		const r = repo();
		try {
			const p = write(r.dir, name, { workflow, storyId: 'S001', authoredBy: 'controller' });
			blocked(() => approveArtifactByJsonPath(p), /approval requires a review; none was run/, /needs a daemon review \(run insrc_review_step/);
			assert.ok(!isApproved(p));
			blocked(() => approveArtifactByJsonPath(p, { overrideReview: '' }), /none was run/);

			approveArtifactByJsonPath(p, { overrideReview: 'read it myself' });
			assert.ok(isApproved(p));
			const o = metaOf(p)['reviewOverride'] as { reason: string; at: string };
			assert.equal(o.reason, 'read it myself');
			assert.match(o.at, /^\d{4}-\d{2}-\d{2}T/);
		} finally { r.cleanup(); }
	});
}

test('T5 the message names the reviewer that is needed: a controller review for daemon-authored work', () => {
	const r = repo();
	try {
		const byDaemon = write(r.dir, `DEF-${HASH}.json`, { workflow: 'define', authoredBy: 'daemon' });
		blocked(() => approveArtifactByJsonPath(byDaemon), /none was run/, /needs a controller review \(run insrc_review_step\)/);
		const unknown = write(r.dir, `HLD-${HASH}.json`, { workflow: 'design.epic' });
		blocked(() => approveArtifactByJsonPath(unknown), /none was run/, /needs a review \(run insrc_review_step\)/);
	} finally { r.cleanup(); }
});

for (const [kind, name, workflow] of NO_REVIEW_KINDS) {
	test(`T5 an ${kind} with no review is approved on the approval alone`, () => {
		const r = repo();
		try {
			const p = write(r.dir, name, { workflow, storyId: 'S001', authoredBy: 'controller' });
			approveArtifactByJsonPath(p);
			assert.ok(isApproved(p));
			assert.equal(metaOf(p)['reviewOverride'], undefined, 'nothing was overridden');
		} finally { r.cleanup(); }
	});
}

// --- T6 ---------------------------------------------------------------------------

for (const [kind, name, workflow] of DESIGN) {
	for (const party of ['controller', 'daemon'] as const) {
		const other: Party = party === 'controller' ? 'daemon' : 'controller';

		test(`T6 a ${kind} authored AND reviewed by the ${party} is withheld; an override approves it and is recorded`, () => {
			const r = repo();
			try {
				const p = write(r.dir, name, { workflow, storyId: 'S001', authoredBy: party, review: review(party) });
				blocked(() => approveArtifactByJsonPath(p), new RegExp(`review was done by the party that authored the work \\(${party}\\)`), new RegExp(`needs a ${other} review`));
				assert.ok(!isApproved(p));
				approveArtifactByJsonPath(p, { overrideReview: 'accepted as is' });
				assert.ok(isApproved(p));
				assert.equal((metaOf(p)['reviewOverride'] as { reason: string }).reason, 'accepted as is');
			} finally { r.cleanup(); }
		});

		test(`T6 a ${kind} authored by the ${party} and reviewed by the ${other} with nothing blocking is approved`, () => {
			const r = repo();
			try {
				const p = write(r.dir, name, { workflow, storyId: 'S001', authoredBy: party, review: review(other) });
				approveArtifactByJsonPath(p);
				assert.ok(isApproved(p));
				assert.equal(metaOf(p)['reviewOverride'], undefined);
			} finally { r.cleanup(); }
		});
	}
}

test('T6 an other-party review whose verdict BLOCKS still withholds without an override', () => {
	const r = repo();
	try {
		const p = write(r.dir, `LLD-${HASH}-S001.json`, { workflow: 'design.story', storyId: 'S001', authoredBy: 'controller', review: review('daemon', { block: true }) });
		blocked(() => approveArtifactByJsonPath(p), /1 HIGH · 0 MED unresolved/);
		assert.ok(!isApproved(p));
		approveArtifactByJsonPath(p, { overrideReview: 'finding is wrong' });
		assert.ok(isApproved(p));
	} finally { r.cleanup(); }
});

test('T6 an unknown author or an unknown reviewer never withholds by itself', () => {
	const r = repo();
	try {
		const unknownAuthor = write(r.dir, `DEF-${HASH}.json`, { workflow: 'define', review: review('controller') });
		approveArtifactByJsonPath(unknownAuthor);
		assert.ok(isApproved(unknownAuthor));
		const unknownReviewer = write(r.dir, `HLD-${HASH}.json`, { workflow: 'design.epic', authoredBy: 'controller', review: review(undefined) });
		approveArtifactByJsonPath(unknownReviewer);
		assert.ok(isApproved(unknownReviewer));
	} finally { r.cleanup(); }
});

test('T6 older records with no party field are judged by their model labels', () => {
	const r = repo();
	try {
		const outputs = (model: string) => ({ outputs: [{ role: 'synthesize', tier: 'core', runner: 'cli-claude', model }] });
		// Written by the controller (`client`) and reviewed by the controller (`client`): the same party.
		const same = write(r.dir, `DEF-${HASH}.json`, { workflow: 'define', attribution: outputs('client'), review: review(undefined, { model: 'client' }) });
		blocked(() => approveArtifactByJsonPath(same), /authored the work \(controller\)/);
		// Written by the daemon and reviewed by the controller: the other party.
		const other = write(r.dir, `HLD-${HASH}.json`, { workflow: 'design.epic', attribution: outputs('opus'), review: review(undefined, { model: 'client' }) });
		approveArtifactByJsonPath(other);
		assert.ok(isApproved(other));
	} finally { r.cleanup(); }
});

test('T6 the same-party rule applies to any artifact that carries a review, also one that needs none', () => {
	const r = repo();
	try {
		const p = write(r.dir, `PLAN-${HASH}-S001.json`, { workflow: 'plan', storyId: 'S001', authoredBy: 'daemon', review: review('daemon') });
		blocked(() => approveArtifactByJsonPath(p), /authored the work \(daemon\)/);
	} finally { r.cleanup(); }
});

// --- T7: a BUILD record -----------------------------------------------------------

function writeCR(dir: string, storyId: string, meta: Record<string, unknown>, verdict = 'pass'): void {
	writeFileSync(join(dir, `CR-${HASH}-${storyId}.json`), JSON.stringify({ meta, body: { verdict, counts: { high: verdict === 'block' ? 1 : 0, med: 0, low: 0 } } }));
}
const build = (dir: string, author?: Party) => write(dir, `BUILD-${HASH}-S001.json`, { workflow: 'build', storyId: 'S001', ...(author !== undefined ? { authoredBy: author } : {}) });

for (const enforce of [false, true]) {
	test(`T7 a BUILD record whose Story has no code review is withheld (enforcement ${enforce ? 'on' : 'off'})`, async () => {
		const r = repo();
		try {
			const p = build(r.dir, 'controller');
			const out = await approveWorkflowTarget({ repoPath: r.root, artifactPath: p }, { enforce });
			assert.deepEqual(out.approved, []);
			assert.deepEqual(out.skipped, [{ path: p, reason: 'completion requires a code review; none was run' }]);
			assert.ok(!isApproved(p));

			const over = await approveWorkflowTarget({ repoPath: r.root, artifactPath: p, overrideReview: 'tested by hand' }, { enforce });
			assert.deepEqual(over.approved.map(a => a.path), [p]);
			assert.equal((metaOf(p)['reviewOverride'] as { reason: string }).reason, 'tested by hand');
		} finally { r.cleanup(); }
	});

	for (const party of ['controller', 'daemon'] as const) {
		const other: Party = party === 'controller' ? 'daemon' : 'controller';
		test(`T7 a BUILD record written AND code-reviewed by the ${party} is withheld; reviewed by the ${other} it completes (enforcement ${enforce ? 'on' : 'off'})`, async () => {
			const r = repo();
			try {
				const p = build(r.dir, party);
				writeCR(r.dir, 'S001', { reviewedBy: party });
				const out = await approveWorkflowTarget({ repoPath: r.root, artifactPath: p }, { enforce });
				assert.deepEqual(out.approved, []);
				assert.equal(out.skipped.length, 1);
				assert.equal(out.skipped[0]!.reason, `the code review was done by the party that authored the work (${party})`);
				assert.ok(!isApproved(p));

				writeCR(r.dir, 'S001', { reviewedBy: other });
				const ok = await approveWorkflowTarget({ repoPath: r.root, artifactPath: p }, { enforce });
				assert.deepEqual(ok.approved.map(a => a.path), [p]);
				assert.deepEqual(ok.skipped, []);
				assert.equal(metaOf(p)['reviewOverride'], undefined);
			} finally { r.cleanup(); }
		});
	}
}

test('T7 for a BUILD record too, an unknown author or reviewer does not withhold, and an older code review is read by its model label', async () => {
	const r = repo();
	try {
		const p = build(r.dir);                       // an older record: no author
		writeCR(r.dir, 'S001', { model: 'client' });
		assert.equal((await approveWorkflowTarget({ repoPath: r.root, artifactPath: p }, { enforce: false })).approved.length, 1);

		const q = write(r.dir, `BUILD-${HASH}-S002.json`, { workflow: 'build', storyId: 'S002', authoredBy: 'controller' });
		writeCR(r.dir, 'S002', {});                   // a code review that names no reviewer
		assert.equal((await approveWorkflowTarget({ repoPath: r.root, artifactPath: q }, { enforce: false })).approved.length, 1);

		const s = write(r.dir, `BUILD-${HASH}-S003.json`, { workflow: 'build', storyId: 'S003', authoredBy: 'controller' });
		writeCR(r.dir, 'S003', { model: 'client' });  // reviewed by the controller, by its label
		assert.equal((await approveWorkflowTarget({ repoPath: r.root, artifactPath: s }, { enforce: false })).skipped.length, 1);
	} finally { r.cleanup(); }
});

test('T7 a code review that cannot be read is no code review', async () => {
	const r = repo();
	try {
		const p = build(r.dir, 'controller');
		writeFileSync(join(r.dir, `CR-${HASH}-S001.json`), '{ not json');
		const out = await approveWorkflowTarget({ repoPath: r.root, artifactPath: p }, { enforce: false });
		assert.deepEqual(out.skipped.map(s => s.reason), ['completion requires a code review; none was run']);
	} finally { r.cleanup(); }
});

test('T7 the TUI approve service applies the same rules: it calls the same function', () => {
	const r = repo();
	try {
		const p = build(r.dir, 'controller');
		blocked(() => tuiApprove(p, false), /completion requires a code review; none was run/, /Run insrc_code_review_step first/);
		writeCR(r.dir, 'S001', { reviewedBy: 'controller' });
		blocked(() => tuiApprove(p, false), /code review was done by the party that authored the work \(controller\)/, /insrc_code_review_step/);
		assert.ok(!isApproved(p));
		const out = tuiApprove(p, false, 'approved from the TUI');
		assert.equal(out.approval.path, p);
		assert.equal((metaOf(p)['reviewOverride'] as { reason: string }).reason, 'approved from the TUI');

		const def = write(r.dir, `DEF-${HASH}.json`, { workflow: 'define', authoredBy: 'controller' });
		blocked(() => tuiApprove(def, false), /approval requires a review; none was run/);
		stampOtherPartyReview(def);
		tuiApprove(def, false);
		assert.ok(isApproved(def));
	} finally { r.cleanup(); }
});

// --- T8: a batch -------------------------------------------------------------------

test('T8 a batch approval lists every withheld artifact in skipped[] with its reason, and approves the rest', async () => {
	const r = repo();
	try {
		const reviewed   = write(r.dir, `DEF-${HASH}.json`, { workflow: 'define', authoredBy: 'controller', review: review('daemon') });
		const unreviewed = write(r.dir, `HLD-${HASH}.json`, { workflow: 'design.epic', authoredBy: 'controller' });
		const sameParty  = write(r.dir, `LLD-${HASH}-S001.json`, { workflow: 'design.story', storyId: 'S001', authoredBy: 'daemon', review: review('daemon') });
		const blocking   = write(r.dir, `LLD-${HASH}-S002.json`, { workflow: 'design.story', storyId: 'S002', authoredBy: 'controller', review: review('daemon', { block: true }) });
		const plan       = write(r.dir, `PLAN-${HASH}-S001.json`, { workflow: 'plan', storyId: 'S001', authoredBy: 'controller' });

		const out = await approveWorkflowTarget({ repoPath: r.root, epicHash: HASH }, { enforce: false });
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
		const over = await approveWorkflowTarget({ repoPath: r.root, epicHash: HASH, overrideReview: 'batch override' }, { enforce: false });
		assert.deepEqual(over.approved.map(a => a.path).sort(), [unreviewed, sameParty, blocking].sort());
		for (const p of [unreviewed, sameParty, blocking]) assert.equal((metaOf(p)['reviewOverride'] as { reason: string }).reason, 'batch override');
	} finally { r.cleanup(); }
});

// --- T18: the shared helper's review is one the gate accepts ----------------------

for (const [kind, name, workflow] of [...DESIGN, ['BUILD', `BUILD-${HASH}-S001.json`, 'build']] as const) {
	for (const author of ['controller', 'daemon', undefined] as const) {
		test(`T18 a ${kind} fixture (author: ${author ?? 'none'}) stamped with the shared helper is approved with no override`, () => {
			const r = repo();
			try {
				const p = write(r.dir, name, { workflow, storyId: 'S001', ...(author !== undefined ? { authoredBy: author } : {}) });
				assert.throws(() => approveArtifactByJsonPath(p), ReviewBlockedError, 'without the helper it is withheld');
				stampOtherPartyReview(p);
				approveArtifactByJsonPath(p);
				assert.ok(isApproved(p));
				assert.equal(metaOf(p)['reviewOverride'], undefined);
			} finally { r.cleanup(); }
		});
	}
}
