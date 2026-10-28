/**
 * Every way an approval can be denied (Story s10) denies a moved call with the matching reason, and the calls after it are not made.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/registry-denial.test.ts
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setApprovalGateForTests } from '../../../daemon/tools/executor.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import type { ApprovalGate } from '../../../daemon/tools/types.js';
import { commitAndPush } from '../commit-and-push-registry.js';
import { _setWorkflowToolDepsForTests } from '../registry-table.js';
import { ToolDenied } from '../tool-denied.js';

let repo: string;
beforeEach(() => {
	_resetRegistryForTests();
	repo = mkdtempSync(join(tmpdir(), 'insrc-regden-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	execFileSync('git', ['config', 'user.email', 'a@b.c'], { cwd: repo });
	execFileSync('git', ['config', 'user.name', 'a'], { cwd: repo });
	_setWorkflowToolDepsForTests({ approvalMode: 'manual' });
});
afterEach(() => { _setApprovalGateForTests(undefined); _setWorkflowToolDepsForTests(); rmSync(repo, { recursive: true, force: true }); });

const commitsIn = (): number => {
	try { return Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { return 0; }
};

describe('registry-denial.test.ts: no-client, declined, timed-out and cancelled approval deny a moved call and later calls are not made', () => {
	const gates: Array<[string, (asked: string[]) => ApprovalGate]> = [
		['declined', asked => ({ async ask(r) { asked.push(r.requestId); return { requestId: r.requestId, decision: 'decline' }; } })],
		['timed-out', asked => ({ async ask(r) { asked.push(r.requestId); return 'timed-out'; } })],
		['no-client', asked => ({ async ask(r) { asked.push(r.requestId); return 'no-client'; } })],
		['cancelled', asked => ({ async ask(r) { asked.push(r.requestId); return 'cancelled'; } })],
	];
	for (const [reason, makeGate] of gates) {
		it(`${reason}: the staging is denied with that reason, nothing is committed and no later call asks`, async () => {
			const asked: string[] = [];
			_setApprovalGateForTests(() => makeGate(asked));
			const file = join(repo, 'a.md');
			writeFileSync(file, 'x');
			await assert.rejects(commitAndPush(repo, [file], 'msg'), (e: unknown) => e instanceof ToolDenied && e.reason === reason && e.detail?.phase === 'stage' && e.detail.committed === false);
			assert.equal(asked.length, 1, 'only the first call asked; the commit and the push were never reached');
			assert.equal(commitsIn(), 0);
		});
	}
});
