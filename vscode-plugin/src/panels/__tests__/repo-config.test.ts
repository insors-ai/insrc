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
import { REPO_TRACKER_FIELDS } from '../../../../src/config/repo-fields.js';
import type { RepoSettingsPayload, SettingsResult } from '../../../../src/daemon/repo-settings.js';
import type { RepoRef } from '../types.js';
import type { ConfigWriteResult } from '../../config/types.js';
import type { ConsentGate, ConsentOutcome } from '../../surfaces/consent-gate.js';
import type { StatusSurface } from '../../surfaces/status-surface.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const REPOS: RepoRef[] = [
  { path: '/Users/x/work/a.b/repo-one', name: 'repo-one' },
  { path: '/Users/x/work/repo-two', name: 'repo-two' },
];

// The renderer's tracker dependencies: no repoFields, so the model-tier assertions below see no Tracker section.
const NO_TRACKER = {
  repoFields: async () => [],
  repoSettings: async (): Promise<SettingsResult> => ({ ok: false, error: { code: 'repo-not-registered', message: 'unused' } }),
};

// ---- renderRepoConfig -----------------------------------------------------

test('renderRepoConfig: repo <select> from registeredRepos() (folder-independent) + explicit empty-state when none', async () => {
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}) , ...NO_TRACKER })(undefined);
  assert.match(html, /<select id="insrc-repo-select">/, 'a repo picker is rendered');
  assert.match(html, /repo-one/, 'each registered repo is an option');
  assert.match(html, /repo-two/);
  assert.match(html, /Choose a repo/, 'no selection -> picker-only prompt, no form');
  assert.doesNotMatch(html, /insrc-repo-form/, 'no form until a repo is selected');

  const empty = await renderRepoConfig({ registeredRepos: async () => [], rawConfig: async () => ({}) , ...NO_TRACKER })(undefined);
  assert.match(empty, /No repos are registered/, 'empty repo list -> explicit empty-state');
  assert.doesNotMatch(empty, /<select/, 'no picker when there are no repos');
});

test('renderRepoConfig: discrete per-repo form fields from models.byRepo[repoPath].tiers (NOT raw JSON); missing entry -> all-defaults', async () => {
  const raw = {
    models: { byRepo: { '/Users/x/work/a.b/repo-one': { tiers: { core: { runner: 'ollama', model: 'qwen' } } } } },
  };
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => raw , ...NO_TRACKER })(
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
  const missing = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}) , ...NO_TRACKER })(
    '/Users/x/work/repo-two',
  );
  assert.match(missing, new RegExp(`data-segments="${coreRunner}"[^>]*value=""`), 'a missing byRepo entry -> all-defaults form');
});

test('renderRepoConfig: an unregistered selected repo falls back to picker-only', async () => {
  const html = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}) , ...NO_TRACKER })('/not/registered');
  assert.doesNotMatch(html, /insrc-repo-form/, 'a stale selection that is no longer registered renders no form');
  assert.match(html, /Choose a repo/);
});

