import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ghRunViewTool } from '../actions.js';
import { ghAuthTool, ghRulesetTool } from '../account.js';
import { ghPrDiffTool } from '../pr.js';
import { installFakeGh } from './_fakegh.js';
import { depsWith as deps, providers } from './_providers.js';

const RUN_JSON = JSON.stringify({ jobs: [{ name: 'build', status: 'completed', conclusion: 'failure' }], status: 'completed', conclusion: 'failure', workflowName: 'ci', headBranch: 'main' });
const DIFF = 'diff --git a/src/a.ts b/src/a.ts\n+one\ndiff --git a/src/b.ts b/src/b.ts\n+two\n';
const LOG = 'build\tCompile\t2026-01-01 error\ntest\tRun tests\t2026-01-01 failed\n';

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

test('gh-convert-text.test.ts: auth status and ruleset list keyValues are checked against the raw text', async () => {
	const AUTH = 'github.com\n  \u2713 Logged in to github.com account octocat (keyring)\n  - Active account: true\n';
	const RULES = 'ID  NAME\n123 main protection\n456 release rules\n';
	const gh = installFakeGh('ok', AUTH);
	try {
		// auth status: host and login must occur in the text
		const good = providers({ hosts: [{ host: 'github.com', login: 'octocat', active: true, state: 'logged-in' }] });
		const a = await ghAuthTool.execute({ op: 'status' }, deps(good.conversion));
		assert.equal(a.success, true, a.output);
		assert.deepEqual(a.data, { op: 'status', hosts: [{ host: 'github.com', login: 'octocat', active: true, state: 'logged-in' }] });
		const badHost = providers({ hosts: [{ host: 'github.com', login: 'someone-else', active: true, state: 'logged-in' }] });
		const f = await ghAuthTool.execute({ op: 'status' }, deps(badHost.conversion));
		assert.equal(f.success, false);
		assert.equal(f.failure?.kind, 'conversion-failed');
		assert.equal(f.failure?.original, AUTH);
		assert.ok(badHost.calls.length >= 2, 'the cheap tier retried and the escalated tier was tried');
		// the answer is data, so without a conversion provider the call fails rather than returning no hosts
		const none = await ghAuthTool.execute({ op: 'status' }, deps());
		assert.equal(none.success, false);
		assert.equal(none.failure?.kind, 'conversion-failed');
	} finally { gh.restore(); }
	const gh2 = installFakeGh('ok', RULES);
	try {
		// ruleset list: every id and name must occur in the text
		const good = providers({ items: [{ id: '123', name: 'main protection' }, { id: '456', name: 'release rules' }] });
		const r = await ghRulesetTool.execute({ op: 'list' }, deps(good.conversion));
		assert.equal(r.success, true, r.output);
		assert.deepEqual(r.data, { op: 'list', count: 2, items: [{ id: '123', name: 'main protection' }, { id: '456', name: 'release rules' }] });
		const made = providers({ items: [{ id: '999', name: 'main protection' }] });
		const f = await ghRulesetTool.execute({ op: 'list' }, deps(made.conversion));
		assert.equal(f.success, false);
		assert.equal(f.failure?.kind, 'conversion-failed');
		assert.equal(f.failure?.original, RULES);
		const noName = providers({ items: [{ id: '123', name: 'invented name' }] });
		assert.equal((await ghRulesetTool.execute({ op: 'list' }, deps(noName.conversion))).failure?.kind, 'conversion-failed');
	} finally { gh2.restore(); }
});
