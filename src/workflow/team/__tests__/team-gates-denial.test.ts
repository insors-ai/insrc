/**
 * A denied tracker call stops the team gate (Story s10): it is thrown as ToolDenied and never becomes undefined, a generic refusal or a
 * report-only review. An ordinary exception from the port keeps its old outcome.
 * Run: npx tsx --test-force-exit src/workflow/team/__tests__/team-gates-denial.test.ts
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import { ToolDenied } from '../../tracker/tool-denied.js';
import { authorizeApproval, authorizeFindingApply, reviewFixModeFor } from '../approval-gate.js';
import { assertMayAuthor, assertMayBuild } from '../author-gate.js';
import { _setGateDepsForTests, actingUser, claim, registerCompletionHook, release, reviewFixDecision, teamGate } from '../gate.js';
import type { GateDeps } from '../gate.js';
import { parkPlan } from '../handoff.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const ISSUE = 'acme/demo#7';
const dirs: string[] = [];
afterEach(() => { _setGateDepsForTests(); registerCompletionHook(undefined); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const policy: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: ['root'] } as unknown as TeamPolicy });
const UNIT: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: HASH, storyId: 's1' };
const denied = (tool = 'gh_issue_edit') => new ToolDenied(tool, 'declined');
const isDenied = (e: unknown): boolean => e instanceof ToolDenied && e.reason === 'declined';

type Failing = 'whoAmI' | 'readAssignee' | 'addAssignee' | 'setAssignee' | 'none';
/** A port whose `failing` method throws `error` (sync or async); the rest answer: alice, nobody assigned. */
function port(failing: Failing, error: unknown, asyncMode: boolean): TrackerPort {
	const step = <T>(name: Failing, ok: T) => (): T | Promise<T> => {
		const f = (): T => { if (failing === name) throw error; return ok; };
		return asyncMode ? new Promise<T>((res, rej) => setImmediate(() => { try { res(f()); } catch (e) { rej(e); } })) : f();
	};
	return {
		kind: 'github', capabilities: new Set(['claim']),
		whoAmI: step('whoAmI', { ok: true as const, value: 'alice' }),
		readAssignee: step('readAssignee', { ok: true as const, value: null }),
		addAssignee: step('addAssignee', { ok: true as const, value: ['alice'] }),
		setAssignee: step('setAssignee', { ok: true as const, value: undefined }),
	} as unknown as TrackerPort;
}
function inject(pt: TrackerPort, over: Partial<GateDeps> = {}): void {
	_setGateDepsForTests({ readPolicy: policy, loadTracker: () => ({ ok: true, value: pt }), resolveIssue: () => ISSUE, ensureIssue: () => ({ ok: true, value: ISSUE }), artifactExists: () => true, ...over });
}
function repoWithLld(): { repo: string; json: string } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gates-den-')); dirs.push(repo);
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const json = join(repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`);
	writeFileSync(json, JSON.stringify({ meta: { workflow: 'design.story', repoPath: repo, epicHash: HASH, storyId: 's1' } }));
	return { repo, json };
}

describe('team-gates-denial.test.ts: a denial stops the stage as ToolDenied and is never undefined, a generic refusal or report-only', () => {
	for (const asyncMode of [false, true]) {
		const label = asyncMode ? 'async' : 'sync';

		it(`${label}: teamGate, claim and release throw the denial from whoAmI, readAssignee, addAssignee and setAssignee instead of a generic refusal`, async () => {
			for (const failing of ['whoAmI', 'readAssignee', 'addAssignee'] as const) {
				inject(port(failing, denied(), asyncMode));
				await assert.rejects(teamGate('/repo', UNIT, 'build'), isDenied, `teamGate ${failing}`);
				inject(port(failing, denied(), asyncMode));
				await assert.rejects(claim('/repo', UNIT), isDenied, `claim ${failing}`);
			}
			inject(port('setAssignee', denied(), asyncMode), { readPolicy: () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: ['alice'] } as unknown as TeamPolicy }) });
			await assert.rejects(release('/repo', UNIT), isDenied, 'release setAssignee');
		});

		it(`${label}: actingUser throws the denial and does not answer undefined; a non-denial failure still answers undefined`, async () => {
			inject(port('whoAmI', denied(), asyncMode));
			await assert.rejects(actingUser('/repo'), isDenied);
			inject(port('whoAmI', new Error('boom'), asyncMode));
			assert.equal(await actingUser('/repo'), undefined);
		});

		it(`${label}: reviewFixDecision and reviewFixModeFor throw the denial and do not continue as report-only; a non-denial failure is still report-only`, async () => {
			const { json } = repoWithLld();
			inject(port('readAssignee', denied(), asyncMode));
			await assert.rejects(reviewFixDecision('/repo', UNIT), isDenied);
			inject(port('readAssignee', denied(), asyncMode));
			await assert.rejects(reviewFixModeFor(json), isDenied);
			inject(port('readAssignee', new Error('boom'), asyncMode));
			assert.equal(await reviewFixDecision('/repo', UNIT), 'report-only');
			assert.equal(await reviewFixModeFor(json), 'report-only');
		});

		it(`${label}: authorizeApproval and authorizeFindingApply (authorizeStageChange) throw the denial and are never a generic refusal`, async () => {
			const { json } = repoWithLld();
			inject(port('readAssignee', denied(), asyncMode));
			await assert.rejects(authorizeApproval(json), isDenied);
			await assert.rejects(authorizeFindingApply(json), isDenied);
			inject(port('readAssignee', new Error('boom'), asyncMode));
			const generic = await authorizeApproval(json);
			assert.equal(generic?.outcome.kind, 'refused');
			assert.match((generic?.outcome as { reason: string }).reason, /team gate failed: boom/);
		});

		it(`${label}: assertMayAuthor and assertMayBuild throw the denial, not a TeamGateRefusedError`, async () => {
			inject(port('whoAmI', denied(), asyncMode));
			await assert.rejects(assertMayAuthor({ workflow: 'design.story', repoPath: '/repo', params: { epicHash: HASH, storyId: 's1' } }), isDenied);
			await assert.rejects(assertMayBuild('/repo', { epicHash: HASH, storyId: 's1' }), isDenied);
		});

		it(`${label}: a denial inside the completion hook stops the gate; an ordinary hook failure is still the refused outcome`, async () => {
			inject(port('none', undefined, asyncMode), { readPolicy: policy });
			registerCompletionHook(() => { throw denied('gh_pr_create'); });
			await assert.rejects(teamGate('/repo', UNIT, 'open-signoff'), (e: unknown) => e instanceof ToolDenied && e.toolId === 'gh_pr_create');
			registerCompletionHook(() => { throw new Error('hook broke'); });
			const o = await teamGate('/repo', UNIT, 'open-signoff');
			assert.equal(o.kind, 'refused');
			assert.match((o as { reason: string }).reason, /the completion hook failed: hook broke/);
		});

		it(`${label}: parkPlan throws the denial instead of "park could not be planned"`, async () => {
			inject(port('readAssignee', denied(), asyncMode));
			const planned = parkPlan('/repo', UNIT, {}, { branchPattern: () => 'park/{type}/{id}', now: () => 'now' } as never);
			await assert.rejects(planned, isDenied);
		});
	}
});
