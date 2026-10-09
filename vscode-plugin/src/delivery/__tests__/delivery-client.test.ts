/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s1 / sc1 — the delivery client: request shape, typed failures, deadlines, and read-only use of the daemon's handler. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { handleDelivery, handleDeliveryEvidence } from '../../../../src/workflow/delivery/handlers.js';
import { createDeliveryClient, type DeliveryClientDeps } from '../delivery-client.js';

interface Call { readonly method: string; readonly params: unknown }

/** A fake rpc that records calls and answers each with the responder's value (or rejection). */
function fakeRpc(responder: (method: string, params: unknown) => Promise<unknown>): { rpc: DeliveryClientDeps['rpc']; calls: Call[] } {
  const calls: Call[] = [];
  const rpc = (async (method: string, params?: unknown) => {
    calls.push({ method, params });
    return responder(method, params);
  }) as DeliveryClientDeps['rpc'];
  return { rpc, calls };
}

const DEADLINES = { snapshot: 50, evidence: 50 };
const SNAPSHOT = { schemaVersion: 1, repo: '/ws', takenAt: '2026-10-09T00:00:00.000Z', recordCount: 0, unreadableCount: 0, items: [], rootIds: [], notices: [], counts: {}, attentionRule: '' };

test('snapshot and evidence send the workspace repo and nothing is sent without a workspace', async () => {
  const { rpc, calls } = fakeRpc(async (method) => (method === 'workflow.delivery' ? SNAPSHOT : { artifactId: 'LLD-x', kind: 'LLD', meta: {}, body: {}, renderedMarkdown: null }));
  const client = createDeliveryClient({ rpc, repo: '/ws', deadlinesMs: DEADLINES });
  assert.equal((await client.snapshot()).ok, true);
  assert.equal((await client.evidence('LLD-aaaaaaaaaaaaaaaa-s1')).ok, true);
  assert.deepEqual(calls, [
    { method: 'workflow.delivery', params: { repo: '/ws' } },
    { method: 'workflow.deliveryEvidence', params: { repo: '/ws', artifactId: 'LLD-aaaaaaaaaaaaaaaa-s1' } },
  ]);

  const none = fakeRpc(async () => SNAPSHOT);
  const noFolder = createDeliveryClient({ rpc: none.rpc, repo: null, deadlinesMs: DEADLINES });
  const s = await noFolder.snapshot();
  const e = await noFolder.evidence('LLD-aaaaaaaaaaaaaaaa-s1');
  assert.deepEqual([s.ok ? null : s.failure.kind, e.ok ? null : e.failure.kind], ['no-workspace', 'no-workspace']);
  assert.equal(none.calls.length, 0, 'the daemon is not called without a workspace');
});

