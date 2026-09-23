/**
 * Story E20260923401ae5fb:S006 / t4 — the Debug renderer + controller + action
 * handler (sc9). Pure fns over fake gateway / logTail / consent / kill / status.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  renderDebugTab,
  createDebugTabController,
  createDebugActionHandler,
} from '../debug-renderer.js';
import { GatewayReadError, type DaemonDataGateway, type OrphanProcess } from '../types.js';
import type { LogTail } from '../log-tail.js';
import type { KillOutcome } from '../orphan-kill.js';
import type { ConsentGate, ConsentOutcome } from '../surfaces/consent-gate.js';
import type { StatusSurface } from '../surfaces/status-surface.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function fakeGateway(overrides: Partial<DaemonDataGateway> = {}): DaemonDataGateway {
  return {
    status: async () => ({ state: 'running' }),
    workflowChain: async () => ({ rows: [] }),
    mcpClients: async () => [],
    registeredRepos: async () => [],
    scanOrphans: async () => [],
    ...overrides,
  };
}

// ---- renderDebugTab -------------------------------------------------------

test('renderDebugTab: lists gateway.mcpClients() host/wired rows; empty client list renders an explicit empty-state (ac1)', async () => {
  const withClients = await renderDebugTab({ managedPid: () => undefined })(
    fakeGateway({ mcpClients: async () => [{ host: 'claude', wired: true }, { host: 'codex', wired: false }] }),
  );
  assert.match(withClients, /claude/);
  assert.match(withClients, /wired/);
  assert.match(withClients, /codex/);
  assert.match(withClients, /not wired/);

  const noClients = await renderDebugTab({ managedPid: () => undefined })(fakeGateway());
  assert.match(noClients, /No MCP clients attached/, 'an empty client list is an explicit empty-state');
});

test('renderDebugTab: orphan list EXCLUDES the managed pid; managed-only scan -> empty orphan list, no Clean-up button', async () => {
  const orphans: OrphanProcess[] = [
    { pid: 999, command: 'node out/daemon/index.js' }, // the managed daemon
  ];
  const html = await renderDebugTab({ managedPid: () => 999 })(fakeGateway({ scanOrphans: async () => orphans }));
  assert.match(html, /No orphaned processes/, 'the managed daemon is excluded -> empty orphan list');
  assert.doesNotMatch(html, /insrc-cleanup/, 'no Clean-up button when only the managed daemon is present');
});

test("renderDebugTab: the Clean-up button shows ONLY with >=1 non-managed orphan and posts {type:'action',action:'cleanupOrphans'}", async () => {
  const orphans: OrphanProcess[] = [
    { pid: 999, command: 'managed' },
    { pid: 1234, command: 'node out/bin/insrc-mcp.js' },
  ];
  const html = await renderDebugTab({ managedPid: () => 999 })(fakeGateway({ scanOrphans: async () => orphans }));
  assert.match(html, /1234/, 'the non-managed orphan is listed');
  assert.doesNotMatch(html, /999/, 'the managed pid is excluded from the list');
  assert.match(html, /id="insrc-cleanup"[^>]*data-action="cleanupOrphans"/, 'the Clean-up button posts the cleanupOrphans action');
});

test('renderDebugTab: body includes an empty <pre id="insrc-log">; every mcp/orphan value escaped; a gateway rejection propagates', async () => {
  const html = await renderDebugTab({ managedPid: () => undefined })(
    fakeGateway({
      mcpClients: async () => [{ host: '<script>x</script>', wired: true }],
      scanOrphans: async () => [{ pid: 77, command: 'node & <evil>' }],
    }),
  );
  assert.match(html, /<pre id="insrc-log"[^>]*><\/pre>/, 'an empty live-log region is present');
  assert.doesNotMatch(html, /<script>x<\/script>/, 'the mcp host is HTML-escaped');
  assert.match(html, /&lt;script&gt;/, 'escaped entities are emitted');
  assert.match(html, /node &amp; &lt;evil&gt;/, 'the orphan command is HTML-escaped');

  // A gateway rejection PROPAGATES (the host degrades the tab, not the renderer).
  await assert.rejects(
    () => renderDebugTab({ managedPid: () => undefined })(fakeGateway({ mcpClients: async () => { throw new GatewayReadError('debug-status failed'); } })),
    /debug-status failed/,
  );
});

// ---- createDebugTabController ---------------------------------------------

/** A fake LogTail whose follow emits scripted batches and records dispose. */
function fakeLogTail(): {
  tail: LogTail;
  emit: (lines: readonly string[]) => void;
  follows: number;
  disposes: number;
} {
  let sink: ((lines: readonly string[]) => void) | undefined;
  const state = { follows: 0, disposes: 0 };
  const tail: LogTail = {
    follow(onLines) {
      state.follows += 1;
      sink = onLines;
      let disposed = false;
      return () => {
        if (disposed) return; // the real createLogTail dispose is idempotent — model it.
        disposed = true;
        state.disposes += 1;
        sink = undefined;
      };
    },
  };
  return {
    tail,
    emit: (lines) => sink?.(lines),
    get follows() {
      return state.follows;
    },
    get disposes() {
      return state.disposes;
    },
  };
}

