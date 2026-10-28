/**
 * The invariants Story s10 rests on (epic constraints k2 to k5), each with a named check against the code.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/s10-invariants.test.ts
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { callTool } from '../../../daemon/tools/call-tool.js';
import { gitPushTool } from '../../../daemon/tools/builtins/git/push.js';
import { ghIssueListTool } from '../../../daemon/tools/builtins/gh/issue.js';
import { _setApprovalGateForTests } from '../../../daemon/tools/executor.js';
import { _resetRegistryForTests, registerTool } from '../../../daemon/tools/registry.js';
import { installStandInBin } from '../../../daemon/tools/__tests__/_bin.js';
import type { StandInBin } from '../../../daemon/tools/__tests__/_bin.js';
import { cleanup } from '../../../daemon/tools/__tests__/_proc.js';
import { GhCommandError } from '../github.js';
import { createRegistryTable, workflowToolDeps } from '../registry-table.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');
let bin: StandInBin | undefined;
afterEach(() => { _setApprovalGateForTests(undefined); bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; });

describe('s10-invariants.test.ts: each invariant resting on k2 to k5 has a named check that passes', () => {
	it('k2: a schema failure is never passed on as a value, even by a row that swallows gh failures', async () => {
		_resetRegistryForTests(); registerTool(ghIssueListTool);
		const dir = mkdtempSync(join(tmpdir(), 'insrc-inv-'));
		try {
			// the issue list answers a number as a string: the output schema check fails
			bin = installStandInBin('gh', 'echo \'[{"number":"12","title":"t","state":"OPEN"}]\'');
			await assert.rejects(createRegistryTable(workflowToolDeps(dir)).ghFindIssueByLabels('o', 'r', ['a']), (e: unknown) => e instanceof GhCommandError && e.kind === 'rejected');
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});

	it('k3: the terminal reaches the daemon only through IPC: its services import no daemon internals, store or tracker code', () => {
		for (const file of ['cli/services/workflow.ts', 'cli/services/team.ts']) {
			const imports = [...read(file).matchAll(/^import (type )?[^;]*?from '([^']+)';/gms)].filter(m => m[1] === undefined).map(m => m[2]!);
			const forbidden = imports.filter(i => /(\/db\/|daemon\/(handler-runtime|approve-pipeline|tasks-sync|workflow-approve|team-review-handlers)|workflow\/tracker\/|tracker-auto|team\/gate|lmdb|lancedb)/.test(i));
			assert.deepEqual(forbidden, [], `${file} reaches daemon internals`);
		}
	});

	it('k4: a destructive call with no client attached is denied, not run', async () => {
		_resetRegistryForTests(); registerTool(gitPushTool);
		const dir = mkdtempSync(join(tmpdir(), 'insrc-inv-push-'));
		try {
			_setApprovalGateForTests(undefined);   // the default gate: no client is attached to answer
			const r = await callTool(gitPushTool, { cwd: dir, remote: 'origin', ref: 'main', force: true }, workflowToolDeps(dir, { approvalMode: 'auto' }));
			assert.equal(r.success, false);
			assert.ok(!r.success && r.error.kind === 'denied' && r.error.denial === 'no-client', JSON.stringify(r));
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});

	it('k5: provider-reaching code awaits serially: the new pipeline, table and handler modules start no calls together', () => {
		for (const file of ['workflow/tracker/registry-table.ts', 'workflow/tracker/github-adapter.ts', 'workflow/tracker/commit-and-push-registry.ts', 'workflow/tracker/setup.ts', 'workflow/tracker/sync.ts',
			'daemon/approve-pipeline.ts', 'daemon/tasks-sync.ts', 'daemon/team-review-handlers.ts', 'daemon/tracker-setup-handlers.ts', 'cli/services/workflow.ts', 'cli/services/team.ts']) {
			assert.ok(!/Promise\.(?:all|allSettled|race|any)\(/.test(read(file)), `${file} runs promises together`);
		}
	});
});
