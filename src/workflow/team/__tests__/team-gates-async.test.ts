/**
 * The team gate functions are async (Story s10): the same outcomes and refusals when the tracker port, its loader and the issue
 * lookups answer with Promises as when they answer at once. The port here is in memory; nothing touches gh or git.
 * Run: npx tsx --test-force-exit src/workflow/team/__tests__/team-gates-async.test.ts
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import { authorizeApproval, authorizeFindingApply, reviewFixModeFor } from '../approval-gate.js';
import { assertMayAuthor, assertMayBuild } from '../author-gate.js';
import { _setGateDepsForTests, actingUser, claim, readHolder, release, reviewFixDecision, teamContext, teamGate, TeamGateRefusedError } from '../gate.js';
import type { GateDeps } from '../gate.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

afterEach(() => _setGateDepsForTests());

const HASH = 'a3f4b8c9d1e2f3a4';
const ISSUE = 'acme/demo#7';
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const policy = (admins: string[] = ['root']): PolicyReader => () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: admins } as unknown as TeamPolicy });

/** An in-memory port over one assignee list; every method answers at once (sync) or after a tick (async). */
function port(assignees: string[], me: string, asyncMode: boolean): { port: TrackerPort; list: string[]; calls: string[] } {
	const list = [...assignees];
	const calls: string[] = [];
	const wrap = <T>(f: () => PortResult<T>): PortResult<T> | Promise<PortResult<T>> => (asyncMode ? new Promise(r => setImmediate(() => r(f()))) : f());
	const p = {
		kind: 'github', capabilities: new Set(['claim']),
		whoAmI: () => wrap(() => { calls.push('whoAmI'); return { ok: true as const, value: me }; }),
		readAssignee: () => wrap(() => { calls.push('readAssignee'); return { ok: true as const, value: list[0] ?? null }; }),
		addAssignee: (_i: string, who: string) => wrap(() => { calls.push(`add:${who}`); if (!list.includes(who)) list.push(who); return { ok: true as const, value: [...list] }; }),
		setAssignee: (_i: string, who: string | null) => wrap(() => { calls.push(`set:${who}`); list.length = 0; if (who !== null) list.push(who); return { ok: true as const, value: undefined }; }),
	} as unknown as TrackerPort;
	return { port: p, list, calls };
}

function inject(pt: TrackerPort, asyncMode: boolean, over: Partial<GateDeps> = {}): void {
	_setGateDepsForTests({
		readPolicy: policy(),
		loadTracker: asyncMode ? async () => ({ ok: true, value: pt }) : () => ({ ok: true, value: pt }),
		resolveIssue: asyncMode ? async () => ISSUE : () => ISSUE,
		ensureIssue: asyncMode ? async () => ({ ok: true, value: ISSUE }) : () => ({ ok: true, value: ISSUE }),
		artifactExists: () => true,
		now: () => '2026-10-27T00:00:00.000Z',
		...over,
	});
}

const unitOf = (repo: string): UnitRef => ({ unit: 'story', repoPath: repo, epicHash: HASH, storyId: 's1' });