test('createDebugTabController: onActivate arms exactly ONE logTail.follow -> postMessage appendLog per emit; returned dispose is idempotent', () => {
  const t = fakeLogTail();
  const posted: unknown[] = [];
  const c = createDebugTabController({ logTail: t.tail, logger: { warn: () => {} } });
  const dispose = c.onActivate({ postMessage: (m) => posted.push(m) });
  assert.equal(t.follows, 1, 'exactly one follow is armed');

  t.emit(['line1', 'line2']);
  assert.deepEqual(posted[0], { type: 'appendLog', lines: ['line1', 'line2'] }, 'each batch is posted as an appendLog frame');
  t.emit([]);
  assert.equal(posted.length, 1, 'an empty batch posts nothing');

  dispose();
  dispose();
  assert.equal(t.disposes, 1, 'the tail dispose is called exactly once (idempotent via the tail)');
});

test('createDebugTabController: a follow-arm throw is caught (never-throw) and degrades to no ticker', () => {
  const warns: string[] = [];
  const badTail: LogTail = {
    follow() {
      throw new Error('cannot arm');
    },
  };
  const c = createDebugTabController({ logTail: badTail, logger: { warn: (m) => warns.push(m) } });
  let dispose: (() => void) | undefined;
  assert.doesNotThrow(() => {
    dispose = c.onActivate({ postMessage: () => {} });
  });
  assert.ok(warns.some((w) => /log tail/.test(w)), 'the arm failure was logged');
  assert.doesNotThrow(() => dispose?.(), 'the fallback dispose is a safe no-op');
});

// ---- createDebugActionHandler (consent-gated kill) ------------------------

function fakeConsent(outcome: ConsentOutcome): { gate: ConsentGate; asked: number } {
  const state = { asked: 0 };
  return {
    gate: {
      ask: async () => {
        state.asked += 1;
        return outcome;
      },
    },
    get asked() {
      return state.asked;
    },
  };
}

function fakeStatus(): StatusSurface {
  let snap: { state: 'running' | 'stopped' | 'errored' | 'unknown'; detail?: string } = { state: 'running' };
  return {
    set: (s) => {
      snap = s;
    },
    current: () => snap,
  };
}