test('renderRepoConfig: every repo path/name + field value HTML-escaped; a registeredRepos()/rawConfig() rejection propagates', async () => {
  const evilRepos: RepoRef[] = [{ path: '/r/<x>', name: '<b>&' }];
  const raw = { models: { byRepo: { '/r/<x>': { tiers: { core: { runner: '<script>x</script>' } } } } } };
  const html = await renderRepoConfig({ registeredRepos: async () => evilRepos, rawConfig: async () => raw , ...NO_TRACKER })('/r/<x>');
  assert.doesNotMatch(html, /<script>x<\/script>/, 'the field value is HTML-escaped');
  assert.match(html, /&lt;script&gt;/, 'escaped entities are emitted');
  assert.match(html, /&lt;b&gt;&amp;/, 'the repo name is escaped');

  await assert.rejects(
    () => renderRepoConfig({ registeredRepos: async () => { throw new Error('repo.list down'); }, rawConfig: async () => ({}) , ...NO_TRACKER })(undefined),
    /repo.list down/,
    'a registeredRepos() rejection propagates',
  );
  await assert.rejects(
    () => renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => { throw new Error('config.show down'); } , ...NO_TRACKER })(REPOS[0]!.path),
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
  trackerCalls: { repoPath: string; key: string; value: string | boolean | null }[];
  consentAsked: () => number;
  refreshes: () => number;
  status: StatusSurface;
} {
  const calls: { segments: readonly string[]; value: unknown }[] = [];
  const trackerCalls: { repoPath: string; key: string; value: string | boolean | null }[] = [];
  const consent = fakeConsent(over.outcome ?? 'accepted');
  const status = over.status ?? fakeStatus();
  let refreshes = 0;
  const deps: RepoConfigWriteDeps = {
    consent: consent.gate,
    writeKeyPath: async (segments, value) => {
      calls.push({ segments: [...segments], value });
      return over.writeResult ?? { ok: true };
    },
    writeRepoSetting: async (repoPath, key, value) => {
      trackerCalls.push({ repoPath, key, value });
      return over.writeResult ?? { ok: true };
    },
    registeredRepos: async () => REPOS,
    status,
    logger: { warn: () => {} },
    refresh: () => { refreshes += 1; },
    ...(over.writeKeyPath ? { writeKeyPath: over.writeKeyPath } : {}),
    ...(over.writeRepoSetting ? { writeRepoSetting: over.writeRepoSetting } : {}),
    ...(over.registeredRepos ? { registeredRepos: over.registeredRepos } : {}),
    ...(over.logger ? { logger: over.logger } : {}),
  };
  return { deps, calls, trackerCalls, consentAsked: consent.asked, refreshes: () => refreshes, status };
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

// ---- tracker section (Story s3) -------------------------------------------

const TRACKER_PAYLOAD: RepoSettingsPayload = {
  repo: REPOS[0]!.path,
  values: { type: 'github', owner: 'acme', repo: 'widgets', ghHost: 'ghe.example.com' },
  resolved: { type: 'github', owner: 'acme', repo: 'widgets', source: 'per-repo-config' },
  signin: { state: 'signed-in', login: 'octocat' },
  policy: {
    ok: true, mode: 'team',
    values: { teamMode: true, signoffStages: ['DEF', 'HLD'], claimsEnforced: true, administrators: ['ada'],
      claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true },
    source: { ref: 'origin/main', fetchedAt: '2026-10-17T00:00:00.000Z' },
  },
};

const trackerRenderer = (result: SettingsResult | (() => Promise<SettingsResult>)) =>
  renderRepoConfig({
    registeredRepos: async () => REPOS,
    rawConfig: async () => ({}),
    repoFields: async () => REPO_TRACKER_FIELDS,
    repoSettings: typeof result === 'function' ? result : async () => result,
  });

test('renderRepoConfig: the Tracker section lists local rows as inputs (including ghHost) and status and policy rows read-only', async () => {
  const html = await trackerRenderer({ ok: true, payload: TRACKER_PAYLOAD })(REPOS[0]!.path);
  assert.match(html, /id="insrc-tracker"/);
  // Every local row is an input posting its key; the stored value pre-fills it.
  for (const key of ['type', 'owner', 'repo', 'ghPath', 'ghHost', 'branchPattern']) {
    assert.match(html, new RegExp(`data-tracker-key="${key}"`), `${key} is editable`);
  }
  assert.match(html, /data-tracker-key="ghHost" value="ghe\.example\.com"/);
  assert.match(html, /data-tracker-key="owner" value="acme"/);
  // Status and policy rows are NOT inputs.
  for (const key of ['signin', 'target', 'teamMode', 'signoffStages', 'claimsEnforced', 'claimUnits', 'administrators', 'forceTaskIssues']) {
    assert.doesNotMatch(html, new RegExp(`data-tracker-key="${key}"`), `${key} is read-only`);
    assert.match(html, new RegExp(`data-readonly-key="${key}"`), `${key} is shown`);
  }
  assert.match(html, /DEF, HLD/);
  assert.match(html, /epic: DEF, HLD · story: LLD, PLAN · task: BUILD/);
  assert.match(html, /saved; not used yet/);
  // The model-tier form is still there, unchanged.
  assert.match(html, /insrc-repo-form/);
  assert.match(html, /data-segments=/);
});

test('renderRepoConfig: the sign-in row is rendered read-only with status and reason', async () => {
  const states: Array<[RepoSettingsPayload['signin'], RegExp]> = [
    [{ state: 'signed-in', login: 'octocat' }, /signed in as octocat/],
    [{ state: 'missing-tool', reason: 'gh was not found' }, /missing-tool: gh was not found/],
    [{ state: 'missing-signin', reason: 'gh is not signed in' }, /missing-signin: gh is not signed in/],
    [{ state: 'unreachable', reason: 'timed out' }, /unreachable: timed out/],
    [{ state: 'rejected', reason: 'bad credentials' }, /rejected: bad credentials/],
    [{ state: 'disabled', reason: 'the tracker is off for this repo' }, /disabled: the tracker is off for this repo/],
  ];
  for (const [signin, re] of states) {
    const html = await trackerRenderer({ ok: true, payload: { ...TRACKER_PAYLOAD, signin } })(REPOS[0]!.path);
    const row = /<label[^>]*>Sign-in [\s\S]*?<\/label>/.exec(html)?.[0] ?? '';
    assert.match(row, /data-readonly-key="signin"/);
    assert.match(row, re);
    assert.doesNotMatch(row, /<input/, 'the sign-in row is never an input');
    assert.match(row, /\(read-only\)/);
  }
});

test('renderRepoConfig: an ok:false result shows its message; no repoFields renders no Tracker section; a transport rejection propagates; values are escaped', async () => {
  const refused = await trackerRenderer({ ok: false, error: { code: 'github-json-unreadable', message: '/h/.insrc/github.json: is not valid JSON' } })(REPOS[0]!.path);
  assert.match(refused, /class="error">\/h\/\.insrc\/github\.json: is not valid JSON</);
  assert.doesNotMatch(refused, /data-tracker-key/);
  assert.match(refused, /insrc-repo-form/, 'the model-tier form still renders');

  const none = await renderRepoConfig({ registeredRepos: async () => REPOS, rawConfig: async () => ({}), ...NO_TRACKER })(REPOS[0]!.path);
  assert.doesNotMatch(none, /insrc-tracker/);

  await assert.rejects(() => trackerRenderer(async () => { throw new Error('repo.settings.get down'); })(REPOS[0]!.path), /repo.settings.get down/);

  const evil = await trackerRenderer({ ok: true, payload: { ...TRACKER_PAYLOAD, values: { ...TRACKER_PAYLOAD.values, ghHost: '"><script>x</script>' } } })(REPOS[0]!.path);
  assert.doesNotMatch(evil, /<script>x<\/script>/);
  assert.match(evil, /&lt;script&gt;/);
});

test("createRepoConfigWriteHandler: a tracker edit goes through consent to writeRepoSetting and never to the models.byRepo route", async () => {
  const f = makeWriteDeps({ outcome: 'accepted' });
  createRepoConfigWriteHandler(f.deps)({ repoPath: REPOS[0]!.path, key: 'ghHost', value: 'ghe.example.com' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(f.consentAsked(), 1);
  assert.deepEqual(f.trackerCalls, [{ repoPath: REPOS[0]!.path, key: 'ghHost', value: 'ghe.example.com' }]);
  assert.deepEqual(f.calls, [], 'the models.byRepo writeKeyPath route was not used');
  assert.match(f.status.current().detail ?? '', /updated ghHost/);
  assert.equal(f.refreshes(), 1);

  // null clears.
  const clear = makeWriteDeps({ outcome: 'accepted' });
  createRepoConfigWriteHandler(clear.deps)({ repoPath: REPOS[0]!.path, key: 'ghPath', value: null });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(clear.trackerCalls, [{ repoPath: REPOS[0]!.path, key: 'ghPath', value: null }]);

  // The existing route is unchanged beside it.
  const model = makeWriteDeps({ outcome: 'accepted' });
  createRepoConfigWriteHandler(model.deps)({ repoPath: REPOS[0]!.path, segments: ['tiers', 'core', 'runner'], value: 'ollama' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(model.trackerCalls, []);
  assert.equal(model.calls.length, 1);
});

test('createRepoConfigWriteHandler: declined consent, an unregistered repo and a malformed tracker write write nothing; a refusal shows the daemon message', async () => {
  const declined = makeWriteDeps({ outcome: 'declined' });
  createRepoConfigWriteHandler(declined.deps)({ repoPath: REPOS[0]!.path, key: 'ghHost', value: 'x' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(declined.consentAsked(), 1);
  assert.deepEqual(declined.trackerCalls, [], 'a declined consent writes NOTHING (k4)');

  const unreg = makeWriteDeps({ outcome: 'accepted' });
  createRepoConfigWriteHandler(unreg.deps)({ repoPath: '/not/registered', key: 'ghHost', value: 'x' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(unreg.consentAsked(), 0);
  assert.deepEqual(unreg.trackerCalls, []);

  for (const bad of [{ key: '', value: 'x' }, { key: 'ghHost', value: 5 }, { key: 'ghHost', value: undefined }, { key: 'ghHost', value: ['a'] }]) {
    const f = makeWriteDeps({ outcome: 'accepted' });
    createRepoConfigWriteHandler(f.deps)({ repoPath: REPOS[0]!.path, ...bad } as never);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(f.consentAsked(), 0, JSON.stringify(bad));
    assert.deepEqual(f.trackerCalls, []);
  }

  const refused = makeWriteDeps({ outcome: 'accepted', writeResult: { ok: false, reason: 'branchPattern must not start with a slash' } });
  createRepoConfigWriteHandler(refused.deps)({ repoPath: REPOS[0]!.path, key: 'branchPattern', value: '/x' });
  await new Promise((r) => setTimeout(r, 0));
  assert.match(refused.status.current().detail ?? '', /tracker setting refused: branchPattern must not start with a slash/);
  assert.equal(refused.refreshes(), 1, 'the panel re-read even on refusal');

  const warns: string[] = [];
  const rejecting = makeWriteDeps({ outcome: 'accepted', writeRepoSetting: async () => { throw new Error('socket down'); }, logger: { warn: (m) => warns.push(m) } });
  await assert.doesNotReject(async () => {
    createRepoConfigWriteHandler(rejecting.deps)({ repoPath: REPOS[0]!.path, key: 'ghHost', value: 'x' });
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.ok(warns.some((w) => /tracker setting write failed/.test(w)));
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
  assert.match(src, /export (interface|type) RepoConfigWrite\b/);
  assert.match(src, /export interface RepoTrackerWrite\b/);
  assert.match(src, /repoRenderer\?:\s*RepoConfigRenderer/);
  assert.match(src, /onRepoConfigWrite\?:\s*\(\(write: RepoConfigWrite\) => void\)/);
  for (const kept of ['detailRenderers', 'tabControllers', 'onDetailAction', 'DaemonDataGateway', 'PanelHandle', 'TabRenderer']) {
    assert.ok(src.includes(kept), `${kept} is preserved (additive amendment)`);
  }
});
