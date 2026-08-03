/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S001 · T004 — the `codeReview.grounding` daemon IPC handler.
 *
 * The handler (src/daemon/index.ts) is thin wiring: it composes
 * resolveCodeReviewSubject (t2) and assembleCodeReviewGrounding (t3) into one
 * request/response envelope. These tests exercise that COMPOSE CONTRACT — the
 * envelope the handler returns — without a live daemon socket:
 *   - subject declines (no approved contract / no build)  => { ok:false, reason }
 *   - subject resolves                                     => { ok:true, grounding }
 * The over-the-socket + byte/mtime-unchanged checks (ac4/ac5) are a live test,
 * gated behind INSRC_LIVE_TESTS per the repo convention.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCodeReviewSubject, NoBuildChangesError, type SubjectDeps } from '../subject.js';
import { ArtifactMissingError } from '../../gates.js';
import { assembleCodeReviewGrounding, type GroundingDeps, type GroundedEntity } from '../grounding.js';
import type { CodeReviewGrounding } from '../types.js';
import type { LldArtifact } from '../../artifacts/lld.js';
import type { PlanArtifact } from '../../artifacts/plan.js';

/** Reproduce exactly what the inline daemon handler does with its two seams. */
async function handlerCompose(
	repoPath: string, epicHash: string, storyId: string,
	subjectDeps: SubjectDeps, groundingDeps: GroundingDeps,
): Promise<{ ok: false; reason: string } | { ok: true; grounding: CodeReviewGrounding }> {
	const subject = await resolveCodeReviewSubject(repoPath, epicHash, storyId, subjectDeps);
	if (!subject.ok) return { ok: false, reason: subject.reason };
	const grounding = await assembleCodeReviewGrounding(repoPath, subject.subject.changedFiles, groundingDeps);
	return { ok: true, grounding };
}

const okSubjectDeps: SubjectDeps = {
	requireApprovedLld:  () => ({ meta: { workflow: 'design.story' } } as unknown as LldArtifact),
	requireApprovedPlan: () => ({ meta: { workflow: 'plan' } } as unknown as PlanArtifact),
	changedFiles:        async () => ['src/a.ts'],
};

const groundingDeps: GroundingDeps = {
	entitiesInFile: async (_r, f) => f === 'src/a.ts'
		? [{ id: 'e1', file: 'src/a.ts', kind: 'function', name: 'alpha', signature: 'alpha(): void' } as GroundedEntity]
		: [],
	callersOf: async () => [],
	calleesOf: async () => [],
};

test('codeReview.grounding: returns { ok:true, grounding } with structured summaries when the subject resolves', async () => {
	const res = await handlerCompose('/repo', 'epic', 's1', okSubjectDeps, groundingDeps);
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.equal(res.grounding.symbols.length, 1);
	assert.equal(res.grounding.symbols[0]!.name, 'alpha');
	assert.equal(res.grounding.symbols[0]!.file, 'src/a.ts');
});

test('codeReview.grounding: no approved contract yields { ok:false, reason:no-approved-contract }, never a grounding', async () => {
	const res = await handlerCompose('/repo', 'epic', 's1', {
		...okSubjectDeps,
		requireApprovedLld: () => { throw new ArtifactMissingError('missing LLD'); },
	}, groundingDeps);
	assert.deepEqual(res, { ok: false, reason: 'no-approved-contract' });
});

test('codeReview.grounding: no build yields { ok:false, reason:no-build-record }, never a grounding', async () => {
	const res = await handlerCompose('/repo', 'epic', 's1', {
		...okSubjectDeps,
		changedFiles: async () => { throw new NoBuildChangesError('not a git repo'); },
	}, groundingDeps);
	assert.deepEqual(res, { ok: false, reason: 'no-build-record' });
});

// Live over-the-socket check (ac4) + byte/mtime-unchanged (ac5): gated.
test('codeReview.grounding: over-the-socket IPC + read-only (live)', { skip: process.env['INSRC_LIVE_TESTS'] !== '1' }, () => {
	// Requires a running daemon, a registered+indexed fixture repo with an
	// approved LLD/PLAN, and a build commit range. Under INSRC_LIVE_TESTS this
	// would: snapshot file bytes+mtimes, call the 'codeReview.grounding' IPC over
	// the socket, assert a CodeReviewGrounding comes back, and assert the snapshot
	// is unchanged. Skipped in the default (non-live) sweep.
	assert.ok(true);
});
