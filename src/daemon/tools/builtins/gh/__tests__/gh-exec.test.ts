import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ghExec } from '../helpers.js';
import { installFakeGh } from './_fakegh.js';

test('gh-exec.test.ts: ghExec runs through runShellBytes, keeps input out of argv and returns the limit applied and the probe result', async () => {
	let fake = installFakeGh('stdin');
	try {
		const secret = 'tok-12345-secret';
		const out = await ghExec(['gh', 'secret', 'set', 'NAME'], { key: { toolId: 'gh_secret', op: 'set', mutating: true }, input: secret });
		assert.equal(out.code, 0);
		assert.equal(out.limitMs, 60_000);
		assert.equal(out.command, 'gh secret set NAME');
		assert.ok(!fake.calls().join('\n').includes(secret), 'the input must not be in argv');
		assert.equal(fake.stdin(), secret);
		assert.equal(out.stdinError, undefined);
		assert.equal(out.probe, undefined);
	} finally { fake.restore(); }

	fake = installFakeGh('multibyte');
	try {
		const out = await ghExec(['gh', 'x'], { key: { toolId: 'gh_pr_diff' }, maxBytes: 6 });
		assert.equal(out.stdoutTruncated, true);
		assert.equal(out.stdout, 'aaaaé');      // 4 + 2 bytes fits; the next character is cut away whole
		assert.equal(out.limitMs, 60_000);
	} finally { fake.restore(); }

	fake = installFakeGh('fail403');
	try {
		const out = await ghExec(['gh', 'issue', 'list'], { key: { toolId: 'gh_issue_list' }, hostname: 'github.com' });
		assert.equal(out.code, 1);
		assert.ok(out.probe, 'ambiguous failure text triggers one sign-in probe');
		assert.equal(out.probe.code, 0);
		assert.match(out.probe.output, /logged in/);
		assert.deepEqual(fake.calls().filter(c => c.startsWith('auth')), ['auth status --hostname github.com']);
	} finally { fake.restore(); }

	fake = installFakeGh('fail404');
	try {
		const out = await ghExec(['gh', 'issue', 'view', '1'], { key: { toolId: 'gh_issue_view' } });
		assert.equal(out.code, 1);
		assert.equal(out.probe, undefined, 'clear failure text makes no probe');
	} finally { fake.restore(); }
});