test("action handler: >=1 non-managed orphan -> consent.ask; kill on 'accepted' with exactly those pids; kill NEVER on 'declined'/'dismissed' (k4)", async () => {
  const orphans: OrphanProcess[] = [
    { pid: 999, command: 'managed' },
    { pid: 111, command: 'orphan-a' },
    { pid: 222, command: 'orphan-b' },
  ];
  const killed: number[][] = [];
  const kill = async (pids: readonly number[]): Promise<KillOutcome[]> => {
    killed.push([...pids]);
    return pids.map((pid) => ({ pid, result: 'terminated' as const }));
  };

  // accepted -> kills exactly the non-managed pids.
  const accept = fakeConsent('accepted');
  const status = fakeStatus();
  const handleAccept = createDebugActionHandler({
    scanOrphans: async () => orphans,
    managedPid: () => 999,
    consent: accept.gate,
    kill,
    status,
    logger: { warn: () => {} },
  });
  handleAccept('cleanupOrphans');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(accept.asked, 1, 'consent was requested');
  assert.deepEqual(killed[0], [111, 222], 'exactly the non-managed orphans were killed');
  assert.match(status.current().detail ?? '', /cleaned up 2\/2/, 'the outcome surfaced via sc2');

  // declined -> no kill.
  killed.length = 0;
  const decline = fakeConsent('declined');
  const handleDecline = createDebugActionHandler({
    scanOrphans: async () => orphans,
    managedPid: () => 999,
    consent: decline.gate,
    kill,
    status: fakeStatus(),
    logger: { warn: () => {} },
  });
  handleDecline('cleanupOrphans');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(decline.asked, 1, 'consent was requested');
  assert.equal(killed.length, 0, 'a declined consent kills NOTHING (k4)');

  // dismissed -> no kill.
  const dismiss = fakeConsent('dismissed');
  const handleDismiss = createDebugActionHandler({
    scanOrphans: async () => orphans,
    managedPid: () => 999,
    consent: dismiss.gate,
    kill,
    status: fakeStatus(),
    logger: { warn: () => {} },
  });
  handleDismiss('cleanupOrphans');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(killed.length, 0, 'a dismissed consent kills NOTHING (k4)');
});

test('action handler: managed pid filtered before prompting; zero non-managed orphans -> NO prompt, NO kill', async () => {
  const asked = { n: 0 };
  const killed = { n: 0 };
  const handle = createDebugActionHandler({
    scanOrphans: async () => [{ pid: 999, command: 'managed' }], // only the managed daemon
    managedPid: () => 999,
    consent: { ask: async () => { asked.n += 1; return 'accepted'; } },
    kill: async () => { killed.n += 1; return []; },
    status: fakeStatus(),
    logger: { warn: () => {} },
  });
  handle('cleanupOrphans');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(asked.n, 0, 'no consent prompt when there is nothing to clean (no empty modal)');
  assert.equal(killed.n, 0, 'no kill when there is nothing to clean');
});

test("action handler: any action !== 'cleanupOrphans' is a no-op (no scan, no consent, no kill)", async () => {
  const touched = { n: 0 };
  const handle = createDebugActionHandler({
    scanOrphans: async () => { touched.n += 1; return []; },
    managedPid: () => undefined,
    consent: { ask: async () => { touched.n += 1; return 'accepted'; } },
    kill: async () => { touched.n += 1; return []; },
    status: fakeStatus(),
    logger: { warn: () => {} },
  });
  handle('somethingElse');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(touched.n, 0, 'an unknown action touches nothing');
});

test('source-scan: debug-renderer.ts imports no vscode, no cloud', () => {
  const src = readFileSync(join(HERE, '..', 'debug-renderer.ts'), 'utf8');
  assert.doesNotMatch(src, /from ['"]vscode['"]/, 'debug-renderer must not import vscode');
  assert.doesNotMatch(src, /undici|https?:\/\//, 'debug-renderer opens no cloud/HTTP path');
});

test('source-scan: the sc9 types amendment is ADDITIVE — new S006 members added, no S004/S005 member removed', () => {
  const src = readFileSync(join(HERE, '..', 'types.ts'), 'utf8');
  // New S006 members.
  assert.match(src, /export interface TabController\b/, 'TabController is exported');
  assert.match(src, /export interface TabActivationCtx\b/, 'TabActivationCtx is exported');
  assert.match(src, /tabControllers\?:\s*Partial<Record<DetailTab, TabController>>/, 'tabControllers dep added');
  assert.match(src, /onDetailAction\?:\s*\(\(action: string\) => void\)/, 'onDetailAction dep added');
  // Preserved S004/S005 members (nothing removed/renamed).
  for (const kept of ['DaemonDataGateway', 'PanelHandle', 'TabRenderer', 'detailRenderers', 'MenuPicker', 'PanelFactory']) {
    assert.ok(src.includes(kept), `${kept} is preserved (additive amendment)`);
  }
});
