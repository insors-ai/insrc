/**
 * Story E20260924b6c90b3e:S003 / t1 — daemon-freshness flow tests.
 *
 * Drives the VS-Code-free runDaemonFreshnessCheck over injected fakes (fake ipc
 * client, fake notify, fake gitLsRemote, fake versionState). No vscode import,
 * no real daemon/git. A fake clock + no-wait sleep keep the reconnect loop
 * deterministic and instantaneous.
 *
 * Run: npx tsx --test vscode-plugin/src/freshness/__tests__/daemon-freshness.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runDaemonFreshnessCheck,
  type DaemonFreshnessDeps,
  type PluginVersionState,
} from '../daemon-freshness.js';
import type { DaemonReachability } from '../../../../src/shared/ipc-client.js';
import type { DaemonStatus, DaemonUpdateResult, DaemonUpdateOutcome } from '../../../../src/shared/types.js';

const INSTALLED = 'a'.repeat(40);
const UPSTREAM = 'b'.repeat(40);

interface ClientScript {
  reachability?: DaemonReachability | (() => Promise<DaemonReachability>);
  installedCommit?: string | (() => string);
  status?: () => Promise<DaemonStatus>;
  update?: () => Promise<DaemonUpdateResult>;
  updateOutcome?: () => Promise<DaemonUpdateOutcome | null>;
}

interface FakeClient {
  status(): Promise<DaemonStatus>;
  reachability(): Promise<DaemonReachability>;
  update(): Promise<DaemonUpdateResult>;
  updateOutcome(): Promise<DaemonUpdateOutcome | null>;
  updateCalls: number;
}

function fakeClient(script: ClientScript): FakeClient {
  const client: FakeClient = {
    updateCalls: 0,
    status: async () => {
      if (script.status) return script.status();
      const commit = typeof script.installedCommit === 'function' ? script.installedCommit() : (script.installedCommit ?? INSTALLED);
      return { uptime: 0, repos: [], queueDepth: 0, embeddingsPending: 0, installedCommit: commit } as DaemonStatus;
    },
    reachability: async () => {
      const r = script.reachability ?? 'running';
      return typeof r === 'function' ? r() : r;
    },
    update: async () => {
      client.updateCalls += 1;
      return script.update ? script.update() : { launched: true };
    },
    updateOutcome: async () => (script.updateOutcome ? script.updateOutcome() : null),
  };
  return client;
}

interface Recorder {
  messages: string[];
  actions: string[][];
}

function fakeNotify(choice?: string): { notify: DaemonFreshnessDeps['notify']; rec: Recorder } {
  const rec: Recorder = { messages: [], actions: [] };
  const notify: DaemonFreshnessDeps['notify'] = async (message, ...actions) => {
    rec.messages.push(message);
    rec.actions.push(actions);
    // The scripted choice only applies to a prompt (actions present).
    return actions.length > 0 ? choice : undefined;
  };
  return { notify, rec };
}

function fakeVersionState(current: string, lastSeen: string | undefined): PluginVersionState & { saved: string[] } {
  const saved: string[] = [];
  return {
    current,
    getLastSeen: () => lastSeen,
    setLastSeen: (v: string) => { saved.push(v); },
    saved,
  };
}

/** A deps builder with an instantaneous reconnect loop (no-wait sleep, fixed clock). */
function deps(
  overrides: Partial<DaemonFreshnessDeps> & { client: DaemonFreshnessDeps['client']; notify: DaemonFreshnessDeps['notify']; versionState: PluginVersionState },
): DaemonFreshnessDeps {
  return {
    gitLsRemote: () => UPSTREAM,
    daemonRoot: '/home/u/.insrc/daemon',
    reconnectBudgetMs: 5_000,
    sleep: async () => {},
    now: () => 1_000, // fixed; loop exits via deadline once probes fail
    ...overrides,
  };
}

// ---- startup-check drift (ac1) ---------------------------------------------

test("startup-check drift: notify shows Update/Dismiss; update() runs ONLY on 'Update'", async () => {
  // After update(), the commit advances → confirm succeeds.
  let commit = INSTALLED;
  const client = fakeClient({ installedCommit: () => commit, update: async () => { commit = UPSTREAM; return { launched: true }; } });
  const { notify, rec } = fakeNotify('Update');
  const versionState = fakeVersionState('1.0.0', '1.0.0'); // current === lastSeen → startup-check
  await runDaemonFreshnessCheck(deps({ client, notify, versionState }));

  assert.deepEqual(rec.actions[0], ['Update', 'Dismiss'], 'the drift prompt offers Update/Dismiss (no modal)');
  assert.equal(client.updateCalls, 1, "update() runs on 'Update'");
  assert.ok(rec.messages.some((m) => /updated successfully/.test(m)), 'a success notify follows');
});

