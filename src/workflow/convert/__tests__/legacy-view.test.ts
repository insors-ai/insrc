import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { legacyDeliveryView } from '../legacy-view.js';
import type { RawHead } from '../types.js';

const H = 'aaaaaaaaaaaaaaaa';
const at = '2026-10-20T10:00:00.000Z';
const finding = (claimId: string, severity: string) => ({ claimId, severity, kind: 'k', premise: 'p', evidence: 'e', action: 'a', fixability: 'manual' });
const review = (verdict: string, findings: unknown[] = []) => ({ artifact: 'LLD', stage: 'design.story', verdict, findings, counts: { high: 1, med: 0, low: 2 }, reviewedAt: at, model: 'm' });
const head = (artifactId: string, meta: Record<string, unknown>, body: unknown = {}): RawHead => ({ artifactId, json: { meta: { epicHash: H, storyId: 's1', ...meta }, body } });
const view = (heads: RawHead[], id: string) => legacyDeliveryView(heads).find(v => v.artifactId === id);

describe('legacy-view', () => {
	it("legacy-view.test.ts: legacyDeliveryView reproduces the old delivery reader's approval, review and blocking", () => {
		const approved = head(`LLD-${H}-s1`, { approvedAt: at, revision: 3, review: review('pass') });
		const viaStatus = head(`LLD-${H}-s2`, { status: 'approved' });
		const rejected = head(`HLD-${H}`, { rejectedAt: at });
		const pending = head(`DEF-${H}`, {});
		const blocked = head(`LLD-${H}-s3`, { review: review('block', [finding('p1', 'HIGH'), finding('p2', 'LOW')]) });
		const resolved = head(`LLD-${H}-s4`, { review: review('block', [finding('p1', 'HIGH')]), reviewResolutions: { p1: { findingId: 'p1', status: 'resolved', resolvedAt: at } } });
		const warnWithMed = head(`LLD-${H}-s5`, { review: review('warn', [finding('p1', 'MED')]) });
		const overridden = head(`LLD-${H}-s6`, { review: review('block', [finding('p1', 'HIGH')]), reviewOverride: { reason: 'owner', at } });
		const approvedBlock = head(`LLD-${H}-s7`, { approvedAt: at, review: review('block', [finding('p1', 'HIGH')]) });
		const malformed = head(`LLD-${H}-s8`, { review: review('block', [finding('p1', 'HIGH'), 'junk', { claimId: 1 }]) });
		const noVerdict = head(`LLD-${H}-s9`, { review: { verdict: 'maybe' } });
		const withFeedback = head(`PLAN-${H}-s1`, {}, { feedback: [{ id: 'a' }, { id: 'b' }] });
		const all = [approved, viaStatus, rejected, pending, blocked, resolved, warnWithMed, overridden, approvedBlock, malformed, noVerdict, withFeedback];

		assert.deepEqual(view(all, approved.artifactId), { artifactId: approved.artifactId, kind: 'LLD', approval: 'approved', revision: 3, review: { verdict: 'pass', effectiveVerdict: 'pass', blocking: false, counts: { high: 1, med: 0, low: 2 } }, openFeedback: 0 });
		assert.equal(view(all, viaStatus.artifactId)?.approval, 'approved');
		assert.equal(view(all, rejected.artifactId)?.approval, 'rejected');
		assert.deepEqual([view(all, pending.artifactId)?.approval, view(all, pending.artifactId)?.review, view(all, pending.artifactId)?.revision], ['pending', null, null]);
		assert.deepEqual([view(all, blocked.artifactId)?.review?.effectiveVerdict, view(all, blocked.artifactId)?.review?.blocking], ['block', true]);
		assert.deepEqual([view(all, resolved.artifactId)?.review?.verdict, view(all, resolved.artifactId)?.review?.effectiveVerdict, view(all, resolved.artifactId)?.review?.blocking], ['block', 'pass', false], 'a block whose HIGH finding is resolved is effectively pass');
		assert.deepEqual([view(all, warnWithMed.artifactId)?.review?.verdict, view(all, warnWithMed.artifactId)?.review?.effectiveVerdict, view(all, warnWithMed.artifactId)?.review?.blocking], ['warn', 'block', true], 'a warn carrying an unresolved MED is effectively block');
		assert.equal(view(all, overridden.artifactId)?.review?.blocking, false, 'an override lifts the block');
		assert.deepEqual([view(all, approvedBlock.artifactId)?.review?.effectiveVerdict, view(all, approvedBlock.artifactId)?.review?.blocking], ['block', false], 'an approved gate is not blocked');
		assert.equal(view(all, malformed.artifactId)?.review?.effectiveVerdict, 'block', 'malformed findings are dropped, the well-formed HIGH still blocks');
		assert.equal(view(all, noVerdict.artifactId)?.review, null, 'a review with no valid verdict is no review');
		assert.equal(view(all, withFeedback.artifactId)?.openFeedback, 2);
		assert.deepEqual(legacyDeliveryView(all).map(v => v.artifactId), [...all.map(h => h.artifactId)].sort(), 'sorted by artifact id');

		// a flat amendment is read at its top level; a code review guards its story's BUILD
		const amendment: RawHead = { artifactId: `AMD-${H}-1`, json: { epicHash: H, status: 'approved', amendment: { type: 'x' } } };
		assert.equal(view([amendment], amendment.artifactId)?.approval, 'approved');
		const cr: RawHead = { artifactId: `CR-${H}-s1`, json: { meta: { epicHash: H, storyId: 's1' }, body: { verdict: 'block', counts: { high: 2 } } } };
		const build = (extra: Record<string, unknown>): RawHead => ({ artifactId: `BUILD-${H}-s1`, json: { meta: { epicHash: H, storyId: 's1', ...extra }, body: {} } });
		assert.equal(view([cr, build({})], cr.artifactId)?.review?.blocking, true);
		assert.equal(view([cr, build({ approvedAt: at })], cr.artifactId)?.review?.blocking, false, 'an approved BUILD lifts the code review block');
		assert.equal(view([cr, build({ reviewOverride: { reason: 'r' } })], cr.artifactId)?.review?.blocking, false, 'an override on the story\'s BUILD lifts it too');
		assert.equal(view([{ ...cr, json: { ...(cr.json as object), meta: { epicHash: H, storyId: 's1', reviewOverride: { reason: 'r' } } } }, build({})], cr.artifactId)?.review?.blocking, false, 'so does an override on the code review itself');
		assert.equal(view([cr, { ...build({}), artifactId: `BUILD-${H}-s2`, json: { meta: { epicHash: H, storyId: 's2', approvedAt: at }, body: {} } }], cr.artifactId)?.review?.blocking, true, 'a BUILD of another story does not lift it');

		// not an object, no meta, an unknown prefix: left out, never thrown
		assert.deepEqual(legacyDeliveryView([{ artifactId: `LLD-${H}-s1`, json: 'x' }, { artifactId: `LLD-${H}-s2`, json: { body: {} } }, { artifactId: 'TESTS-x', json: { meta: {} } }]), []);
	});

	it('legacy-view.test.ts: legacyDeliveryView reads no file', () => {
		const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'legacy-view.ts'), 'utf8');
		assert.doesNotMatch(source, /from 'node:(fs|path)/, 'the module imports no file system');
		assert.doesNotMatch(source, /readFileSync|readdirSync|existsSync/);
	});
});
