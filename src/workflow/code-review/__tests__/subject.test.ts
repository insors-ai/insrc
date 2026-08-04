/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveCodeReviewSubject, NoBuildChangesError, type SubjectDeps } from '../subject.js';
import { ArtifactMissingError, ArtifactNotApprovedError } from '../../gates.js';
import { UnregisteredRepoError } from '../../../db/repos.js';
import type { LldArtifact } from '../../artifacts/lld.js';
import type { PlanArtifact } from '../../artifacts/plan.js';

const fakeLld  = { meta: { workflow: 'design.story' } } as unknown as LldArtifact;
const fakePlan = { meta: { workflow: 'plan' } } as unknown as PlanArtifact;

/** Base deps: approved contract + a known 2-file changed set. Tests override. */
function deps(over: Partial<SubjectDeps> = {}): SubjectDeps {
	return {
		requireApprovedLld:  () => fakeLld,
		requireApprovedPlan: () => fakePlan,
		changedFiles:        async () => ['src/a.ts', 'src/b.ts'],
		...over,
	};
}

// ---- ac1: subject.changedFiles equals the git-derived set exactly ----

test('resolveCodeReviewSubject: changedFiles equals the git set exactly, build record not mutated', async () => {
	const record = { meta: { workflow: 'build' } } as never;
	let recordArg: unknown;
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		readBuildRecord: (...a) => { recordArg = a; return record; },
	}));
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.deepEqual(res.subject.changedFiles, ['src/a.ts', 'src/b.ts']);
	assert.equal(res.subject.buildRecord, record);   // consumed for identity, same object
	assert.deepEqual(recordArg, ['/repo', 'epic', 's1']);
});

test('resolveCodeReviewSubject: empty diff is a valid trivial subject (not an error)', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({ changedFiles: async () => [] }));
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.deepEqual(res.subject.changedFiles, []);
});

// ---- S001: LLD + PLAN both OPTIONAL — three modes keyed on presence ----

test('resolveCodeReviewSubject: LLD+plan approved -> ok:true both set (mode A)', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps());
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.equal(res.subject.approvedLld, fakeLld);
	assert.equal(res.subject.approvedPlan, fakePlan);
});

test('resolveCodeReviewSubject: LLD approved, plan missing/unapproved -> ok:true, approvedPlan null (mode B)', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		requireApprovedPlan: () => { throw new ArtifactNotApprovedError('plan not approved'); },
	}));
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.equal(res.subject.approvedLld, fakeLld);
	assert.equal(res.subject.approvedPlan, null);
});

test('resolveCodeReviewSubject: plan approved, LLD missing -> ok:true, approvedLld null (asymmetric)', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		requireApprovedLld: () => { throw new ArtifactMissingError('no LLD'); },
	}));
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.equal(res.subject.approvedLld, null);
	assert.equal(res.subject.approvedPlan, fakePlan);
});

test('resolveCodeReviewSubject: both missing/unapproved but changed files present -> ok:true, both null (mode C)', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		requireApprovedLld:  () => { throw new ArtifactMissingError('no LLD'); },
		requireApprovedPlan: () => { throw new ArtifactNotApprovedError('plan not approved'); },
	}));
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.equal(res.subject.approvedLld, null);
	assert.equal(res.subject.approvedPlan, null);
	assert.deepEqual(res.subject.changedFiles, ['src/a.ts', 'src/b.ts']);
});

test('resolveCodeReviewSubject: non-Artifact error while resolving a contract propagates (not mapped to null)', async () => {
	await assert.rejects(
		() => resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
			requireApprovedPlan: () => { throw new TypeError('corrupt artifact'); },
		})),
		(err: unknown) => err instanceof TypeError,
	);
});

// ---- no-build-record: git derivation fails — now the ONLY ok:false reason ----

test('resolveCodeReviewSubject: git derivation failure -> no-build-record', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		changedFiles: async () => { throw new NoBuildChangesError('not a git repo'); },
	}));
	assert.deepEqual(res, { ok: false, reason: 'no-build-record' });
});

// ---- operator-misconfig: UnregisteredRepoError propagates unchanged ----

test('resolveCodeReviewSubject: UnregisteredRepoError propagates (not collapsed to a reason)', async () => {
	await assert.rejects(
		() => resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
			requireApprovedLld: () => { throw new UnregisteredRepoError('/repo'); },
		})),
		(err: unknown) => err instanceof UnregisteredRepoError,
	);
});

// ---- ac5: read-only — the resolver invokes no write/edit tool ----

test('resolveCodeReviewSubject: read-only — only the injected read seams are called', async () => {
	const calls: string[] = [];
	await resolveCodeReviewSubject('/repo', 'epic', 's1', {
		requireApprovedLld:  () => { calls.push('lld'); return fakeLld; },
		requireApprovedPlan: () => { calls.push('plan'); return fakePlan; },
		changedFiles:        async () => { calls.push('diff'); return []; },
		readBuildRecord:     () => { calls.push('build'); return null; },
	});
	// exactly the read seams, no mutation surface exists in the resolver at all
	assert.deepEqual(calls, ['lld', 'plan', 'diff', 'build']);
});
