import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ConversionProviders, ToolDeps } from '../../../types.js';
import { ghRunViewTool } from '../actions.js';
import { ghPrDiffTool } from '../pr.js';
import { installFakeGh } from './_fakegh.js';

const RUN_JSON = JSON.stringify({ jobs: [{ name: 'build', status: 'completed', conclusion: 'failure' }], status: 'completed', conclusion: 'failure', workflowName: 'ci', headBranch: 'main' });
const DIFF = 'diff --git a/src/a.ts b/src/a.ts\n+one\ndiff --git a/src/b.ts b/src/b.ts\n+two\n';
const LOG = 'build\tCompile\t2026-01-01 error\ntest\tRun tests\t2026-01-01 failed\n';

/** Providers whose answer is scripted per call; `calls` records the prompts. */
function providers(answer: unknown): { conversion: ConversionProviders; calls: string[] } {
	const calls: string[] = [];
	const conversion: ConversionProviders = {
		resolveProvider: () => ({
			async completeStructured(messages: Array<{ content: unknown }>) { calls.push(String(messages[0]?.content)); return answer; },
		}) as never,
	};
	return { conversion, calls };
}
const deps = (conversion?: ConversionProviders): ToolDeps => ({ sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, ...(conversion ? { conversion } : {}) });

test('gh-convert-text.test.ts: gh_pr_diff and gh_run_view conversions cross-check against the raw text and a failed cross-check gives conversion-failed with the raw text in failure.original', async () => {
	const gh = installFakeGh('ok', DIFF, { stdout: LOG, json: RUN_JSON });
	try {
		// a conversion whose values are in the raw text is accepted and shown
		const good = providers({ files: ['src/a.ts', 'src/b.ts'] });
		const d = await ghPrDiffTool.execute({ number: 3 }, deps(good.conversion));
		assert.equal(d.success, true, d.output);
		assert.match(d.output, /Files \(2\): `src\/a.ts`, `src\/b.ts`/);
		assert.deepEqual(Object.keys(d.data as object).sort(), ['diffBytes', 'number', 'truncated']);
		assert.equal(good.calls.length, 1);

		const goodLog = providers({ steps: [{ job: 'build', step: 'Compile' }, { job: 'test', step: 'Run tests' }] });
		const v = await ghRunViewTool.execute({ runId: 9 }, deps(goodLog.conversion));
		assert.equal(v.success, true, v.output);
		assert.match(v.output, /## Steps in the log \(2\)/);

		// a value that is not in the raw text fails the cross-check, after the one escalation, with the raw text kept
		const bad = providers({ files: ['src/made-up.ts'] });
		const f = await ghPrDiffTool.execute({ number: 3 }, deps(bad.conversion));
		assert.equal(f.success, false);
		assert.equal(f.failure?.kind, 'conversion-failed');
		assert.equal(f.failure?.original, DIFF.replace(/\n+$/, ''));
		assert.ok(bad.calls.length >= 2, 'the cheap tier retried and the escalated tier was tried');

		const badLog = providers({ steps: [{ job: 'ghost', step: 'Nothing' }] });
		const g = await ghRunViewTool.execute({ runId: 9 }, deps(badLog.conversion));
		assert.equal(g.success, false);
		assert.equal(g.failure?.kind, 'conversion-failed');
		assert.equal(g.failure?.original, LOG);

		// without a conversion provider the read still answers with the raw text
		const raw = await ghPrDiffTool.execute({ number: 3 }, deps());
		assert.equal(raw.success, true);
		assert.match(raw.output, /diff --git a\/src\/a.ts/);
	} finally { gh.restore(); }
});
