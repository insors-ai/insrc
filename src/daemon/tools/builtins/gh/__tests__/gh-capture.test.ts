import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ghPrDiffTool } from '../pr.js';
import { ghRunViewTool } from '../actions.js';
import { bytesToText } from '../helpers.js';
import { Value } from '@sinclair/typebox/value';
import { installFakeGh } from './_fakegh.js';

const RUN_JSON = JSON.stringify({ jobs: [{ name: 'build', status: 'completed', conclusion: 'failure' }], status: 'completed', conclusion: 'failure', workflowName: 'ci', headBranch: 'main' });
const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };

test('gh-capture.test.ts: byte-to-text adapter decodes with replacement and stays valid text when a cut crosses a multibyte character', () => {
	const full = new TextEncoder().encode('abé€');       // 2 + 2 + 3 bytes
	// cut inside the euro sign: the incomplete tail is dropped, not turned into a replacement character
	const cutThree = bytesToText(full.subarray(0, 5), true);
	assert.equal(cutThree, 'abé');
	const cutOne = bytesToText(full.subarray(0, 3), true);
	assert.equal(cutOne, 'ab');
	// a complete cut keeps everything
	assert.equal(bytesToText(full, true), 'abé€');
	// invalid bytes decode as the replacement character and the result is a valid string
	assert.equal(bytesToText(new Uint8Array([0x61, 0xFF, 0x62]), false), 'a�b');
	assert.equal(bytesToText(new Uint8Array(0), true), '');
});

test('gh-capture.test.ts: gh_pr_diff and gh_run_view cut at the cap are successes with truncated true and valid text', async () => {
	// 1200 bytes of two-byte characters; an odd cap lands inside a character
	const big = 'é'.repeat(600);
	const gh = installFakeGh('ok', `diff --git a/x b/x\n+${big}\n`, { stdout: `job\tstep\t2026 ${big}\n`, json: RUN_JSON });
	try {
		const d = await ghPrDiffTool.execute({ number: 3, maxBytes: 1025 }, deps);
		assert.equal(d.success, true, d.output);
		assert.deepEqual(d.data, { number: 3, diffBytes: (d.data as { diffBytes: number }).diffBytes, truncated: true });
		assert.ok((d.data as { diffBytes: number }).diffBytes <= 1025);
		assert.ok(!d.output.includes('\uFFFD'), 'the cut does not leave a replacement character');
		assert.match(d.output, /truncated at 1025 bytes/);

		const small = await ghPrDiffTool.execute({ number: 3 }, deps);
		assert.equal((small.data as { truncated: boolean }).truncated, false);

		const v = await ghRunViewTool.execute({ runId: 9, maxLogBytes: 1025 }, deps);
		assert.equal(v.success, true, v.output);
		assert.equal((v.data as { truncated: boolean }).truncated, true);
		assert.equal((v.data as { runId: number }).runId, 9);
		assert.ok(Value.Check(ghRunViewTool.outputSchema, v.data), 'gh_run_view data fits its output schema');
		assert.ok(Value.Check(ghPrDiffTool.outputSchema, d.data), 'gh_pr_diff data fits its output schema');
		assert.ok(!v.output.includes('\uFFFD'));
		assert.match(v.output, /truncated @ 1025 bytes/);
	} finally { gh.restore(); }
});
