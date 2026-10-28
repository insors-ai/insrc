/**
 * The team and review operations at the daemon (Story s10): with claims enforced, resolveFinding and reviewArtifact run through the daemon
 * methods and give the results and refusals the terminal's services gave; claim and release print the same lines.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/review-resolve-daemon.test.ts
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleResolveFinding, handleReviewArtifact, handleTeamClaim, handleTeamRelease } from '../team-review-handlers.js';
import { writeReviewedHead } from '../../workflow/__tests__/lifecycle-fixtures.js';
import { _setGateDepsForTests, TeamGateRefusedError } from '../../workflow/team/gate.js';
import type { PolicyReader, TeamPolicy } from '../../workflow/team/types.js';
import type { PortResult, TrackerPort } from '../../workflow/tracker/port.js';
import type { Finding, ReviewReport } from '../../workflow/review/types.js';

afterEach(() => _setGateDepsForTests());

const HASH = 'a3f4b8c9d1e2f3a4';
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });

function hold(holder: string | null): void {
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: holder }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
		setAssignee: (): PortResult<void> => ({ ok: true, value: undefined }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({ readPolicy: team, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7' });
}

const finding = (over: Partial<Finding>): Finding => ({ claimId: 'c', kind: 'inventory', severity: 'MED', premise: 'p', evidence: 'e', action: 'a', fixability: 'manual', ...over });
const report = (findings: Finding[]): ReviewReport => ({ artifact: 'PLAN', stage: 'plan', verdict: 'block', findings, counts: { high: 0, med: 0, low: 0 }, reviewedAt: '', model: 'm' });

function setup(): { md: string; json: string; dir: string; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-review-resolve-daemon-'));
	mkdirSync(join(dir, 'docs', 'epics', 'e1', 'S001'), { recursive: true });
	const md = join(dir, 'docs', 'epics', 'e1', 'S001', 'PLAN.md');
	writeFileSync(md, `<!-- insrc:artifact PLAN-${HASH}-s1 -->\n# Plan\n\n- t1: extend the two exported constants.\n`);
	const json = writeReviewedHead(dir, `PLAN-${HASH}-s1`, {
		meta: { workflow: 'plan', repoPath: dir, epicHash: HASH, storyId: 's1' },
		body: { tasks: [{ id: 't1', desc: 'extend the two exported constants.' }] },
		report: report([
			finding({ claimId: 'apply1', severity: 'HIGH', fixability: 'assisted', proposedFix: { rationale: 'r', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] } }),
			finding({ claimId: 'acc', severity: 'MED' }),
		]),
	});
	return { md, json, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('review-resolve-daemon.test.ts: with claims enforced, reviewArtifact and resolveFinding run through the daemon methods and return the old results and refusals', () => {
	it('resolveFinding: apply by a non-holder is refused and writes nothing, accept records, and the holder applies', async () => {
		const s = setup();
		try {
			const mdBefore = readFileSync(s.md, 'utf8');
			hold('bob');
			await assert.rejects(handleResolveFinding({ artifactPath: s.md, findingId: 'apply1', action: 'apply' }), (e: unknown) => e instanceof TeamGateRefusedError && /held by bob/.test(e.reason));
			assert.equal(readFileSync(s.md, 'utf8'), mdBefore);
			assert.equal((await handleResolveFinding({ artifactPath: s.md, findingId: 'acc', action: 'accept', note: 'fine' })).status, 'resolved');
			hold('alice');
			assert.equal((await handleResolveFinding({ artifactPath: s.md, findingId: 'apply1', action: 'apply' })).status, 'resolved');
			assert.match(readFileSync(s.md, 'utf8'), /three exported constants/);
			// a bad request is the error of the call
			await assert.rejects(handleResolveFinding({ artifactPath: s.md, findingId: 'x', action: 'bogus' }), /`action` must be apply, accept, override or defer/);
		} finally { s.cleanup(); }
	});

	it('reviewArtifact: runs the review in the daemon with the repository and the artifact it was given and returns its result; a missing path is the error of the call', async () => {
		const s = setup();
		try {
			const seen: Array<{ mdPath: string; jsonPath: string; repo: string }> = [];
			const result = { report: report([]), applied: [], pendingUser: [] } as never;
			const out = await handleReviewArtifact({ repoPath: s.dir, artifactPath: s.md }, { review: (async (o: { mdPath: string; jsonPath: string; repo: string }) => { seen.push({ mdPath: o.mdPath, jsonPath: o.jsonPath, repo: o.repo }); return result; }) as never });
			assert.equal(out, result);
			assert.deepEqual(seen, [{ mdPath: s.md, jsonPath: s.json, repo: s.dir }]);
			await assert.rejects(handleReviewArtifact({ repoPath: s.dir }), /`artifactPath` is required/);
			await assert.rejects(handleReviewArtifact({ artifactPath: s.md }), /`repoPath` is required/);
		} finally { s.cleanup(); }
	});

	it('claim and release print the terminal\'s lines: a tick when allowed, a cross naming the holder when the stage is held by someone else', async () => {
		const s = setup();
		try {
			const unit = { unit: 'story', epicHash: HASH, storyId: 's1' };
			hold(null);
			assert.equal(await handleTeamClaim({ repoPath: s.dir, unit }), `✓ claimed story ${HASH}/s1`);
			hold('bob');
			assert.match(await handleTeamClaim({ repoPath: s.dir, unit }), /^✗ not claimed — /);
			hold('alice');
			assert.equal(await handleTeamRelease({ repoPath: s.dir, unit }), `✓ released story ${HASH}/s1`);
			await assert.rejects(handleTeamClaim({ repoPath: s.dir }), /`unit` .* is required/);
		} finally { s.cleanup(); }
	});
});