test("startup-check drift: Dismiss (and closed→undefined) does NOT call update()", async () => {
  for (const choice of ['Dismiss', undefined] as const) {
    const client = fakeClient({ installedCommit: INSTALLED });
    const { notify, rec } = fakeNotify(choice);
    const versionState = fakeVersionState('1.0.0', '1.0.0');
    await runDaemonFreshnessCheck(deps({ client, notify, versionState }));
    assert.equal(client.updateCalls, 0, `no update on ${String(choice)}`);
    assert.equal(rec.messages.length, 1, 'only the prompt was shown, no further notify');
    assert.deepEqual(versionState.saved, ['1.0.0'], 'setLastSeen(current) still recorded');
  }
});

// ---- skip paths (ac2) ------------------------------------------------------

test('skip paths: unreachable / installedCommit==="" / up-to-date / ls-remote fail → no notify, no update', async () => {
  // unreachable
  {
    const client = fakeClient({ reachability: 'stopped' });
    const { notify, rec } = fakeNotify();
    const versionState = fakeVersionState('1.0.0', '1.0.0');
    await runDaemonFreshnessCheck(deps({ client, notify, versionState }));
    assert.equal(client.updateCalls, 0);
    assert.equal(rec.messages.length, 0, 'unreachable → nothing shown');
    assert.deepEqual(versionState.saved, ['1.0.0'], 'unreachable still records the version');
  }
  // installedCommit === '' (pre-S002 / non-git root)
  {
    const client = fakeClient({ installedCommit: '' });
    const { notify, rec } = fakeNotify();
    const versionState = fakeVersionState('1.0.0', '1.0.0');
    await runDaemonFreshnessCheck(deps({ client, notify, versionState }));
    assert.equal(client.updateCalls, 0);
    assert.equal(rec.messages.length, 0, "'' installedCommit → undeterminable → skip");
  }
  // up to date (installed === upstream)
  {
    const client = fakeClient({ installedCommit: UPSTREAM });
    const { notify, rec } = fakeNotify();
    const versionState = fakeVersionState('1.0.0', '1.0.0');
    await runDaemonFreshnessCheck(deps({ client, notify, versionState }));
    assert.equal(client.updateCalls, 0);
    assert.equal(rec.messages.length, 0, 'up to date → skip');
  }
  // ls-remote returns '' and ls-remote throws
  for (const gitLsRemote of [() => '', () => { throw new Error('network down'); }] as const) {
    const client = fakeClient({ installedCommit: INSTALLED });
    const { notify, rec } = fakeNotify();
    const versionState = fakeVersionState('1.0.0', '1.0.0');
    await runDaemonFreshnessCheck(deps({ client, notify, versionState, gitLsRemote }));
    assert.equal(client.updateCalls, 0);
    assert.equal(rec.messages.length, 0, 'ls-remote undeterminable → skip');
  }
});

// ---- self-update (ac3) -----------------------------------------------------

test('self-update: current!==lastSeen + drift → update() with NO prompt (notify-after), setLastSeen recorded', async () => {
  let commit = INSTALLED;
  const client = fakeClient({ installedCommit: () => commit, update: async () => { commit = UPSTREAM; return { launched: true }; } });
  const { notify, rec } = fakeNotify();
  const versionState = fakeVersionState('2.0.0', '1.0.0'); // version changed → self-update
  await runDaemonFreshnessCheck(deps({ client, notify, versionState }));

  assert.equal(client.updateCalls, 1, 'auto-updates without a prompt');
  // No prompt was shown (no notify carried actions); only the after-notify.
  assert.ok(rec.actions.every((a) => a.length === 0), 'no Update/Dismiss prompt in self-update mode');
  assert.ok(rec.messages.some((m) => /updated successfully/.test(m)), 'notify-after on success');
  assert.deepEqual(versionState.saved, ['2.0.0'], 'setLastSeen(current) recorded');
});

