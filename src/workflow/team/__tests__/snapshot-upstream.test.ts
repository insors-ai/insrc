/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What a run records about its upstream when it is created: the artifacts each authoring workflow reads, with the
 * revision in force (the effective HLD keyed by its amendments), and the acting user.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/snapshot-upstream.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId } from '../../storage.js';
import { getEffectiveHash } from '../../amendments/effective.js';
import { approveAmendment, proposeAmendment } from '../../amendments/store.js';
import type { AmendmentRecord } from '../../amendments/types.js';
import type { HldArtifact } from '../../artifacts/hld.js';
import { _setGateDepsForTests, actingUser } from '../gate.js';
import { runMetaFor, snapshotUpstream } from '../run-meta.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
afterEach(() => { _setGateDepsForTests(); });

function seed(repo: string, id: string, doc: unknown): void {
	const path = artifactJsonPath(repo, id);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(doc));
}

const hldBody = {
	frameworkSummary: 'x', architectureShape: 'x',
	sharedContracts: [{ id: 'sc1', name: 'API', purpose: 'p', interfaceSketch: 'interface API { fn(): void; }', ownedByStory: 's1', consumedByStories: ['s2'], assumptions: [] }],
	storyBoundaries: [{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'x' }],
	nonFunctional: { performance: 'x' },
	rolloutOverview: { phases: [], orderingRationale: 'x', riskyBits: [] },
	alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
};

function seedChain(repo: string, revisions: { def?: number; hld?: number; lld?: number }): void {
	const meta = (workflow: string, revision: number | undefined) => ({ workflow, runId: `${workflow}-1`, epicHash: HASH, epicSlug: 'e', storyId: 's1', ...(revision !== undefined ? { revision } : {}) });
	seed(repo, defineArtifactId(HASH), { meta: meta('define', revisions.def), body: {}, citations: [] });
	seed(repo, hldArtifactId(HASH), { meta: meta('design.epic', revisions.hld), body: hldBody, citations: [] });
	seed(repo, lldArtifactId(HASH, 's1'), { meta: meta('design.story', revisions.lld), body: {}, citations: [] });
}

const amendment = (id: string): AmendmentRecord => ({
	id, epicHash: HASH, epicSlug: 'e', hldBaseRunId: 'design.epic-1',
	amendment: { type: 'sharedContract.fieldAdd', contractId: 'sc1', field: { name: 'batchSize', type: 'number', optional: true, purpose: 'batching' }, breaking: false },
	rationale: 'r', citations: [], proposedBy: { workflow: 'design.story', runId: 'lld-x', storyId: 's2', stepId: 's4' },
	proposedAt: new Date().toISOString(), status: 'pending',
});

test('snapshotUpstream lists the artifacts each workflow reads, including the Define and the effective HLD with approved amendments, a missing revision reads as 0, and a standalone Story does not fail', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-snap-'));
	try {
		seedChain(repo, { def: 3, hld: 5, lld: undefined });   // the LLD has no revision at all
		const ids = (workflow: string): string[] => snapshotUpstream(repo, workflow, { epicHash: HASH, storyId: 's1' }).map(u => u.artifactId.split('@')[0]!);
		const revOf = (workflow: string, id: string): number | undefined => snapshotUpstream(repo, workflow, { epicHash: HASH, storyId: 's1' }).find(u => u.artifactId.split('@')[0] === id)?.revision;

		// which artifacts each workflow reads
		assert.deepEqual(ids('design.epic'), [defineArtifactId(HASH)]);
		assert.deepEqual(ids('design.story'), [defineArtifactId(HASH), hldArtifactId(HASH)]);
		assert.deepEqual(ids('plan'), [lldArtifactId(HASH, 's1'), hldArtifactId(HASH), defineArtifactId(HASH)]);
		assert.deepEqual(ids('stub'), [], 'a workflow that is not a claim unit reads nothing to snapshot');

		// revisions come from the files, and a missing revision reads as 0
		assert.equal(revOf('plan', defineArtifactId(HASH)), 3);
		assert.equal(revOf('plan', hldArtifactId(HASH)), 5);
		assert.equal(revOf('plan', lldArtifactId(HASH, 's1')), 0);

		// the effective HLD is keyed by its approved amendments: approving one changes the entry
		const before = snapshotUpstream(repo, 'design.story', { epicHash: HASH });
		proposeAmendment(repo, amendment(`AMD-${HASH}-1`));
		assert.deepEqual(snapshotUpstream(repo, 'design.story', { epicHash: HASH }), before, 'a pending amendment does not change the snapshot');
		approveAmendment(repo, `AMD-${HASH}-1`, 'alice');
		const after = snapshotUpstream(repo, 'design.story', { epicHash: HASH });
		assert.notDeepEqual(after, before, 'an approved amendment changes the effective HLD entry');
		const hldEntry = after.find(u => u.artifactId.startsWith(hldArtifactId(HASH)));
		assert.equal(hldEntry?.artifactId, `${hldArtifactId(HASH)}@${getEffectiveHash(repo, HASH, JSON.parse(JSON.stringify({ meta: { runId: 'design.epic-1' }, body: hldBody })) as HldArtifact)}`);
		assert.equal(hldEntry?.revision, 5, 'the base revision is kept beside the amendment state');

		// a standalone Story has no Define or HLD: nothing fails, the absent artifacts read as revision 0
		const standalone = mkdtempSync(join(tmpdir(), 'insrc-snap-sa-'));
		try {
			const snap = snapshotUpstream(standalone, 'design.story', { epicHash: 'b1b2b3b4c1c2c3c4', storyId: 'S001', standalone: true });
			assert.deepEqual(snap.map(u => u.revision), [0, 0]);
			assert.deepEqual(snapshotUpstream(standalone, 'plan', {}), [], 'no epic hash means nothing to snapshot');
		} finally { rmSync(standalone, { recursive: true, force: true }); }
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('actingUser and runMetaFor read the tracker only for a repo that enforces claims', () => {
	let loads = 0;
	const port = { whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }) } as unknown as TrackerPort;
	const reader = (enforced: boolean): PolicyReader => () => ({ ok: true, value: enforced ? ({ teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy) : 'none' });
	const deps = (enforced: boolean) => _setGateDepsForTests({ readPolicy: reader(enforced), loadTracker: () => { loads += 1; return { ok: true, value: port }; } });

	deps(false);
	assert.equal(actingUser('/repo'), undefined);
	assert.equal(runMetaFor('/repo', 'plan', { epicHash: HASH, storyId: 's1' }), undefined);
	assert.equal(loads, 0, 'no policy: no tracker call');

	deps(true);
	assert.equal(actingUser('/repo'), 'alice');
	assert.equal(runMetaFor('/nowhere', 'stub', {})?.owner, 'alice');

	// a tracker that cannot be used gives no owner and never throws
	_setGateDepsForTests({ readPolicy: reader(true), loadTracker: () => ({ ok: false, kind: 'missing-tool', reason: 'gh missing' }) });
	assert.equal(actingUser('/repo'), undefined);
});