test('the client classifies a missing workspace, a stopped daemon, a daemon error, a timeout and an unknown schemaVersion into their own failure kinds', async () => {
  const kindOf = async (responder: () => Promise<unknown>, repo: string | null = '/ws'): Promise<string> => {
    const { rpc } = fakeRpc(responder);
    const r = await createDeliveryClient({ rpc, repo, deadlinesMs: DEADLINES }).snapshot();
    return r.ok ? 'ok' : r.failure.kind;
  };
  assert.equal(await kindOf(async () => SNAPSHOT, null), 'no-workspace');
  assert.equal(await kindOf(async () => { throw new Error('daemon is not running — start it with: insrc daemon start'); }), 'daemon-unavailable');
  assert.equal(await kindOf(async () => { throw new Error('Unknown method: workflow.delivery'); }), 'read-failed', 'an older daemon without the method');
  assert.equal(await kindOf(async () => ({ error: 'workflow.delivery: delivery: artifact store cannot be read' })), 'read-failed', "the daemon's { error } arm");
  assert.equal(await kindOf(async () => ({ ...SNAPSHOT, schemaVersion: 2 })), 'read-failed');
  assert.equal(await kindOf(async () => ({ ...SNAPSHOT, items: undefined })), 'read-failed', 'a schemaVersion-1 answer without an items list');
  assert.equal(await kindOf(async () => ({ ...SNAPSHOT, notices: 'x' })), 'read-failed');
  assert.equal(await kindOf(async () => 'not an object'), 'read-failed');
  assert.equal(await kindOf(async () => SNAPSHOT), 'ok');

  // A never-settling call times out, and a late answer after the deadline is ignored.
  let release: ((v: unknown) => void) | undefined;
  const { rpc } = fakeRpc(() => new Promise((resolve) => { release = resolve; }));
  const late = createDeliveryClient({ rpc, repo: '/ws', deadlinesMs: { snapshot: 20, evidence: 20 } });
  const timedOut = await late.snapshot();
  assert.equal(timedOut.ok ? 'ok' : timedOut.failure.kind, 'timed-out');
  release?.(SNAPSHOT);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(timedOut.ok, false, 'the late answer does not change the settled result');

  // Neither method rejects, whatever rpc does.
  const throwing = createDeliveryClient({ rpc: (() => { throw new Error('boom'); }) as DeliveryClientDeps['rpc'], repo: '/ws', deadlinesMs: DEADLINES });
  const t1 = await throwing.snapshot();
  const t2 = await throwing.evidence('LLD-aaaaaaaaaaaaaaaa-s1');
  assert.deepEqual([t1.ok ? 'ok' : t1.failure.kind, t2.ok ? 'ok' : t2.failure.kind], ['read-failed', 'read-failed']);
});

/** Every file under root (including .git) with size, mtime and content, so any write shows up. */
function treeOf(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) { walk(abs); continue; }
      const st = statSync(abs);
      out.set(abs, `${st.size}:${st.mtimeMs}:${readFileSync(abs, 'utf8')}`);
    }
  };
  walk(root);
  return out;
}

test('opening and refreshing against a temporary git repository leaves the store, docs and git untouched', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'insrc-board-client-'));
  const EPIC = 'aaaaaaaaaaaaaaaa';
  const CREATED = '2026-10-07T09:00:00.000Z';
  const files: Record<string, string> = {
    [`.insrc/artifacts/DEF-${EPIC}.json`]: JSON.stringify({ meta: { epicHash: EPIC, epicSlug: 'my-epic', createdAt: CREATED, epicCreatedAt: CREATED, approvedAt: CREATED }, body: { epic: { title: 'My epic' }, stories: [{ id: 's1', title: 'One' }] } }),
    [`.insrc/artifacts/LLD-${EPIC}-s1.json`]: JSON.stringify({ meta: { epicHash: EPIC, epicSlug: 'my-epic', storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} }),
    ['docs/epics/my-epic-E20261007aaaaaaaa/DEF.md']: `<!-- insrc:artifact DEF-${EPIC} -->\n# Define\n`,
  };
  try {
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(repo, rel)), { recursive: true });
      writeFileSync(join(repo, rel), text);
    }
    const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    git('init', '-q');
    git('add', '-A');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'seed');
    const before = treeOf(repo);
    const head = git('rev-parse', 'HEAD');

    // The daemon's real handlers stand in for the socket.
    const rpc = (async (method: string, params?: unknown) => (method === 'workflow.delivery'
      ? handleDelivery(params as { repo?: string }, undefined)
      : handleDeliveryEvidence(params as { repo?: string; artifactId: string }, undefined))) as DeliveryClientDeps['rpc'];
    const client = createDeliveryClient({ rpc, repo, deadlinesMs: { snapshot: 5_000, evidence: 5_000 } });
    for (let i = 0; i < 3; i++) {
      const r = await client.snapshot();
      assert.ok(r.ok, r.ok ? '' : r.failure.message);
      assert.equal(r.value.recordCount, 2);
    }
    assert.ok((await client.evidence(`LLD-${EPIC}-s1`)).ok);

    assert.deepEqual(treeOf(repo), before, 'no file under the repository changed');
    assert.equal(git('status', '--porcelain'), '');
    assert.equal(git('rev-parse', 'HEAD'), head);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
