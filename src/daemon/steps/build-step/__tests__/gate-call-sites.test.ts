/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Team gate at the build route (sc4, action build): implement and validate are refused for
 * anyone but the holder of the Task (or of the Story, for a standalone build), before
 * admission, the build-start stamp, any check or any record. A repo with no policy builds as before.
 *
 * Run: npx tsx --test src/daemon/steps/build-step/__tests__/gate-call-sites.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBuildStep } from '../handler.js';
import { _setBuildValidateCheckRunnerForTests, _setBuildValidateProviderForTests } from '../phases/validate.js';
import { approvedMeta, markApprovedSync } from '../../../../workflow/__tests__/lifecycle-fixtures.js';
import { approveJson } from '../../../../workflow/__tests__/helpers/approve.js';
import { approvalStateOf } from '../../../../workflow/artifact-core/approval-view.js';
import { ARTIFACTS_DIR, lldArtifactId, planArtifactId } from '../../../../workflow/storage.js';
import { _setGateDepsForTests, type PolicyReader } from '../../../../workflow/team/gate.js';
import type { TeamPolicy } from '../../../../workflow/team/types.js';
import type { PortResult, TrackerPort } from '../../../../workflow/tracker/port.js';

const HASH = 'b7c8d9e0f1a2b3c4';
const CREATED_AT = '2026-07-18T00:00:00.000Z';

interface Fx { repo: string; git: (...a: string[]) => string; cleanup: () => void }

function mkGit(): Fx {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-start-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(repo, 'before.ts'), 'export const b = 1;\n');
	git('add', '-A'); git('commit', '-qm', 'before any Story');
	return { repo, git, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const artifact = (fx: Fx, id: string): string => join(fx.repo, ARTIFACTS_DIR, `${id}.json`);

function writeArtifact(fx: Fx, id: string, doc: unknown): string {
	mkdirSync(join(fx.repo, ARTIFACTS_DIR), { recursive: true });
	writeFileSync(artifact(fx, id), JSON.stringify(doc, null, 2) + '\n');
	return artifact(fx, id);
}

/** An epic with `stories`, each with an approved LLD and an UNAPPROVED plan of
 *  `tasks`. Committed, so the tree is clean. */
function seedEpic(fx: Fx, stories: Readonly<Record<string, readonly string[]>>): void {
	writeArtifact(fx, `DEF-${HASH}`, {
		meta: { workflow: 'define', epicHash: HASH, epicSlug: 'range-base', createdAt: CREATED_AT, ...approvedMeta({ at: CREATED_AT }) },
		body: { problem: 'p', stories: Object.keys(stories).map(id => ({ id, title: `Story ${id}` })) },
		citations: [],
	});
	for (const [storyId, tasks] of Object.entries(stories)) {
		writeArtifact(fx, lldArtifactId(HASH, storyId), {
			meta: {
				workflow: 'design.story', runId: `lld-${storyId}`, schemaVersion: 1,
				epicHash: HASH, epicSlug: 'range-base', storyId, createdAt: CREATED_AT,
				hldBaseRunId: 'hld-1', hldEffectiveHash: `basis-${storyId}`, hldAmendmentsApplied: [],
				...approvedMeta({ at: CREATED_AT }),
			},
			body: { openQuestions: [] }, citations: [],
		});
		writeArtifact(fx, planArtifactId(HASH, storyId), {
			meta: {
				workflow: 'plan', runId: `plan-${storyId}`, schemaVersion: 1,
				epicHash: HASH, epicSlug: 'range-base', storyId, createdAt: CREATED_AT,
				lldRunId: `lld-${storyId}`, lldEffectiveHash: `basis-${storyId}`,
			},
			body: {
				tasks: tasks.map((id, i) => ({
					id, title: `Task ${id}`, summary: 's', size: 'S', order: i + 1, dependsOn: [],
					acceptanceChecks: ['it holds'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: `unit: ${id}` }],
				})),
			},
			citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD' }],
		});
	}
	fx.git('add', '-A'); fx.git('commit', '-qm', 'the epic\'s design artifacts');
}

/** Approve the plans, then commit the rewrite so the tree is clean again. */
function approvePlansInOneSweep(fx: Fx, storyIds: readonly string[]): void {
	for (const s of storyIds) markApprovedSync(artifact(fx, planArtifactId(HASH, s)));
	fx.git('add', '-A'); fx.git('commit', '-qm', 'approve the plans');
}

function out(env: { content: { type: 'text'; text: string }[] }): Record<string, unknown> {
	return JSON.parse(env.content[0]!.text) as Record<string, unknown>;
}


const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
const none: PolicyReader = () => ({ ok: true, value: 'none' });

interface Seen { loads: number; reads: number; judged: number; checked: number }

