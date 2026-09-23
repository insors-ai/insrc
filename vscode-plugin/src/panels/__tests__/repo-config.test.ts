/**
 * Story E20260923401ae5fb:S007 / t2 — the Repo Configuration core (sc9).
 * renderRepoConfig + createRepoConfigWriteHandler over injected fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { renderRepoConfig, createRepoConfigWriteHandler, type RepoConfigWriteDeps } from '../repo-config.js';
import { escapeHtml } from '../html.js';
import type { RepoRef } from '../types.js';
import type { ConfigWriteResult } from '../../config/types.js';
import type { ConsentGate, ConsentOutcome } from '../../surfaces/consent-gate.js';
import type { StatusSurface } from '../../surfaces/status-surface.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const REPOS: RepoRef[] = [
  { path: '/Users/x/work/a.b/repo-one', name: 'repo-one' },
  { path: '/Users/x/work/repo-two', name: 'repo-two' },
];

// ---- renderRepoConfig -----------------------------------------------------

test('renderRepoConfig: repo <select> from registeredRepos() (folder-independent) + explicit empty-state when none', async () => {
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}) })(undefined);
  assert.match(html, /<select id="insrc-repo-select">/, 'a repo picker is rendered');
  assert.match(html, /repo-one/, 'each registered repo is an option');
  assert.match(html, /repo-two/);
  assert.match(html, /Choose a repo/, 'no selection -> picker-only prompt, no form');
  assert.doesNotMatch(html, /insrc-repo-form/, 'no form until a repo is selected');

  const empty = await renderRepoConfig({ registeredRepos: async () => [], rawConfig: async () => ({}) })(undefined);
  assert.match(empty, /No repos are registered/, 'empty repo list -> explicit empty-state');
  assert.doesNotMatch(empty, /<select/, 'no picker when there are no repos');
});

test('renderRepoConfig: discrete per-repo form fields from models.byRepo[repoPath].tiers (NOT raw JSON); missing entry -> all-defaults', async () => {
  const raw = {
    models: { byRepo: { '/Users/x/work/a.b/repo-one': { tiers: { core: { runner: 'ollama', model: 'qwen' } } } } },
  };
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => raw })(
    '/Users/x/work/a.b/repo-one',
  );
  // The trailing segments are carried as a JSON array (escapeHtml'd), NOT a dot-joined
  // string — so a future dotted segment (a dotted roleId) cannot mis-nest.
  const reEsc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const coreRunner = reEsc(escapeHtml(JSON.stringify(['tiers', 'core', 'runner'])));
  const coreModel = reEsc(escapeHtml(JSON.stringify(['tiers', 'core', 'model'])));
  const midRunner = reEsc(escapeHtml(JSON.stringify(['tiers', 'mid', 'runner'])));
  assert.match(html, /id="insrc-repo-form" data-repo="\/Users\/x\/work\/a\.b\/repo-one"/, 'the form carries the selected repoPath');
  assert.match(html, new RegExp(`data-segments="${coreRunner}"[^>]*value="ollama"`), 'the stored core.runner value pre-fills the field');
  assert.match(html, new RegExp(`data-segments="${coreModel}"[^>]*value="qwen"`));
  assert.match(html, new RegExp(`data-segments="${midRunner}"[^>]*value=""`), 'an unset field is blank (using default)');
  assert.doesNotMatch(html, /<textarea/, 'the overrides are discrete fields, NOT a raw-JSON textarea (ac3)');

  // A repo with NO byRepo entry -> all fields blank (all-defaults).
  const missing = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}) })(
    '/Users/x/work/repo-two',
  );
  assert.match(missing, new RegExp(`data-segments="${coreRunner}"[^>]*value=""`), 'a missing byRepo entry -> all-defaults form');
});

test('renderRepoConfig: an unregistered selected repo falls back to picker-only', async () => {
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}) })('/not/registered');
  assert.doesNotMatch(html, /insrc-repo-form/, 'a stale selection that is no longer registered renders no form');
  assert.match(html, /Choose a repo/);
});

test('renderRepoConfig: every repo path/name + field value HTML-escaped; a registeredRepos()/rawConfig() rejection propagates', async () => {
  const evilRepos: RepoRef[] = [{ path: '/r/<x>', name: '<b>&' }];
  const raw = { models: { byRepo: { '/r/<x>': { tiers: { core: { runner: '<script>x</script>' } } } } } };
  const html = await renderRepoConfig({ registeredRepos: async () => evilRepos, rawConfig: async () => raw })('/r/<x>');
  assert.doesNotMatch(html, /<script>x<\/script>/, 'the field value is HTML-escaped');
  assert.match(html, /&lt;script&gt;/, 'escaped entities are emitted');
  assert.match(html, /&lt;b&gt;&amp;/, 'the repo name is escaped');

  await assert.rejects(
    () => renderRepoConfig({ registeredRepos: async () => { throw new Error('repo.list down'); }, rawConfig: async () => ({}) })(undefined),
    /repo.list down/,
    'a registeredRepos() rejection propagates',
  );
  await assert.rejects(
    () => renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => { throw new Error('config.show down'); } })(REPOS[0]!.path),
    /config.show down/,
    'a rawConfig() rejection propagates',
  );
});

// ---- createRepoConfigWriteHandler -----------------------------------------

function fakeConsent(outcome: ConsentOutcome): { gate: ConsentGate; asked: () => number } {
  let n = 0;
  return { gate: { ask: async () => { n += 1; return outcome; } }, asked: () => n };
}

function fakeStatus(): StatusSurface {
  let snap: { state: 'running' | 'stopped' | 'errored' | 'unknown'; detail?: string } = { state: 'running' };
  return { set: (s) => { snap = s; }, current: () => snap };
}

function makeWriteDeps(over: Partial<RepoConfigWriteDeps> & { outcome?: ConsentOutcome; writeResult?: ConfigWriteResult } = {}): {
  deps: RepoConfigWriteDeps;
  calls: { segments: readonly string[]; value: unknown }[];
  consentAsked: () => number;
  refreshes: () => number;
  status: StatusSurface;
} {
  const calls: { segments: readonly string[]; value: unknown }[] = [];
  const consent = fakeConsent(over.outcome ?? 'accepted');
  const status = over.status ?? fakeStatus();
  let refreshes = 0;
  const deps: RepoConfigWriteDeps = {
    consent: consent.gate,
    writeKeyPath: async (segments, value) => {
      calls.push({ segments: [...segments], value });
      return over.writeResult ?? { ok: true };
    },
    registeredRepos: async () => REPOS,
    status,
    logger: { warn: () => {} },
    refresh: () => { refreshes += 1; },
    ...(over.writeKeyPath ? { writeKeyPath: over.writeKeyPath } : {}),
    ...(over.registeredRepos ? { registeredRepos: over.registeredRepos } : {}),
    ...(over.logger ? { logger: over.logger } : {}),
  };
  return { deps, calls, consentAsked: consent.asked, refreshes: () => refreshes, status };
}

test("createRepoConfigWriteHandler: on 'accepted' writeKeyPath called with EXACTLY ['models','byRepo',repoPath,...segments] + value (ac2 array form)", async () => {
  const f = makeWriteDeps({ outcome: 'accepted' });
  createRepoConfigWriteHandler(f.deps)({ repoPath: REPOS[0]!.path, segments: ['tiers', 'core', 'runner'], value: 'ollama' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(f.consentAsked(), 1, 'consent was requested');
  assert.deepEqual(f.calls, [{ segments: ['models', 'byRepo', REPOS[0]!.path, 'tiers', 'core', 'runner'], value: 'ollama' }]);
  assert.match(f.status.current().detail ?? '', /updated tiers\.core\.runner/, 'the outcome surfaced via sc2');
  assert.equal(f.refreshes(), 1, 'the panel re-rendered from fresh config');
});

test("createRepoConfigWriteHandler: declined/dismissed consent writes NEVER (k4); unregistered/malformed write dropped without consent", async () => {
  // declined -> no write.
  const declined = makeWriteDeps({ outcome: 'declined' });
  createRepoConfigWriteHandler(declined.deps)({ repoPath: REPOS[0]!.path, segments: ['tiers', 'core', 'runner'], value: 'x' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(declined.consentAsked(), 1);
  assert.deepEqual(declined.calls, [], 'a declined consent writes NOTHING (k4)');

  // dismissed -> no write.
  const dismissed = makeWriteDeps({ outcome: 'dismissed' });
  createRepoConfigWriteHandler(dismissed.deps)({ repoPath: REPOS[0]!.path, segments: ['tiers', 'core', 'runner'], value: 'x' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(dismissed.calls, [], 'a dismissed consent writes NOTHING (k4)');

  // unregistered repo -> no consent, no write.
  const unreg = makeWriteDeps({ outcome: 'accepted' });
  createRepoConfigWriteHandler(unreg.deps)({ repoPath: '/not/registered', segments: ['tiers', 'core', 'runner'], value: 'x' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(unreg.consentAsked(), 0, 'an unregistered repo is not even prompted');
  assert.deepEqual(unreg.calls, [], 'an unregistered repo writes NOTHING (lc1)');

  // malformed write -> no consent, no write.
  const bad = makeWriteDeps({ outcome: 'accepted' });
  createRepoConfigWriteHandler(bad.deps)({ repoPath: '', segments: [], value: 'x' } as never);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(bad.consentAsked(), 0, 'a malformed write is dropped before consent');
  assert.deepEqual(bad.calls, []);
});

test("createRepoConfigWriteHandler: {ok:false} refusal surfaces the reason via sc2 + refresh; a writeKeyPath rejection is caught, never throws", async () => {
  // refusal -> surfaces reason + refresh, no throw.
  const refused = makeWriteDeps({ outcome: 'accepted', writeResult: { ok: false, reason: 'invalid path' } });
  await assert.doesNotReject(async () => {
    createRepoConfigWriteHandler(refused.deps)({ repoPath: REPOS[0]!.path, segments: ['tiers', 'core', 'runner'], value: 'x' });
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.match(refused.status.current().detail ?? '', /refused: invalid path/, 'the daemon reason surfaced via sc2');
  assert.equal(refused.refreshes(), 1, 'the panel re-read (truthful) even on refusal');

  // writeKeyPath rejection -> caught + logged, never throws.
  const warns: string[] = [];
  const rejecting = makeWriteDeps({
    outcome: 'accepted',
    writeKeyPath: async () => { throw new Error('socket down'); },
    logger: { warn: (m) => warns.push(m) },
  });
  await assert.doesNotReject(async () => {
    createRepoConfigWriteHandler(rejecting.deps)({ repoPath: REPOS[0]!.path, segments: ['tiers', 'core', 'runner'], value: 'x' });
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.ok(warns.some((w) => /per-repo config write failed/.test(w)), 'the write rejection was caught + logged');
});

// ---- source guards --------------------------------------------------------

test('source-scan: repo-config.ts imports no vscode, no cloud; and reaches the daemon only via the sc8 writeKeyPath/rawConfig (k3)', () => {
  const src = readFileSync(join(HERE, '..', 'repo-config.ts'), 'utf8');
  const imports = [...src.matchAll(/^\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
  assert.ok(!imports.some((s) => s === 'vscode'), 'repo-config must not import vscode');
  assert.ok(!imports.some((s) => /undici|^https?:/.test(s)), 'repo-config imports no cloud/HTTP client');
  // No IPC method literals — the write path goes through the injected sc8 writeKeyPath (config.write).
  assert.doesNotMatch(src, /['"]config\.(catalog|show|write)['"]/, 'no direct config IPC literal (goes through the sc8 gateway)');
});

test('source-scan: the sc9 types amendment is ADDITIVE — S007 members added, no S004/S005/S006 member removed', () => {
  const src = readFileSync(join(HERE, '..', 'types.ts'), 'utf8');
  assert.match(src, /export type RepoConfigRenderer\b/);
  assert.match(src, /export interface RepoConfigRendererDeps\b/);
  assert.match(src, /export interface RepoConfigWrite\b/);
  assert.match(src, /repoRenderer\?:\s*RepoConfigRenderer/);
  assert.match(src, /onRepoConfigWrite\?:\s*\(\(write: RepoConfigWrite\) => void\)/);
  for (const kept of ['detailRenderers', 'tabControllers', 'onDetailAction', 'DaemonDataGateway', 'PanelHandle', 'TabRenderer']) {
    assert.ok(src.includes(kept), `${kept} is preserved (additive amendment)`);
  }
});
