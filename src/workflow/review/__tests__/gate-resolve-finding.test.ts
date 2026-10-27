/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Applying a review finding changes the stage's content, so in a team repo only the holder
 * may; accept, override and defer only record a decision and are not guarded.
 *
 * Run: npx tsx --test src/workflow/review/__tests__/gate-resolve-finding.test.ts
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { writeReviewedHead } from '../../__tests__/lifecycle-fixtures.js';
import { readReviewRecordOf } from '../report-file.js';
import { resolveReviewFinding } from '../resolve.js';
import { _setGateDepsForTests, TeamGateRefusedError } from '../../team/gate.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { PolicyReader, TeamPolicy } from '../../team/types.js';
import type { Finding, ReviewReport } from '../types.js';

afterEach(() => _setGateDepsForTests());

const HASH = 'a3f4b8c9d1e2f3a4';
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });

function hold(holder: string | null, readPolicy: PolicyReader = team): void {
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: holder }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({ readPolicy, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7' });
}

const finding = (over: Partial<Finding>): Finding => ({ claimId: 'c', kind: 'inventory', severity: 'MED', premise: 'p', evidence: 'e', action: 'a', fixability: 'manual', ...over });
const report = (findings: Finding[]): ReviewReport => ({ artifact: 'PLAN', stage: 'plan', verdict: 'block', findings, counts: { high: 0, med: 0, low: 0 }, reviewedAt: '', model: 'm' });
const now = (): string => '2026-10-18T00:00:00.000Z';

function setup(): { md: string; json: string; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gate-resolve-'));
	const md = join(dir, 'PLAN-x.md');
	writeFileSync(md, '# Plan\n\n- t1: extend the two exported constants.\n');
	const findings = [
		finding({ claimId: 'apply1', severity: 'HIGH', fixability: 'assisted', proposedFix: { rationale: 'r', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] } }),
		finding({ claimId: 'acc', severity: 'MED' }), finding({ claimId: 'ovr', severity: 'MED' }), finding({ claimId: 'def', severity: 'MED' }),
	];
	const json = writeReviewedHead(dir, `PLAN-${HASH}-s1`, {
		meta: { workflow: 'plan', repoPath: dir, epicHash: HASH, storyId: 's1' },
		body: { tasks: [{ id: 't1', desc: 'extend the two exported constants.' }] }, report: report(findings),
	});
	return { md, json, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('resolveReviewFinding with action apply by a non-holder throws TeamGateRefusedError before writing the markdown or the artifact, while accept, override and defer still run', async () => {
	const s = setup();
	try {
		const mdBefore = readFileSync(s.md, 'utf8');
		const jsonBefore = readFileSync(s.json, 'utf8');

		// someone else holds the stage: apply is refused naming them, and nothing is written
		hold('bob');
		await assert.rejects(async () => resolveReviewFinding(s.md, s.json, 'apply1', 'apply', undefined, now), (err: unknown) => err instanceof TeamGateRefusedError && /held by bob/.test(err.reason));
		assert.equal(readFileSync(s.md, 'utf8'), mdBefore, 'the markdown is untouched');
		assert.equal(readFileSync(s.json, 'utf8'), jsonBefore, 'the artifact is untouched');

		// accept, override and defer only record a decision: they still run for a non-holder
		for (const [id, action] of [['acc', 'accept'], ['ovr', 'override'], ['def', 'defer']] as const) {
			await assert.doesNotReject(async () => resolveReviewFinding(s.md, s.json, id, action, 'noted', now), action as unknown as string);
		}
		assert.deepEqual(Object.keys(readReviewRecordOf(s.json)?.resolutions ?? {}).sort(), ['acc', 'def', 'ovr']);
		const meta = JSON.parse(readFileSync(s.json, 'utf8')).meta;
		assert.equal(meta.revision, 1, 'a decision is an entry of the log: the head and its revision are unchanged');
		assert.equal(readFileSync(s.md, 'utf8'), mdBefore);

		// the holder applies; so does a repo with no policy
		hold('alice');
		assert.equal((await resolveReviewFinding(s.md, s.json, 'apply1', 'apply', undefined, now)).status, 'resolved');
		assert.match(readFileSync(s.md, 'utf8'), /three exported constants/);
		assert.equal(JSON.parse(readFileSync(s.json, 'utf8')).meta.revision, 2, 'applying the edit is a content change');
	} finally { s.cleanup(); }

	const free = setup();
	try {
		hold('bob', () => ({ ok: true, value: 'none' }));
		assert.equal((await resolveReviewFinding(free.md, free.json, 'apply1', 'apply', undefined, now)).status, 'resolved', 'no policy: applies as before');
	} finally { free.cleanup(); }
});