/** A repo whose artifacts folder holds an LLD of the Story, so the artifact gates can map it to its unit. */
function repoWithLld(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gates-')); dirs.push(repo);
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`), JSON.stringify({ meta: { workflow: 'design.story', repoPath: repo, epicHash: HASH, storyId: 's1' } }));
	return repo;
}

describe('team-gates-async.test.ts: the gate functions return the same outcomes and refusals with an async port', () => {
	for (const asyncMode of [false, true]) {
		const label = asyncMode ? 'async port' : 'sync port';

		it(`${label}: teamGate allows the holder, refuses another holder naming them, and takes an unassigned stage with the add-only assignment`, async () => {
			const unit = unitOf('/repo');
			let p = port(['alice'], 'alice', asyncMode); inject(p.port, asyncMode);
			assert.deepEqual(await teamGate('/repo', unit, 'author'), { kind: 'allowed', implicitClaim: false });
			p = port(['bob'], 'alice', asyncMode); inject(p.port, asyncMode);
			assert.deepEqual(await teamGate('/repo', unit, 'author'), { kind: 'held-by-other', holder: 'bob', offerPark: false });
			p = port([], 'alice', asyncMode); inject(p.port, asyncMode);
			assert.deepEqual(await teamGate('/repo', unit, 'build'), { kind: 'allowed', implicitClaim: true });
			assert.deepEqual(p.list, ['alice']);
			assert.ok(p.calls.includes('add:alice'));
		});

		it(`${label}: claim, release and the read of the holder keep their outcomes`, async () => {
			const unit = unitOf('/repo');
			let p = port([], 'alice', asyncMode); inject(p.port, asyncMode);
			assert.deepEqual(await claim('/repo', unit), { kind: 'allowed', implicitClaim: false });
			p = port(['bob'], 'alice', asyncMode); inject(p.port, asyncMode);
			assert.equal((await claim('/repo', unit)).kind, 'held-by-other');
			p = port(['bob'], 'alice', asyncMode); inject(p.port, asyncMode);
			const refused = await release('/repo', unit);
			assert.equal(refused.kind, 'refused');
			assert.match((refused as { reason: string }).reason, /only the holder \(bob\) or a policy administrator may release this stage/);
			p = port(['alice'], 'alice', asyncMode); inject(p.port, asyncMode);
			assert.deepEqual(await release('/repo', unit), { kind: 'allowed', implicitClaim: false });
			assert.deepEqual(p.list, []);
			p = port(['bob'], 'root', asyncMode); inject(p.port, asyncMode);
			assert.equal((await release('/repo', unit)).kind, 'allowed', 'an administrator releases whoever holds it');
			const ctx = await teamContext('/repo', unit);
			assert.ok(ctx.ok && ctx.team);
			const held = await readHolder(ctx as never, unit, () => 'now');
			assert.ok(held.ok);
		});

		it(`${label}: actingUser and reviewFixDecision`, async () => {
			const unit = unitOf('/repo');
			let p = port(['alice'], 'alice', asyncMode); inject(p.port, asyncMode);
			assert.equal(await actingUser('/repo'), 'alice');
			assert.equal(await reviewFixDecision('/repo', unit), 'apply-auto-fixes');
			p = port(['bob'], 'alice', asyncMode); inject(p.port, asyncMode);
			assert.equal(await reviewFixDecision('/repo', unit), 'report-only');
			inject(p.port, asyncMode, { readPolicy: () => ({ ok: true, value: 'none' }) });
			assert.equal(await actingUser('/repo'), undefined, 'no policy: nobody is asked');
		});

		it(`${label}: the artifact gates (approval, finding apply, fix mode) refuse a non-holder and let the holder through`, async () => {
			const repo = repoWithLld();
			const jsonPath = join(repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`);
			let p = port(['alice'], 'alice', asyncMode); inject(p.port, asyncMode);
			assert.equal(await authorizeApproval(jsonPath), undefined);
			assert.equal(await authorizeFindingApply(jsonPath), undefined);
			assert.equal(await reviewFixModeFor(jsonPath), 'apply-auto-fixes');
			p = port(['bob'], 'alice', asyncMode); inject(p.port, asyncMode);
			const refusal = await authorizeApproval(jsonPath);
			assert.equal(refusal?.outcome.kind, 'held-by-other');
			assert.equal((await authorizeFindingApply(jsonPath))?.outcome.kind, 'held-by-other');
			assert.equal(await reviewFixModeFor(jsonPath), 'report-only');
		});

		it(`${label}: assertMayAuthor and assertMayBuild resolve for the holder and reject with TeamGateRefusedError for another holder`, async () => {
			const repo = '/repo';
			let p = port(['alice'], 'alice', asyncMode); inject(p.port, asyncMode);
			await assertMayAuthor({ workflow: 'design.story', repoPath: repo, params: { epicHash: HASH, storyId: 's1' } });
			await assertMayBuild(repo, { epicHash: HASH, storyId: 's1' });
			p = port(['bob'], 'alice', asyncMode); inject(p.port, asyncMode);
			await assert.rejects(assertMayAuthor({ workflow: 'design.story', repoPath: repo, params: { epicHash: HASH, storyId: 's1' } }), (e: unknown) => e instanceof TeamGateRefusedError && /held by bob/.test(e.reason));
			await assert.rejects(assertMayBuild(repo, { epicHash: HASH, storyId: 's1' }), (e: unknown) => e instanceof TeamGateRefusedError && /held by bob/.test(e.reason));
		});
	}

	it('the outcomes are the same for a sync and an async port, case for case', async () => {
		const results: Record<string, unknown[]> = {};
		for (const asyncMode of [false, true]) {
			const out: unknown[] = [];
			for (const [assignees, me] of [[[], 'alice'], [['alice'], 'alice'], [['bob'], 'alice'], [['bob', 'carol'], 'alice']] as const) {
				for (const action of ['author', 'build', 'approve-local', 'revise', 'release'] as const) {
					const p = port([...assignees], me, asyncMode); inject(p.port, asyncMode);
					out.push(await teamGate('/repo', unitOf('/repo'), action));
				}
			}
			results[asyncMode ? 'async' : 'sync'] = out;
		}
		assert.deepEqual(results['async'], results['sync']);
	});
});
