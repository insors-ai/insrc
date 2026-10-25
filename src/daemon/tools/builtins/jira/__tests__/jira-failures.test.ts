import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACLI_UNKNOWN_OUTCOME, acliExec, jiraFailureOf } from '../exec.js';
import type { AcliOutcome } from '../exec.js';
import { installFakeAcli } from './_fakeacli.js';

const base: AcliOutcome = { stdout: '', stderr: '', code: 1, spawnError: false, timedOut: false, stdoutTruncated: false, stderrOverflow: false, aborted: false, limitMs: 30_000, command: 'acli jira workitem view IN-1' };
const out = (over: Partial<AcliOutcome>): AcliOutcome => ({ ...base, ...over });

test('jira-failures.test.ts: jiraFailureOf precedence and the probe rules', () => {
  const read = { mutating: false };
  const change = { mutating: true };
  assert.equal(jiraFailureOf(out({ code: 0 }), read), undefined);
  // not installed: a spawn failure or exit 127, before anything else
  assert.equal(jiraFailureOf(out({ spawnError: true, code: null, timedOut: true }), read)?.kind, 'missing-tool');
  assert.equal(jiraFailureOf(out({ code: 127, stderr: 'sh: acli: not found' }), read)?.message, 'acli is not installed (not found on PATH)');
  // time-out says the outcome is unknown for a changing op, and only for it
  const t = jiraFailureOf(out({ timedOut: true, code: null }), change);
  assert.equal(t?.kind, 'timed-out');
  assert.match(t?.message ?? '', /outcome is unknown/);
  assert.doesNotMatch(jiraFailureOf(out({ timedOut: true, code: null }), read)?.message ?? '', /unknown/);
  // precedence: time-out before abort before signal before overflow before a cut before the exit code
  assert.equal(jiraFailureOf(out({ timedOut: true, aborted: true, stdoutTruncated: true }), read)?.kind, 'timed-out');
  assert.match(jiraFailureOf(out({ aborted: true, code: null, stdoutTruncated: true }), read)?.message ?? '', /aborted/);
  assert.match(jiraFailureOf(out({ code: null, signal: 'SIGKILL', stderrOverflow: true }), read)?.message ?? '', /SIGKILL/);
  assert.match(jiraFailureOf(out({ stderrOverflow: true, stdoutTruncated: true }), read)?.message ?? '', /error output/);
  const cut = jiraFailureOf(out({ code: 0, stdoutTruncated: true }), read);
  assert.equal(cut?.kind, 'rejected');
  assert.match(cut?.message ?? '', /cut at the capture cap/);
  // a known rejection is rejected, never missing-signin, and carries acli's text
  const rej = jiraFailureOf(out({ stderr: '✗ Error: Issue does not exist or you do not have permission to see it.' }), change);
  assert.equal(rej?.kind, 'rejected');
  assert.match(rej?.message ?? '', /Issue does not exist/);
  assert.match(rej?.message ?? '', new RegExp(ACLI_UNKNOWN_OUTCOME));
  // acli's own unauthorized text is positive evidence
  assert.equal(jiraFailureOf(out({ stderr: '✗ Error: unauthorized: use acli jira auth login to authenticate' }), read)?.kind, 'missing-signin');
  // an unexplained failure: only a completed probe that says unauthorized gives missing-signin
  const generic = { stderr: '✗ Error: failed to fetch work item details' };
  assert.equal(jiraFailureOf(out(generic), read)?.kind, 'rejected');
  const signedOut = { code: 1, completed: true, output: '✗ Error: unauthorized: use acli jira auth login' };
  const f = jiraFailureOf(out({ ...generic, probe: signedOut }), read);
  assert.equal(f?.kind, 'missing-signin');
  assert.match(f?.message ?? '', /sign in with acli jira auth login outside the daemon/);
  // a probe that did not complete, or that failed on the network, never gives missing-signin
  assert.equal(jiraFailureOf(out({ ...generic, probe: { ...signedOut, completed: false } }), read)?.kind, 'rejected');
  assert.equal(jiraFailureOf(out({ ...generic, probe: { code: 1, completed: true, output: 'dial tcp: lookup x: no such host' } }), read)?.kind, 'unreachable');
  assert.equal(jiraFailureOf(out({ ...generic, probe: { code: 1, completed: true, output: 'unauthorized (dial tcp: no such host)' } }), read)?.kind, 'unreachable');
  assert.equal(jiraFailureOf(out({ ...generic, probe: { code: 0, completed: true, output: '✓ Authenticated' } }), read)?.kind, 'rejected');
  // network text in the command's own output
  assert.equal(jiraFailureOf(out({ stderr: 'dial tcp: lookup example.atlassian.net: no such host' }), read)?.kind, 'unreachable');
  // no message asks for a credential
  for (const x of [f, rej, t]) { assert.doesNotMatch(x?.message ?? '', /password|token|api key/i); }
});

