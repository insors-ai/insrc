import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ghRunViewTool } from '../actions.js';
import { installFakeGh } from './_fakegh.js';
import { GH_UNKNOWN_OUTCOME, ghFailureOf, type GhOutcome } from '../helpers.js';

function outcome(over: Partial<GhOutcome> = {}): GhOutcome {
	return {
		stdout: '', stderr: '', code: 0, spawnError: false, timedOut: false, stdoutTruncated: false, stderrOverflow: false,
		aborted: false, limitMs: 30_000, command: 'gh issue list', cutIsAnswer: false, ...over,
	};
}

test('gh-failures.test.ts: the one precedence timedOut, aborted, signal, stdinError, stderrOverflow, unmarked cut, non-zero exit, pinned by paired-flag fixtures', () => {
	const kindsAndText = (o: GhOutcome) => { const f = ghFailureOf(o, { mutating: false }); return `${f?.kind}|${f?.message}`; };
	// time-out beats abort
	assert.match(kindsAndText(outcome({ timedOut: true, aborted: true, code: null })), /^timed-out\|gh issue list timed out after 30 s$/);
	// abort beats signal
	assert.match(kindsAndText(outcome({ aborted: true, signal: 'SIGKILL', code: null })), /^rejected\|gh issue list was aborted$/);
	// signal beats stdin error, even when the stdin error is also set
	assert.match(kindsAndText(outcome({ signal: 'SIGKILL', code: null, stdinError: 'EPIPE' })), /ended on signal SIGKILL/);
	// stdin error beats stderr overflow
	assert.match(kindsAndText(outcome({ stdinError: 'EPIPE', stderrOverflow: true, code: 1 })), /standard input failed/);
	// stderr overflow beats an unmarked cut and a non-zero exit
	assert.match(kindsAndText(outcome({ stderrOverflow: true, stdoutTruncated: true, code: 1 })), /error output passed the capture cap/);
	// an unmarked cut beats a non-zero exit
	assert.match(kindsAndText(outcome({ stdoutTruncated: true, code: 1, stderr: 'label already exists' })), /^rejected\|.*cut at the capture cap/);
	// an unmarked cut is a failure even at exit 0; a marked cut is the answer
	assert.match(kindsAndText(outcome({ stdoutTruncated: true })), /^rejected\|.*cut at the capture cap/);
	assert.equal(ghFailureOf(outcome({ stdoutTruncated: true, cutIsAnswer: true }), { mutating: false }), undefined);
	// a stdin error is a failure at exit 0
	assert.equal(ghFailureOf(outcome({ stdinError: 'EPIPE' }), { mutating: false })?.kind, 'rejected');
	// a spawn error comes first of all
	assert.equal(ghFailureOf(outcome({ spawnError: true, timedOut: true, code: null }), { mutating: false })?.kind, 'missing-tool');
	// a clean outcome has no failure
	assert.equal(ghFailureOf(outcome(), { mutating: true }), undefined);
});