function inject(holder: string | null, readPolicy: PolicyReader = team): Seen {
	const seen: Seen = { loads: 0, reads: 0, judged: 0, checked: 0 };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => { seen.reads += 1; return { ok: true, value: holder }; },
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({
		readPolicy,
		loadTracker: () => { seen.loads += 1; return { ok: true, value: port }; },
		resolveIssue: () => 'acme/demo#7',
		ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }),
		artifactExists: () => true,
	});
	_setBuildValidateCheckRunnerForTests(async () => { seen.checked += 1; throw new Error('no check may run'); });
	_setBuildValidateProviderForTests({ runReviewSession: async () => { seen.judged += 1; throw new Error('no judge may run'); } } as never);
	return seen;
}

afterEach(() => { _setGateDepsForTests(); _setBuildValidateCheckRunnerForTests(undefined); _setBuildValidateProviderForTests(undefined); });

const errorOf = (o: Record<string, unknown>): { code?: string; message?: string } => (o['error'] ?? {}) as never;

test('build implement and validate on a stage held by someone else are refused naming the holder', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1'] });
		approvePlansInOneSweep(fx, ['s1']);
		const before = fx.git('status', '--porcelain');
		const seen = inject('bob');

		for (const phase of ['implement', 'validate'] as const) {
			const res = out(await handleBuildStep({ phase, target: 's1/t1', repo: fx.repo }));
			assert.equal(res['next'], 'error', phase);
			assert.equal(errorOf(res).code, 'team-gate-refused', phase);
			assert.match(errorOf(res).message ?? '', /held by bob/, phase);
		}
		// a standalone build is refused the same way, on the Story
		for (const phase of ['implement', 'validate'] as const) {
			const res = out(await handleBuildStep({ phase, target: 's1', repo: fx.repo, standalone: { standalone: true, sizeClass: 'trivial', focus: 'fix a typo' } }));
			assert.equal(errorOf(res).code, 'team-gate-refused', `standalone ${phase}`);
			assert.match(errorOf(res).message ?? '', /held by bob/, `standalone ${phase}`);
		}
		assert.equal(seen.checked, 0, 'no check ran');
		assert.equal(seen.judged, 0, 'no judge session ran');
		assert.equal(fx.git('status', '--porcelain'), before, 'nothing was stamped or written');
		assert.ok(!existsSync(join(fx.repo, ARTIFACTS_DIR, 'BUILD-' + HASH + '-s1.json')));

		// the holder is let through to admission
		inject('alice');
		assert.equal(out(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo: fx.repo }))['next'], 'implement');
	} finally { fx.cleanup(); }
});

test('build with no policy behaves as before and never touches the tracker', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1'] });
		approvePlansInOneSweep(fx, ['s1']);
		const seen = inject('bob', none);
		assert.equal(out(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo: fx.repo }))['next'], 'implement');
		assert.equal(seen.loads, 0);
		assert.equal(seen.reads, 0);
	} finally { fx.cleanup(); }
});

test('validate asks the gate again before each record it writes: a claim that moved to someone else meanwhile refuses the write', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1'] });
		approvePlansInOneSweep(fx, ['s1']);
		const records = (): string[] => [`BUILD-${HASH}-s1.json`, `TESTS-${HASH}-s1.json`].filter(f => existsSync(join(fx.repo, ARTIFACTS_DIR, f)));
		const passing = { ok: true, command: 'x', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' };
		const flipAfter = (asks: number): { reads: () => number } => {
			let reads = 0;
			const port = {
				whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
				readAssignee: (): PortResult<string | null> => { reads += 1; return { ok: true, value: reads <= asks ? 'alice' : 'bob' }; },
				addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
			} as unknown as TrackerPort;
			_setGateDepsForTests({
				readPolicy: team, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7',
				ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }), artifactExists: () => true,
			});
			_setBuildValidateCheckRunnerForTests(async () => ({ typecheck: passing, tests: passing }));
			_setBuildValidateProviderForTests({ runReviewSession: async () => ({ taskId: 't1', passed: true, checks: [], scopeRespected: true, reason: 'ok' }) } as never);
			return { reads: () => reads };
		};

		// the claim moves while the checks run: refused before the test record is written
		flipAfter(1);
		const early = out(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo: fx.repo }));
		assert.equal(errorOf(early).code, 'team-gate-refused', JSON.stringify(early));
		assert.match(errorOf(early).message ?? '', /held by bob/);
		assert.deepEqual(records(), [], 'no record was written');

		// the claim moves while the judge runs: the test record stands, the BUILD record is not written
		const late = flipAfter(2);
		const res = out(await handleBuildStep({ phase: 'validate', target: 's1/t1', repo: fx.repo }));
		assert.equal(errorOf(res).code, 'team-gate-refused', JSON.stringify(res));
		assert.ok(late.reads() >= 3);
		assert.ok(!records().includes(`BUILD-${HASH}-s1.json`), 'the BUILD record was not written');
	} finally { fx.cleanup(); }
});