test('first-ever activation (lastSeen undefined) is treated as self-update when there is drift', async () => {
  let commit = INSTALLED;
  const client = fakeClient({ installedCommit: () => commit, update: async () => { commit = UPSTREAM; return { launched: true }; } });
  const { notify, rec } = fakeNotify();
  const versionState = fakeVersionState('1.0.0', undefined);
  await runDaemonFreshnessCheck(deps({ client, notify, versionState }));
  assert.equal(client.updateCalls, 1, 'first activation with drift auto-updates');
  assert.ok(rec.actions.every((a) => a.length === 0), 'no prompt on first activation');
});

test('self-update mode but daemon already up to date → no update, no notify, still setLastSeen (fire-once, k4)', async () => {
  const client = fakeClient({ installedCommit: UPSTREAM }); // installed === upstream
  const { notify, rec } = fakeNotify();
  const versionState = fakeVersionState('2.0.0', '1.0.0'); // version changed, but nothing to update
  await runDaemonFreshnessCheck(deps({ client, notify, versionState }));
  assert.equal(client.updateCalls, 0, 'nothing to update');
  assert.equal(rec.messages.length, 0, 'no notification when already current');
  assert.deepEqual(versionState.saved, ['2.0.0'], 'still records the version so it does not re-evaluate');
});

test('an undeterminable current version ("") falls back to the prompt path, never auto-updates', async () => {
  const client = fakeClient({ installedCommit: INSTALLED }); // drift present
  const { notify, rec } = fakeNotify('Dismiss');
  const versionState = fakeVersionState('', undefined); // '' current + first-run lastSeen
  await runDaemonFreshnessCheck(deps({ client, notify, versionState }));
  assert.deepEqual(rec.actions[0], ['Update', 'Dismiss'], "'' version → startup-check prompt, not the silent auto path");
  assert.equal(client.updateCalls, 0, 'dismissed → no update');
});

// ---- reconnect-and-confirm success -----------------------------------------

test('reconnect-and-confirm success: updateOutcome().state==="succeeded" → success notify', async () => {
  // Commit does NOT advance in the fake, but a fresh succeeded outcome is authoritative.
  const client = fakeClient({
    installedCommit: INSTALLED,
    updateOutcome: async () => ({ state: 'succeeded', finishedAt: new Date(2_000).toISOString() }),
  });
  const { notify, rec } = fakeNotify('Update');
  const versionState = fakeVersionState('1.0.0', '1.0.0');
  await runDaemonFreshnessCheck(deps({ client, notify, versionState, now: () => 1_000 }));
  assert.ok(rec.messages.some((m) => /updated successfully/.test(m)), 'fresh succeeded outcome → success notify');
});

test('reconnect tolerates a socket drop across passes: throws on pass 1, confirms on pass 2', async () => {
  // The daemon is down mid-restart on the first poll (both probes throw), then
  // comes back with a fresh succeeded outcome on the second poll. now() is fixed
  // below the deadline so the loop iterates rather than timing out.
  let outcomeCalls = 0;
  let statusCalls = 0;
  const client = fakeClient({
    // The first status() is the pre-update installedCommit read (drift detected);
    // subsequent status() calls are during the restart → socket down.
    status: async () => {
      statusCalls += 1;
      if (statusCalls === 1) return { uptime: 0, repos: [], queueDepth: 0, embeddingsPending: 0, installedCommit: INSTALLED } as DaemonStatus;
      throw new Error('daemon is not running');
    },
    updateOutcome: async () => {
      outcomeCalls += 1;
      if (outcomeCalls === 1) throw new Error('ECONNREFUSED'); // still restarting
      return { state: 'succeeded', finishedAt: new Date(2_000).toISOString() };
    },
  });
  const { notify, rec } = fakeNotify('Update');
  const versionState = fakeVersionState('1.0.0', '1.0.0');
  await runDaemonFreshnessCheck(deps({ client, notify, versionState, reconnectBudgetMs: 5_000, now: () => 1_000 }));
  assert.ok(outcomeCalls >= 2, 'polled again after the transient socket drop');
  assert.ok(rec.messages.some((m) => /updated successfully/.test(m)), 'confirmed on the second pass');
});

test('a STALE succeeded outcome (finished before the update started) is ignored; commit-advance decides', async () => {
  let commit = INSTALLED;
  const client = fakeClient({
    installedCommit: () => commit,
    update: async () => { commit = UPSTREAM; return { launched: true }; },
    // finishedAt is BEFORE startedAtMs (now()===5_000) → stale → ignored.
    updateOutcome: async () => ({ state: 'failed', finishedAt: new Date(1_000).toISOString() }),
  });
  const { notify, rec } = fakeNotify('Update');
  const versionState = fakeVersionState('1.0.0', '1.0.0');
  await runDaemonFreshnessCheck(deps({ client, notify, versionState, now: () => 5_000 }));
  assert.ok(rec.messages.some((m) => /updated successfully/.test(m)), 'stale failed outcome ignored; commit advance → success');
});