test('gh-failures.test.ts: a signal-only termination is rejected for a read and carries the unknown-outcome sentence for a mutating call', () => {
	const o = outcome({ code: null, signal: 'SIGTERM' });
	const read = ghFailureOf(o, { mutating: false });
	assert.equal(read?.kind, 'rejected');
	assert.ok(!read?.message.includes(GH_UNKNOWN_OUTCOME));
	const write = ghFailureOf(o, { mutating: true });
	assert.equal(write?.kind, 'rejected');
	assert.ok(write?.message.includes(GH_UNKNOWN_OUTCOME));
	for (const o2 of [outcome({ timedOut: true, code: null }), outcome({ aborted: true, code: null }), outcome({ stdinError: 'EPIPE' }), outcome({ stderrOverflow: true, code: 1 })]) {
		const m = ghFailureOf(o2, { mutating: true })?.message ?? '';
		assert.ok(m.includes(GH_UNKNOWN_OUTCOME), m);
		assert.ok(!/not set|nothing changed/i.test(m), m);
	}
	// a cut capture and a network failure of a mutating call also say the outcome is unknown
	assert.ok(ghFailureOf(outcome({ stdoutTruncated: true }), { mutating: true })?.message.includes(GH_UNKNOWN_OUTCOME));
	assert.ok(ghFailureOf(outcome({ code: 1, stderr: 'dial tcp: lookup api.github.com: no such host' }), { mutating: true })?.message.includes(GH_UNKNOWN_OUTCOME));
	assert.ok(!ghFailureOf(outcome({ stdoutTruncated: true }), { mutating: false })?.message.includes(GH_UNKNOWN_OUTCOME));
	// a plain non-zero exit keeps gh's own text; a mutating call adds the sentence, a read does not
	const plain = ghFailureOf(outcome({ code: 1, stderr: 'label already exists\n' }), { mutating: true });
	assert.equal(plain?.kind, 'rejected');
	assert.equal(plain?.message, `label already exists; ${GH_UNKNOWN_OUTCOME}`);
	assert.equal(ghFailureOf(outcome({ code: 1, stderr: 'label already exists\n' }), { mutating: false })?.message, 'label already exists');
	assert.ok(ghFailureOf(outcome({ code: 4, stderr: 'gh auth login' }), { mutating: true })?.message.includes(GH_UNKNOWN_OUTCOME));
});

test('gh-failures.test.ts: spawn error, authentication text, probe-only authentication text, ambiguous failure with a clean probe and network text map to missing-tool, missing-signin, missing-signin, rejected and unreachable', () => {
	assert.equal(ghFailureOf(outcome({ spawnError: true, code: null, stderr: '[spawn] ENOENT' }), { mutating: false })?.kind, 'missing-tool');
	assert.equal(ghFailureOf(outcome({ code: 4, stderr: 'To get started with GitHub CLI, please run:  gh auth login' }), { mutating: false })?.kind, 'missing-signin');
	const probeOnly = ghFailureOf(outcome({ code: 1, stderr: 'HTTP 403: forbidden', probe: { code: 1, output: 'You are not logged in to any GitHub hosts' } }), { mutating: false });
	assert.equal(probeOnly?.kind, 'missing-signin');
	assert.match(probeOnly?.original ?? '', /not logged in/);
	const clean = ghFailureOf(outcome({ code: 1, stderr: 'HTTP 403: forbidden', probe: { code: 0, output: 'Logged in to github.com' } }), { mutating: false });
	assert.equal(clean?.kind, 'rejected');
	assert.match(clean?.original ?? '', /Logged in/);
	// a probe that failed without authentication evidence stays rejected
	assert.equal(ghFailureOf(outcome({ code: 1, stderr: 'HTTP 403: forbidden', probe: { code: 1, output: 'unexpected error' } }), { mutating: false })?.kind, 'rejected');
	assert.equal(ghFailureOf(outcome({ code: 1, stderr: 'dial tcp: lookup api.github.com: no such host' }), { mutating: false })?.kind, 'unreachable');
	assert.equal(ghFailureOf(outcome({ code: 1, stderr: 'HTTP 403', probe: { code: 1, output: 'could not resolve host' } }), { mutating: false })?.kind, 'unreachable');
});

test('gh-failures.test.ts: a failed gh run view log command fails the call with stderr in error', async () => {
	const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
	const gh = installFakeGh('ok', undefined, { json: JSON.stringify({ jobs: [{ name: 'build' }], status: 'completed', conclusion: 'failure' }), fail: 'log not found: run expired' });
	try {
		const r = await ghRunViewTool.execute({ runId: 9 }, deps);
		assert.equal(r.success, false);
		assert.equal(r.error, 'log not found: run expired');
		assert.equal(r.output, '[gh_run_view] log not found: run expired');
		assert.equal(r.failure?.kind, 'rejected');
		assert.equal(r.data, undefined);
	} finally { gh.restore(); }
});
