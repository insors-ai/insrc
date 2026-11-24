/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f9d4ab4c90c0b4c s1/t3 tool-boundary test: `gh_issue_edit` driven
 * through the typed tool executor with a stubbed `gh` asserts the SINGULAR
 * `--add-label` argv mapping (src/daemon/tools/builtins/gh/issue.ts: the
 * `addLabels` array joins to one `--add-label "a,b"` argument). The plural
 * `--add-labels` is rejected by the installed gh CLI, so the argv must never
 * contain it. This is a tool-boundary assertion, not a prompt-string one.
 *
 * Run: npx tsx --test src/workflow/runners/tracker/__tests__/gh-issue-edit-add-label.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { ghIssueEditTool } from '../../../../daemon/tools/builtins/gh/issue.js';
import { executeTool, _setApprovalGateForTests } from '../../../../daemon/tools/executor.js';
import { _resetRegistryForTests, registerTool } from '../../../../daemon/tools/registry.js';
import { installStandInBin, toolDeps } from '../../../../daemon/tools/__tests__/_bin.js';
import { rmSync } from 'node:fs';
import type { ApprovalGate } from '../../../../daemon/tools/types.js';

const approve: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'approve' as const }; } };

afterEach(() => { _setApprovalGateForTests(undefined); _resetRegistryForTests(); });

test('gh_issue_edit through the typed tool executor with a stubbed gh asserts the singular --add-label argv mapping (issue.ts:234/273) — tool-boundary, not prompt-string', async () => {
	_resetRegistryForTests();
	registerTool(ghIssueEditTool);
	_setApprovalGateForTests(() => approve);

	const bin = installStandInBin('gh', 'echo "{}"\nexit 0');
	try {
		const r = await executeTool('gh_issue_edit', {
			repo: 'acme/demo',
			number: 42,
			addLabels: ['insrc:epic', 'epic:issue-item'],
		}, toolDeps([]));
		assert.equal(r.success, true, JSON.stringify(r));

		const calls = bin.calls();
		assert.equal(calls.length, 1, calls.join(' | '));
		const argv = calls[0]!;
		assert.match(argv, /^issue edit 42 /, argv);
		assert.ok(argv.includes('--add-label insrc:epic,epic:issue-item'), `singular --add-label with CSV: ${argv}`);
		assert.ok(!argv.includes('--add-labels'), `plural --add-labels must never appear: ${argv}`);
		// exactly one --add-label occurrence
		assert.equal(argv.split('--add-label').length - 1, 1, argv);
	} finally {
		bin.restore();
		rmSync(bin.dir, { recursive: true, force: true });
	}
});