// ---- failure (ac4) ---------------------------------------------------------

test('failure: update() rejects → exactly ONE failure notify with the raw error, no retry', async () => {
  const client = fakeClient({ installedCommit: INSTALLED, update: async () => { throw new Error('update already in progress'); } });
  const { notify, rec } = fakeNotify('Update');
  const versionState = fakeVersionState('1.0.0', '1.0.0');
  await runDaemonFreshnessCheck(deps({ client, notify, versionState }));

  assert.equal(client.updateCalls, 1, 'no retry — update() called once');
  const failures = rec.messages.filter((m) => /update failed/.test(m));
  assert.equal(failures.length, 1, 'exactly one failure notify');
  assert.match(failures[0]!, /update already in progress/, 'carries the raw error');
});

test('failure: updateOutcome().state==="failed" (fresh) → one failure notify carrying the raw error', async () => {
  const client = fakeClient({
    installedCommit: INSTALLED, // never advances
    updateOutcome: async () => ({ state: 'failed', error: 'npm run build exited 1', finishedAt: new Date(2_000).toISOString() }),
  });
  const { notify, rec } = fakeNotify('Update');
  const versionState = fakeVersionState('1.0.0', '1.0.0');
  await runDaemonFreshnessCheck(deps({ client, notify, versionState, now: () => 1_000 }));
  const failures = rec.messages.filter((m) => /update failed/.test(m));
  assert.equal(failures.length, 1, 'exactly one failure notify');
  assert.match(failures[0]!, /npm run build exited 1/, 'carries the raw error from updateOutcome');
});

test('failure: commit never advances within the budget → one failure notify, no second update()', async () => {
  const client = fakeClient({ installedCommit: INSTALLED, updateOutcome: async () => null }); // never confirms
  const { notify, rec } = fakeNotify('Update');
  const versionState = fakeVersionState('1.0.0', '1.0.0');
  // now() returns a value already at/after the deadline so the loop exits after one pass.
  await runDaemonFreshnessCheck(deps({ client, notify, versionState, reconnectBudgetMs: 0, now: () => 1_000 }));
  assert.equal(client.updateCalls, 1, 'no second update on timeout');
  const failures = rec.messages.filter((m) => /update failed/.test(m));
  assert.equal(failures.length, 1, 'one failure notify on reconnect timeout');
  assert.match(failures[0]!, /did not come back/, 'the timeout message');
});

test('launched:false → a single failure notify, no confirm loop', async () => {
  const client = fakeClient({ installedCommit: INSTALLED, update: async () => ({ launched: false, message: 'daemon root not resolvable' }) });
  const { notify, rec } = fakeNotify('Update');
  const versionState = fakeVersionState('1.0.0', '1.0.0');
  await runDaemonFreshnessCheck(deps({ client, notify, versionState }));
  const failures = rec.messages.filter((m) => /update failed/.test(m));
  assert.equal(failures.length, 1);
  assert.match(failures[0]!, /daemon root not resolvable/);
});

// ---- never-throws + setLastSeen on every path ------------------------------

test('never-throws: a throwing seam is swallowed; runDaemonFreshnessCheck resolves; setLastSeen still runs', async () => {
  const client = fakeClient({ installedCommit: INSTALLED });
  // notify throws when the prompt is shown — the outer backstop must swallow it.
  const versionState = fakeVersionState('1.0.0', '1.0.0');
  const throwingNotify: DaemonFreshnessDeps['notify'] = async () => { throw new Error('boom'); };
  await assert.doesNotReject(() =>
    runDaemonFreshnessCheck(deps({ client, notify: throwingNotify, versionState })),
  );
  assert.deepEqual(versionState.saved, ['1.0.0'], 'setLastSeen(current) ran despite the throw');
});

test('setLastSeen(current) is recorded on the skip path too (self-update fires once)', async () => {
  const client = fakeClient({ reachability: 'errored' });
  const { notify } = fakeNotify();
  const versionState = fakeVersionState('3.1.4', '3.1.4');
  await runDaemonFreshnessCheck(deps({ client, notify, versionState }));
  assert.deepEqual(versionState.saved, ['3.1.4']);
});