test('jira-failures.test.ts: not installed, not signed in, network probe, time-out and truncated output through a fake acli', async () => {
  const run = (limitMs = 20_000, maxBytes?: number) => acliExec(['acli', 'jira', 'workitem', 'view', 'IN-1'], { limitMs, maxBytes });
  // not installed: no acli on PATH at all
  const savedPath = process.env['PATH'];
  process.env['PATH'] = '/nonexistent-dir';
  try {
    const o = await run();
    assert.equal(jiraFailureOf(o, { mutating: false })?.kind, 'missing-tool');
  } finally { process.env['PATH'] = savedPath; }

  // exit 127 from a wrapper
  let fake = installFakeAcli('exit127');
  try { assert.equal(jiraFailureOf(await run(), { mutating: false })?.kind, 'missing-tool'); } finally { fake.restore(); }

  // an unexplained failure, then the probe says unauthorized: not signed in, and the probe ran once
  fake = installFakeAcli('fail-generic', { probe: 'unauthorized' });
  try {
    const o = await run();
    assert.equal(jiraFailureOf(o, { mutating: false })?.kind, 'missing-signin');
    assert.equal(fake.calls().filter(c => c.startsWith('jira auth status')).length, 1);
  } finally { fake.restore(); }

  // the probe answers signed in: the failure is just rejected
  fake = installFakeAcli('fail-generic', { probe: 'ok' });
  try { assert.equal(jiraFailureOf(await run(), { mutating: false })?.kind, 'rejected'); } finally { fake.restore(); }

  // the probe fails on the network: never missing-signin
  fake = installFakeAcli('fail-generic', { probe: 'network' });
  try { assert.equal(jiraFailureOf(await run(), { mutating: false })?.kind, 'unreachable'); } finally { fake.restore(); }

  // a known rejection runs no probe
  fake = installFakeAcli('fail-reject', { probe: 'unauthorized' });
  try {
    const f = jiraFailureOf(await run(), { mutating: true });
    assert.equal(f?.kind, 'rejected');
    assert.equal(fake.calls().filter(c => c.startsWith('jira auth status')).length, 0);
  } finally { fake.restore(); }

  // acli's own unauthorized text
  fake = installFakeAcli('fail-unauthorized');
  try { assert.equal(jiraFailureOf(await run(), { mutating: false })?.kind, 'missing-signin'); } finally { fake.restore(); }

  // network failure of the command itself
  fake = installFakeAcli('fail-network');
  try { assert.equal(jiraFailureOf(await run(), { mutating: false })?.kind, 'unreachable'); } finally { fake.restore(); }

  // time-out
  fake = installFakeAcli('sleep');
  try {
    const f = jiraFailureOf(await run(300), { mutating: true });
    assert.equal(f?.kind, 'timed-out');
    assert.match(f?.message ?? '', /outcome is unknown/);
  } finally { fake.restore(); }

  // an output cut at the capture cap is a failure, not a partial answer
  fake = installFakeAcli('big');
  try {
    const f = jiraFailureOf(await run(20_000, 1000), { mutating: false });
    assert.equal(f?.kind, 'rejected');
    assert.match(f?.message ?? '', /cut at the capture cap/);
  } finally { fake.restore(); }

  // a clean run keeps stdout and has no failure; standard input is closed (acli never waits on it)
  fake = installFakeAcli('ok', { stdout: '{"ok":true}' });
  try {
    const o = await run();
    assert.equal(jiraFailureOf(o, { mutating: false }), undefined);
    assert.equal(o.stdout.trim(), '{"ok":true}');
    assert.equal(o.probe, undefined);
  } finally { fake.restore(); }
});
